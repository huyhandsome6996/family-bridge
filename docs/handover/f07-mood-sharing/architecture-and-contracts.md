# Architecture and contracts — F07 sau đợt hoàn thiện

## Call path thật (người dùng Mini App chính thức)

```
zalo-mini-app/src/pages/mood/index.js        (owner: editor/history/share)
zalo-mini-app/src/pages/mood-shared/index.js (recipient: list/detail)
  → ctx.adapter.* (core/adapter/zalo-adapter.js)
    → packages/family_bridge_shared/src/adapter/http-endpoints.js  (82 methods)
      → HTTP (Bearer từ class-session/F01, timeout 15s, session generation guard)
        → backend/config/urls.py → f07_mood/urls.py → f07_mood/api.py
          → services/mood.py (MoodEntryService / MoodShareService)
            → registry.get_connection_reader()  [apps.py ready() đăng ký
              InviteService (F01) — canonical active connection]
```

F15 side: `/api/v1/privacy/overview` + `/privacy/grants/mood_entry/{id}/revoke`
dùng provider `family_bridge_features.f07_mood.services.grant_provider`
(đăng ký trong `f07_mood/apps.py ready()`), cùng bảng MoodShare — một nguồn
grant, không hai trạng thái.

## Contract thay đổi (additive)

1. `POST /api/v1/mood/entries/{id}/share`
   - Body mới tùy chọn: `expected_revision` (int ≥ 1; `validate_revision`).
   - Lệch bản hiện hành → **409 `preview_stale`** details `{reason:
     "stale_revision", expected_revision, current_revision}` — KHÔNG tạo grant.
   - Không gửi `expected_revision`: giữ hành vi cũ (bind revision hiện hành)
     cho consumer cũ; client chính thức luôn gửi.
   - Re-share trên grant revoked của cùng (entry, recipient, revision): kích
     hoạt lại tường minh (revoked_at=NULL) + rebind connection id/generation
     hiện hành. Row revoked không bao giờ tự hồi sinh khi connection active lại.
   - Response `grant_view()` thêm `status`: `active | stale_revision |
     revoked | unlinked`.
2. `GET /api/v1/mood/entries/{id}/shares` — sửa 500 → 200; trả MỌI grant của
   mục (bounded 50, mới nhất trước) kèm `status` thật; không còn liệt kê stale
   như "đang có quyền đọc".
3. `GET /api/v1/mood/shared` — thêm `page_size` (≤50) + `next` cursor; kết quả
   chỉ gồm grant còn đọc được (revision current + connection còn là đúng
   connection đã bind). Shape cũ (`results`) giữ nguyên.
4. `GET /api/v1/mood/shared/{id}` — fail-closed khi thiếu reader (503
   `module_unavailable`); so khớp `connection_id` + `generation` hiện hành,
   sai → 404 (trước đây chỉ check "có connection nào active").

## Shared adapter (74 → 82 methods)

Thêm: `getMoodEntry`, `editMoodEntry`, `moodSummary`, `listMoodEntryShares`,
`shareMoodEntry({recipientId, expectedRevision})`, `revokeMoodShare`,
`listSharedMoodEntries({cursor, limit})`, `getSharedMoodEntry`.
Sửa: `listMoodEntries`/`listSharedMoodEntries` map `limit` → query `page_size`
(trước đây gửi `limit`, backend đọc `page_size` → phân trang vô hiệu).
Mock adapter implement đủ 8 method (demo mode không crash). Contract test bắt
URL/body fetch thật trong `packages/family_bridge_shared/tests/http-endpoints.test.mjs`.

## Payload shapes (nguồn: backend thật, không bịa)

```jsonc
// entry.view()
{ "entry_id": "uuid", "entry_date": "2026-10-18", "emotion": "lo",
  "emotion_label": "Lo lắng", "note": "…", "revision": 1,
  "updated_at": "2026-10-18T03:20:00+00:00" }

// grant_view() — share/revoke/shares list
{ "share_id": "uuid", "entry_id": "uuid", "recipient_id": "uuid",
  "owner_id": "uuid", "approved_revision": 1, "revoked": false,
  "status": "active", "created_at": "…" }

// read_shared() — GET /mood/shared/{id}
{ "share_id": "uuid", "entry": {…entry.view()…}, "owner_id": "uuid",
  "shared_at": "…" }

// lỗi envelope ổn định
{ "error": { "code": "preview_stale",
             "details": { "reason": "stale_revision", … } } }
```

## Production wiring (apps.py ready() — idempotent, guarded)

- ConnectionReader: `f01_identity.services.invites.InviteService()` (canonical,
  admin_provisioned/invite NULL dùng được) — chỉ đăng ký khi reader chưa có.
- F15: `register_grant_provider("mood_entry", …services.grant_provider)` +
  `register_deletion_hook("mood", …services.deletion)`; f15 không có trong
  build → bỏ qua im lặng (standalone branch tests); lỗi ValueError không fake OK.
- `services/__init__.py` export submodule để dotted-path getattr resolve.

## DSA notes (bắt buộc ghi theo AGENTS.md)

- Authorization lọc trong DB trước phân trang (owner/recipient/revoked/revision
  bằng F-expression); connection recheck per-row trên trang bounded (≤50) —
  1 reader query mỗi recipient distinct, không N+1 theo số grant lớn.
- Bounds: page ≤50 (MAX_PAGE_SIZE), note ≤2000, summary ≤365 ngày, shares list
  ≤50/entry, provider list ≤200; body ≤64KB.
- Thời gian: `_now()` UTC; ngày VN = UTC+7 do server; không tin đồng hồ client.
- Không thêm cache/index mới — DB đã có index (owner,entry_date) và
  (recipient,created_at)/(owner,created_at); unique constraint là nguồn chân
  lý chống trùng.
