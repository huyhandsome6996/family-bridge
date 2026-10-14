# F15 API contract — Quyền riêng tư, thu hồi, yêu cầu xóa (vòng 2)

Trạng thái: **F15 review-ready trong phạm vi đã kiểm tra** (SQLite harness +
regression suites; MySQL/TiDB/device NOT_RUN). Tài liệu mô tả endpoint THỰC
đã nối trong code của nhánh này, không phải thiết kế.

Quy ước chung: `/api/v1`, JSON, bearer session (F01 `SessionService`);
envelope lỗi `{"error":{"code","details"}}` theo `docs/contracts/api-foundation.md`;
admin/is_staff KHÔNG bao giờ bypass owner ACL (SEC-03/04). Mọi mutation có
throttle theo actor (`privacy_write`, mặc định 30/hour, SEC-14).

## 1. GET /api/v1/privacy/overview

Owner-only. Trang dữ liệu quyền riêng tư của chính người gọi.

- Query: `limit` (1..50, mặc định 20), `cursor` (opaque, lấy từ `next_cursor`).
- Response:
  ```json
  {
    "shared_by_me": [
      {"item_type": "mood_entry", "item_id": "<uuid>", "share_id": "<uuid>",
       "recipient_id": "<uuid>", "approved_revision": 2, "revoked": false}
    ],
    "connections": [
      {"connection_id": "<uuid>", "other_party_id": "<uuid>",
       "relationship_kind": "primary", "generation": 1, "status": "active"}
    ],
    "next_cursor": "ov2|<created_at_iso>|<share_id>" | null,
    "has_more": false
  }
  ```
- Cursor v2: khóa toàn cục `(created_at, share_id)` — nhất quán với ORDER BY
  SQL của từng provider; cursor được áp dụng TRONG DATABASE trước LIMIT
  (R09 fix: không còn chốt 100 mục/provider rồi lọc Python — domain lớn hơn
  100 vẫn tới được 100% qua các trang). Sai định dạng cursor → 400.
- `connections` lấy từ ConnectionReader production (F01 `InviteService`,
  `list_active_for_user`); khi port chưa nối thì mảng rỗng — không giả dữ liệu.
- Mỗi provider đọc theo lô 100 với cursor SQL riêng (bounded, không N+1);
  provider lab không hỗ trợ cursor bị giới hạn 1 lô — chỉ tồn tại trong harness.

## 2. POST /api/v1/privacy/grants/{item_type}/{item_id}/revoke

Owner-only. Thu hồi grant của chính mình.

- Body (tất cả tùy chọn nhưng phải đúng kiểu — unknown fields bị từ chối):
  - `recipient_id`: UUID; bỏ trống = thu hồi mọi recipient của item.
  - `expected_revision`: int dương = bản revision mục mà client đang thấy.
- Ngữ nghĩa `expected_revision`: so với `approved_revision` của grant (bản
  revision mục mà grant ràng buộc). Không khớp → **409 `revision_conflict`**
  (chống race revoke-sau-reshare). Provider không hỗ trợ kiểm tra → 400.
- Kết quả: mutation + event ledger commit **một transaction**: ledger lỗi →
  grant không đổi (không bao giờ grant đi trước ledger).
- Response 200:
  `{"item_type","item_id","revoked":true|false,"note":"Đọc mới bị chặn ngay;
  bản sao ngoài ứng dụng không thu hồi được."}` — `revoked:false` khi gọi
  lặp (idempotent, không viết event thứ hai).
- 404 khi không phải owner (không lộ existence); 503 khi provider chưa đăng ký
  (`grant_provider_not_registered`).
- Hiệu lực: lần đọc mới sau commit bị chặn — không TTL, không job nền.

## 3. POST /api/v1/privacy/deletion-requests

Owner-only. Tạo yêu cầu xóa theo categories.

- Body: `{"categories": ["mood", ...]}` — list chuỗi không rống, tối đa 10,
  thuộc allowlist: `account, connections, mood, journal, drafts, messages, ai,
  surveys, program_progress, appointments`.
- Chống trùng: khóa theo user (SELECT..FOR UPDATE trên user row) — hai request
  đồng thời không tạo hai case. Khi còn yêu cầu mở: trả 200 kèm
  `scope_categories` hiện có + `covers_requested_categories` (hai ý định khác
  nhau KHÔNG tự hợp nhất).
- Response 201: `{"request_id","status":"requested","receipt","duplicate":false}`
  — receipt chỉ hiện MỘT lần, at-rest chỉ lưu SHA-256.
- Ledger: `deletion_requested` (categories).

## 4. GET /api/v1/privacy/deletion-requests/list

Owner-only (MỚI). Phục hồi trạng thái sau mất response/mở lại app — KHÔNG
dùng POST để tra cứu.

- Query: `limit` (1..50, mặc định 20), `cursor` (`"v2|<requested_at_iso>|<id>"`;
  cursor cũ không prefix vẫn đọc được). Timestamp phải có timezone, id phải
  UUID hợp lệ — sai → **400 `input_invalid`** (R12 fix: không còn 500 từ
  UUID hỏng chạm ORM).
- Response: `{"results":[{"request_id","status","scope_categories",
  "requested_at","revision"}],"next_cursor","has_more"}` — mới nhất trước.

## 5. GET /api/v1/privacy/deletion-requests/{id}

Owner-only, KHÔNG admin bypass (is_staff/superuser nhận 404).

- Response: `{"request_id","status","revision","scope_categories",
  "requested_at","completed_at","failure_detail","note"}` — `revision` phục vụ
  cancel; `failure_detail` gồm outcome từng category (không chứa nội dung
  riêng) + `_scope.cutoff` (mốc scope được chốt khi lần xử lý đầu tiên).

## 6. POST /api/v1/privacy/deletion-requests/{id}/cancel

Owner-only; chỉ khi `status=requested`. Body `{"expected_revision": int}`
(tùy chọn) — lệch → 409. Trả `{"request_id","status","revision"}`.

## 7. POST /api/v1/privacy/deletion-requests/{id}/verify — HANDLER ONLY

- KHÔNG dành cho owner. Yêu cầu authorizer đã cấu hình:
  - chưa cấu hình → **503 `module_unavailable`** (fail-closed, DEC-14/18 OPEN);
  - authorizer production = B16 `AdminCapabilityGrant` capability
    **`privacy.case`** (CAP-20); actor không có capability → **404** (không lộ
    existence). `is_staff`/`dashboard.read` KHÔNG được chấp nhận.
  - B16 chưa ship code constant này: production fail-closed cho đến khi B16
    cấp được (đã ghi dependency trong report).
- Body: `{"verifier_ref": "..."}` (tùy chọn, chuỗi 1..64, không PII).
- R07 fix: actor/action/request context TIN CẬY được truyền xuyên view →
  service; service authorize LẠI với actor id thực (không bao giờ actor rỗng,
  không tin `verifier_ref` client làm audit actor). Event ledger ghi
  `actor_ref` = actor đã xác thực; `verifier_ref` chỉ là tham chiếu trong
  payload.
- Hiệu quả: `requested → verified`, tạo `PrivacyCase`, ledger
  `deletion_requested(transition=verified)`.

## 8. POST /api/v1/privacy/deletion-requests/{id}/process — HANDLER ONLY

- Authorizer như trên (fail-closed). Chạy từ `verified`/`failed_needs_action`
  VÀ từ `processing` bị bỏ dở (R06 fix: worker crash giữa chừng không còn
  kẹt vĩnh viễn — chạy lại tiếp tục từ checkpoint per-category đã lưu bền;
  category đã ok không chạy lại hook destructive; request `completed`/
  `cancelled` không chạy lại).
- 3 phase: (A) chốt `status=processing` + **cutoff snapshot** lưu vĩnh viễn;
  (B) mỗi category chạy trong transaction riêng ngắn, checkpoint được PERSIST
  sau MỖI category (R06: crash giữa các category mất tối đa 1 category đang
  chạy), hook nhận `requested_at = cutoff` (không phải thời điểm chạy lại);
  (C) trạng thái cuối trung thực + ledger event.
- Event `deletion_applied` mang `cutoff` GỐC trong payload (R04 fix: replay
  restore dùng lại đúng cutoff, không bao giờ lấy `occurred_at` của event —
  thời điểm đó muộn hơn và sẽ MỞ RỘNG phạm vi xóa). Event cũ thiếu cutoff →
  replay FAIL-CLOSED (`deletion_cutoff_missing`).
- `completed` CHỈ khi toàn bộ categories đã xử lý thành công; một hook fail →
  `failed_needs_action` kèm outcome từng phần. Retry chỉ chạy lại category
  thiếu/thất bại, không mở rộng scope sang mục tạo sau cutoff.
- Response: `{"request_id","status","revision","failure_detail"}`.

## 9. POST /api/v1/privacy/consents/{purpose}/withdraw

Owner-only; `purpose ∈ {service, ai_processing, research}`.

- Qua port consent đã nối production (F01 store; research rút ĐỒNG THỜI F01
  `ConsentRecord` + F14 `ResearchConsent` trong một transaction — hai store
  không bao giờ mâu thuẫn; rút research chặn submission/report F14).
- R01 fix: rút đồng ý là tombstone THEO PURPOSE — MỌI row còn active của
  purpose bị rút cùng lúc (không chỉ row mới nhất); lịch sử được giữ (row
  giữ `withdrawn_at`) nhưng acceptance cũ không bao giờ "hồi sinh" qua
  `latest_active`. Accept tường minh MỚI sau khi rút vẫn hiệu lực (WF-17).
- R02 fix: mutation consent + event ledger commit MỘT transaction — ledger
  lỗi → rút đồng ý bị roll back (trạng thái và event không bao giờ lệch nhau).
- Chưa nối port → **503 fail-closed** (không bao giờ no-op giả thành công).
- Response: `{"purpose","withdrawn":true|false}` — `false` khi không có đồng ý
  đang hiệu lực (vẫn ghi nhận quyết định `declined` để audit không bị hiểu
  nhầm là đã chấp nhận). Ledger `consent_withdrawn` chỉ khi có thay đổi thật.
- Rút research/AI KHÔNG khóa công cụ cơ bản hay trợ giúp F13 (DEC-08).

## 10. Kết nối (F01 là endpoint duy nhất)

- Client hủy kết nối qua `POST /api/v1/connections/{id}/revoke` của F01
  (KHÔNG có endpoint revoke riêng trong F15). **Đã nối thật (R10 fix):** view
  F01 gọi adapter `revoke_connection_with_privacy` khi f15_privacy được cài;
  response có thêm `grants_revoked`. Không có f15 (build tối giản F01) thì
  fallback service thuần F01 — coupling được ghi rõ, không tuyên bố wired.
- Adapter trong MỘT transaction — F01 revoke (lock connection row trước) →
  thu hồi mọi grant hai chiều giữa cặp theo providers đã đăng ký → ghi MỖI
  MỘT event `connection_revoked` cho từng phía.
- **Payload event (R08 fix):** `{"connection_id","generation",
  "other_party_id","grants_revoked","scope":"connection_identity_generation"}`
  — O(1) byte bất kể số grant; KHÔNG còn danh sách grant_refs (payload 50
  grants cũ vượt cap 8 KiB và làm rollback cả unlink). Event cũ có
  `grant_refs` vẫn replay được (nhánh legacy).
- Idempotent: gọi lại trên connection đã revoked không viết thêm event.
- Tái kết nối tạo generation mới: grant cũ (generation cũ) KHÔNG hồi sinh —
  adapter kiểm `connection_id` + `connection_generation` của grant so với
  connection hiện hành. Share lại sau thu hồi cùng revision bị từ chối
  (`reshare_after_revoke_requires_edit`, 400) — chủ sở hữu phải sửa mục (revision
  mới) rồi chia sẻ lại.
- Domain revoke entry points (F07 `MoodShareService.revoke` / F08
  `JournalShareService.revoke`) cũng append event `grant_revoked` (R10 fix)
  — mọi đường thu hồi đều durable.

## 11. Restore (B17 runbook, không phải API user)

`DeletionService.replay_ledger_for_restore(target_user_id, after_seq?,
max_events?=10000)`: đọc ledger theo **`seq`** (R05 fix: thứ tự append-only
là thứ tự replay duy nhất — sort `(occurred_at, seq)` cũ kết hợp watermark
`seq >` có thể bỏ event vĩnh viễn khi timestamp nghiệp vụ ngược thứ tự),
ap dụng idempotent:
- `grant_revoked` → revoke lại qua registry;
- `connection_revoked` → (R05 fix) revoke lại ROW connection (id + generation
  khớp) + revoke grant của PHÍA ĐÓ theo đúng connection scope trong payload;
  connection thiếu → fail-closed; payload legacy có `grant_refs` vẫn xử lý
  theo refs, `grant_refs_truncated` → **fail-closed** (bằng chứng không đầy đủ
  không được báo hoàn tất);
- `consent_withdrawn` → rút lại qua consent port;
- `deletion_applied` → chạy lại hook theo categories với `requested_at =
  cutoff` GỐC trong payload (R04 fix — KHÔNG dùng `occurred_at` của event);
  thiếu cutoff → fail-closed.

FAIL-CLOSED: hook/provider thiếu, `ok=false`, exception, bị cắt
(`truncated`), truncated refs, thiếu/malformed cutoff, connection row thiếu →
`incomplete: true` + danh sách `failures` — operator GIỮ cách ly, không cộng
dồn "applied" như đã xong. Replay KHÔNG bao giờ viết event domain mới;
`next_after_seq` hỗ trợ chạy tiếp có trần.

## Lỗi

| Code | HTTP | Khi nào |
| --- | --- | --- |
| input_invalid | 400 | body/enum/uuid/revision sai kiểu, categories sai allowlist |
| not_authenticated | 401 | thiếu/hết phiên (F01) |
| not_found | 404 | không phải owner / actor không đủ capability handler |
| revision_conflict | 409 | expected_revision lệch (grant hoặc deletion request) |
| module_unavailable | 503 | port/provider/authorizer chưa nối (fail-closed) |

Không trả stack trace, không lộ existence cho actor thiếu quyền, không chứa
nội dung riêng trong details (SEC-22).

## Integration 2026-10-14

Overview thích nghi F01 reader `(views,next_cursor)`, trả thêm connections_next_cursor; query connections_cursor cho trang kết nối kế tiếp. F08 share chấp nhận expected_revision tuỳ chọn (UI mới bắt buộc gửi), stale409 trong transaction khóa page. Recipient lists thích nghi reader tuple. Consent withdrawal dùng current policy; user-row serialization với record_consent ngăn timestamp ties đảo quyết định. Restore mỗi successful category ghi applied tombstone trong transaction, deletion_failed replays successful categories với originalcutoff; malformed/naive persisted cutoff failclosed. last_seq/scanned_last_seq là scanned, next_after_seq/safe_resume_after_seq lùi về trước earliest unresolved failure cho retry; không publish backup khi incomplete. Handler scope assigned_resource+scope_ref=request_id và actionallowlist, B16 chưa grant/stepup đúng nên chưa enable xử lý production.
