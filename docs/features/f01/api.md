# F01 API (bổ sung cho docs/contracts/openapi.yaml — x-owner-feature: F01)

Quy tắc chung: `/api/v1/`, JSON, bearer session của Family Bridge, lỗi
envelope `{"error": {"code", "details"}}`, UTC ISO-8601. Zalo id là chuỗi.

| Method | Path | Auth | Mô tả | Lỗi |
| --- | --- | --- | --- | --- |
| POST | /api/v1/auth/session | public | Đổi Zalo access token (từ SDK) lấy session ứng dụng; backend verify qua provider | 400 input_invalid (malformed/wrong_app_id/unsupported_provider), 401 not_authenticated (token_invalid_or_expired/user_disabled), 503 temporarily_unavailable (provider_unreachable/not_configured) |
| POST | /api/v1/auth/logout | bearer | Thu hồi phiên hiện tại (server-side) | 401 |
| GET | /api/v1/auth/me | bearer | Danh tính hiển thị TỰ KHAI BÁO của chính mình: `{user_id, display_name, identity_basis: "self_declared"}` | 401 |
| PUT | /api/v1/auth/me | bearer | Đặt/cập nhật tên gọi tự khai báo (`display_name` 1..80 ký tự, trim; lưu vào cột first_name có sẵn — không migration) | 400 (too_short/too_long/unknown_fields), 401 |
| GET | /api/v1/consents | bearer | Trạng thái consent mới nhất theo purpose | — |
| POST | /api/v1/consents | bearer | Ghi nhận quyết định accepted/declined theo purpose+policy_version | 400 |
| POST | /api/v1/connections/invites | bearer | Tạo lời mời primary/backup; raw code trả MỘT lần | 400, 401 |
| GET | /api/v1/connections/invites | bearer | Danh sách lời mời mình tham gia (không active) — chống enumerate; mỗi item có `revision` + `counterpart` | — |
| POST | /api/v1/connections/invites/preview | bearer | KIỂM TRA MÃ READ-ONLY TRƯỚC KHI CHẤP NHẬN: trả `{invite_id, relationship_kind, status, expires_at, counterpart, identity_basis}`; KHÔNG đổi trạng thái, dùng chung budget rate-limit với claim | 404 invalid_or_expired_code (mã sai/hết hạn/đã dùng/closed — cùng một mã lỗi), 400 self_connect_denied/already_connected, 429 rate_limited |
| POST | /api/v1/connections/invites/claim | bearer | Nhập mã; gắn candidate + xác nhận phía nhận; rate limit (dùng chung budget với preview) | 404 invalid_or_expired_code, 400 self_connect_denied/already_connected, 429 rate_limited |
| POST | /api/v1/connections/invites/{id}/confirm | bearer | Inviter xác nhận đúng candidate; kích hoạt connection (transaction, generation); nhận `expected_revision` (lấy từ GET invites) | 404 invite_not_found, 400 candidate_not_claimed_yet/invite_not_confirmable/already_connected, 409 revision_conflict |
| POST | /api/v1/connections/invites/{id}/decline | bearer | Candidate từ chối | 404/400 |
| POST | /api/v1/connections/invites/{id}/cancel | bearer | Inviter hủy | 404/400 |
| GET | /api/v1/connections | bearer | Danh sách kết nối active của actor; mỗi item có `counterpart` | — |
| POST | /api/v1/connections/{id}/revoke | bearer | Hủy kết nối (idempotent; generation giữ nguyên; reconnect = generation mới) | 404 |

## Danh tính hiển thị (review: XÁC NHẬN ĐÚNG NGƯỜI)

- `counterpart` = `{display_name: string \| null, identity_basis: "self_declared"}` —
  NGƯỜI KIA nhìn theo góc nhìn của caller (inviter thấy candidate, candidate
  thấy inviter). `display_name` là TỰ KHAI BÁO, KHÔNG phải danh tính Zalo
  xác minh; UI PHẢI gắn nhãn rõ. Chưa đặt tên → `display_name: null`.
- Không trả UUID của người kia trong `counterpart`; không trả
  provider_subject. Lookup batch 1 query cho list (không N+1).
- Lưu trữ: cột `auth_user.first_name` có sẵn (không models/migrations mới —
  W036). Không dùng cho authorization, chỉ nhận biết.

## `revision` trên lời mời (review: expected_revision)

GET invites / claim / confirm / decline / cancel trả thêm `revision` của
invite. Inviter lấy revision từ GET rồi gửi `expected_revision` khi confirm
→ 409 revision_conflict khi stale. Frontend cũ gửi null vì display_for
không có revision — đã sửa ở tầng view (models.py giữ nguyên, W036).

## Lỗi transport provider (review: 503)

URLError / socket.timeout / OSError khi gọi Zalo → 503
`temporarily_unavailable` / `provider_unreachable`. KHÔNG cấp token, KHÔNG
tạo user khi verify thất bại vì bất kỳ lý do gì. Mapping KHÔNG là catch-all:
lỗi lập trình vẫn lan lên.

## Mass assignment

Mọi POST reject unknown fields (`input_invalid` kèm danh sách field lạ) —
kể cả `is_staff`, `role`, `status`, `candidate_confirmed_at`.

## Logging/audit

Không log token/mã mời; ClaimAttempt chỉ lưu actor + thời điểm. Audit events
(hook port AuditWriter) sẽ được B16/B16-wiring nối — scope của nhánh này ghi
văn bản hành vi, chưa cắm store thật.
