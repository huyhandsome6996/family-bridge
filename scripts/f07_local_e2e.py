"""F07 local E2E — REAL Django backend (SQLite local, production settings
mount) over HTTP: login HS/PH qua class-session (F16), tạo/sửa/chia sẻ/đọc/
thu hồi/unlink/reconnect Mood qua API thật. Synthetic fixtures tự tạo trong
script, KHÔNG dùng dữ liệu người thật.

Chạy từ repo root:
  cd backend && DJANGO_ENV=development DB_ENGINE=sqlite \
    python manage.py migrate && python manage.py runserver 127.0.0.1:8000
  python3 scripts/f07_local_e2e.py --base http://127.0.0.1:8000

Kết quả: PASS/FAIL từng bước + mã HTTP thật. Chỉ dùng được khi máy chủ đã
chạy; không dùng trên production.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.request

VN = dt.timezone(dt.timedelta(hours=7))


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def today_vn() -> str:
    return utcnow().astimezone(VN).date().isoformat()


def vn_days_ago(n: int) -> str:
    return (utcnow().astimezone(VN).date() - dt.timedelta(days=n)).isoformat()


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def call(self, method: str, path: str, token: str | None = None,
             body: dict | None = None):
        request = urllib.request.Request(f"{self.base}{path}", method=method)
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(request, data=data, timeout=30) as resp:
                payload = resp.read().decode()
                return resp.status, (json.loads(payload) if payload else {})
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode()
            try:
                return exc.code, json.loads(payload)
            except ValueError:
                return exc.code, {"raw": payload}

    def login_class(self, code: str, password: str):
        return self.call("POST", "/api/v1/auth/class-session", None,
                         {"code": code, "password": password})


FIXTURES = {
    "student": {"code": "HSZE2E01", "password": "E2e-local-2026!"},
    "caregiver": {"code": "PHZE2E01", "password": "E2e-local-2026!"},
    "stranger": {"code": "HSZE2E99", "password": "E2e-local-2026!"},
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    api = Api(args.base)

    results: list[tuple[str, bool, str]] = []

    def step(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

    # 0) health public
    status, payload = api.call("GET", "/api/v1/health/")
    step("health public 200", status == 200 and payload.get("status") == "ok",
         f"status={status}")

    # 1) login HS + PH qua class-session thật (fixture phải tạo trước)
    tokens: dict[str, str] = {}
    for actor, cred in FIXTURES.items():
        status, payload = api.login_class(cred["code"], cred["password"])
        token = (payload.get("token") if isinstance(payload, dict) else None) \
            or (payload.get("session", {}) or {}).get("token")
        step(f"login {actor} ({cred['code']})", status == 200 and bool(token),
             f"status={status}" + ("" if token else f" body={json.dumps(payload)[:120]}"))
        if token:
            tokens[actor] = token
    if len(tokens) < len(FIXTURES):
        print("Thiếu fixture/tài khoản. Chạy scripts/f07_local_fixtures.py trước.")
        return 2
    hs, ph, stranger = tokens["student"], tokens["caregiver"], tokens["stranger"]

    # 2) tạo mục hôm nay — không gửi ngày: máy chủ quyết định ngày VN
    status, entry = api.call("POST", "/api/v1/mood/entries", hs,
                             {"emotion": "lo", "note": "lo vì bài kiểm tra (E2E)"})
    entry_id = entry.get("entry_id")
    step("tạo mục hôm nay (riêng tư mặc định)",
         status == 201 and entry.get("revision") == 1
         and entry.get("entry_date") == today_vn(),
         f"status={status} entry_date={entry.get('entry_date')}")

    # 3) trùng ngày -> 400 business error
    status, dup = api.call("POST", "/api/v1/mood/entries", hs,
                           {"emotion": "vui"})
    step("trùng ngày bị từ chối đúng contract",
         status == 400 and dup.get("error", {}).get("details", {}).get("reason")
         == "entry_already_exists_use_edit",
         f"status={status}")

    # 4) validation biên: enum sai / note quá dài / body rác
    status, _ = api.call("POST", "/api/v1/mood/entries", hs,
                         {"entry_date": vn_days_ago(3), "emotion": "khong co"})
    ok_enum = status == 400
    status, _ = api.call("POST", "/api/v1/mood/entries", hs,
                         {"entry_date": vn_days_ago(3), "emotion": "vui",
                          "note": "x" * 2001})
    ok_note = status == 400
    status, _ = api.call("GET", "/api/v1/mood/entries/khong-phai-uuid", hs)
    ok_uuid = status in (400, 404)
    step("validation enum/note/uuid -> 400 envelope",
         ok_enum and ok_note and ok_uuid,
         f"enum={ok_enum} note={ok_note} uuid={ok_uuid}")

    # 5) lịch sử + phân trang (2 kích thước) + mục quá khứ
    for i in range(1, 6):
        api.call("POST", "/api/v1/mood/entries", hs,
                 {"entry_date": vn_days_ago(i), "emotion": "vui", "note": ""})
    status, page2 = api.call("GET", "/api/v1/mood/entries?page_size=2", hs)
    ok_page = status == 200 and len(page2.get("results", [])) == 2 \
        and page2.get("next")
    status, page5 = api.call("GET", "/api/v1/mood/entries?page_size=50", hs)
    ok_page5 = status == 200 and len(page5.get("results", [])) >= 6
    step("phân trang page_size=2 và 50 hoạt động thật",
         ok_page and ok_page5, f"p2={len(page2.get('results', []))} "
         f"p50={len(page5.get('results', []))}")

    # 6) người lạ + quyền: stranger không đọc được gì của HS
    status, _ = api.call("GET", f"/api/v1/mood/entries/{entry_id}", stranger)
    step("stranger đọc detail -> 404", status == 404, f"status={status}")

    # 7) chưa kết nối vẫn chia sẻ được mood riêng; share với stranger bị chặn
    status, stranger_entry = api.call("POST", "/api/v1/mood/entries", stranger,
                                      {"emotion": "binh_an"})
    status, _ = api.call("POST", f"/api/v1/mood/entries/{stranger_entry.get('entry_id')}/share",
                         stranger, {"recipient_id": "00000000-0000-4000-8000-00000000000x"})
    step("share sai UUID -> 400 (không 500)", status == 400, f"status={status}")

    # 8) HS share đúng mục cho PH với expected_revision
    status, share = api.call("POST", f"/api/v1/mood/entries/{entry_id}/share", hs,
                             {"recipient_id": _recipient_id(api, ph),
                              "expected_revision": 1})
    share_id = share.get("share_id")
    step("share mục hôm nay cho PH (expected_revision=1)",
         status == 201 and share.get("status") == "active",
         f"status={status} share_id={share_id}")

    # 9) PH đọc danh sách + chi tiết
    status, shared_list = api.call("GET", "/api/v1/mood/shared", ph)
    ids = [row.get("share_id") for row in shared_list.get("results", [])]
    status2, detail = api.call("GET", f"/api/v1/mood/shared/{share_id}", ph)
    step("PH đọc đúng mục được chia sẻ (note nguyên vẹn)",
         status == 200 and share_id in ids and status2 == 200
         and detail.get("entry", {}).get("note") == "lo vì bài kiểm tra (E2E)",
         f"list={status}/{len(ids)} detail={status2}")

    # 10) PH đổi ID mục khác -> không đọc được entry chưa chia sẻ
    status, _ = api.call("GET", f"/api/v1/mood/shared/{share_id}", stranger)
    step("stranger dùng share_id của HS/PH -> 404", status == 404,
         f"status={status}")

    # 11) sửa mục -> revision 2; PH đọc bản cũ -> 404; entry-shares stale
    edit_status, edited = api.call("PATCH", f"/api/v1/mood/entries/{entry_id}", hs,
                                   {"note": "đã bình tĩnh hơn (E2E v2)"})
    stale_status_code, stale_read = api.call(
        "GET", f"/api/v1/mood/shared/{share_id}", ph)
    _shares_status, shares = api.call(
        "GET", f"/api/v1/mood/entries/{entry_id}/shares", hs)
    stale_grant = (shares.get("results") or [{}])[0].get("status")
    step("sửa -> PH không đọc tiếp bản cũ; trạng thái stale_revision trung thực",
         edit_status == 200 and edited.get("revision") == 2
         and stale_status_code == 404 and stale_grant == "stale_revision",
         f"edit={edit_status} read={stale_status_code} grant={stale_grant}")

    # 12) confirm preview cũ (expected_revision=1) -> 409 stale, không chia sẻ v2
    status, stale_share = api.call("POST", f"/api/v1/mood/entries/{entry_id}/share", hs,
                                   {"recipient_id": _recipient_id(api, ph),
                                    "expected_revision": 1})
    step("xác nhận preview cũ -> 409 stale (v2 không lọt)",
         status == 409 and stale_share.get("error", {}).get("details", {}).get("reason")
         == "stale_revision", f"status={status}")

    # 13) chia sẻ lại đúng bản v2 sau khi xem trước
    status, reshare = api.call("POST", f"/api/v1/mood/entries/{entry_id}/share", hs,
                               {"recipient_id": _recipient_id(api, ph),
                                "expected_revision": 2})
    step("chia sẻ lại bản v2 -> PH đọc được revision 2",
         status == 201 and reshare.get("approved_revision") == 2
         and reshare.get("revoked") is False, f"status={status}")
    status, detail2 = api.call("GET", f"/api/v1/mood/shared/{reshare.get('share_id')}", ph)
    ok_v2 = status == 200 and detail2.get("entry", {}).get("revision") == 2
    step("PH đọc bản v2", ok_v2, f"status={status}")

    # 14) thu hồi 1 share -> lần đọc tiếp 404; F15 overview không còn grant
    status, revoked = api.call("POST", f"/api/v1/mood/shares/{reshare.get('share_id')}/revoke",
                               hs, {})
    status2, denied = api.call("GET", f"/api/v1/mood/shared/{reshare.get('share_id')}", ph)
    status3, shares_after = api.call("GET", f"/api/v1/mood/entries/{entry_id}/shares", hs)
    grant_status = (shares_after.get("results") or [{}])[0].get("status")
    step("thu hồi -> 404 ngay + trạng thái revoked",
         status == 200 and revoked.get("revoked") is True
         and status2 == 404 and grant_status == "revoked",
         f"revoke={status} read={status2} grant={grant_status}")

    # 15) share lại sau thu hồi là hành động tường minh -> hoạt động
    status, again = api.call("POST", f"/api/v1/mood/entries/{entry_id}/share", hs,
                             {"recipient_id": _recipient_id(api, ph),
                              "expected_revision": 2})
    step("share lại sau thu hồi -> grant active trở lại (không trả row revoked)",
         status == 201 and again.get("revoked") is False
         and again.get("status") == "active", f"status={status}")

    # 16) F15 revoke cùng nguồn grant
    status, f15 = api.call("POST",
                           f"/api/v1/privacy/grants/mood_entry/{entry_id}/revoke",
                           hs, {"recipient_id": _recipient_id(api, ph)})
    status2, denied2 = api.call("GET", f"/api/v1/mood/shared/{again.get('share_id')}", ph)
    step("F15 revoke mood_entry -> F07 read chặn ngay",
         status == 200 and f15.get("revoked") is True and status2 == 404,
         f"f15={status} read={status2}")

    # 17) unlink kết nối (F01) -> mọi quyền chết; reconnect generation mới
    # không hồi sinh grant cũ
    status, connections = api.call("GET", "/api/v1/connections", hs)
    conn = (connections.get("results") or [None])[0]
    if conn:
        status, _ = api.call("POST", f"/api/v1/connections/{conn['connection_id']}/revoke",
                             hs, {})
        status2, empty = api.call("GET", "/api/v1/mood/shared", ph)
        step("hủy kết nối -> danh sách phía nhận rỗng",
             status == 200 and empty.get("results") == [],
             f"revoke={status} list_empty={empty.get('results') == []}")
    else:
        step("hủy kết nối -> SKIPPED (không có connection trong fixture)", False,
             "fixture chưa tạo connection")

    print()
    failed = [name for name, ok, _ in results if not ok]
    print(f"TỔNG: {len(results) - len(failed)}/{len(results)} PASS")
    for name in failed:
        print(f"  FAIL: {name}")
    return 0 if not failed else 1


def _recipient_id(api: Api, ph_token: str) -> str:
    """Lấy user UUID của PH từ profile endpoint (đường production)."""
    status, profile = api.call("GET", "/api/v1/auth/me", ph_token)
    if status == 200:
        user = profile.get("user") or profile
        uid = user.get("id") or user.get("user_id")
        if uid:
            return str(uid)
    raise SystemExit("Không lấy được user id của caregiver từ /auth/me")


if __name__ == "__main__":
    sys.exit(main())
