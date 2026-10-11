# F01 API (bổ sung cho docs/contracts/openapi.yaml — x-owner-feature: F01)

Quy tắc chung: `/api/v1/`, JSON, bearer session của Family Bridge, lỗi
envelope `{"error": {"code", "details"}}`, UTC ISO-8601. Zalo id là chuỗi.

| Method | Path | Auth | Mô tả | Lỗi |
| --- | --- | --- | --- | --- |
| POST | /api/v1/auth/session | public | Đổi Zalo access token (từ SDK) lấy session ứng dụng; backend verify qua provider | 400 input_invalid (malformed/wrong_app_id/unsupported_provider), 401 not_authenticated (token_invalid_or_expired/user_disabled), 503 temporarily_unavailable (provider_unreachable/not_configured) |
| POST | /api/v1/auth/logout | bearer | Thu hồi phiên hiện tại (server-side) | 401 |
| GET | /api/v1/consents | bearer | Trạng thái consent mới nhất theo purpose | — |
| POST | /api/v1/consents | bearer | Ghi nhận quyết định accepted/declined theo purpose+policy_version | 400 |
| POST | /api/v1/connections/invites | bearer | Tạo lời mời primary/backup; raw code trả MỘT lần | 400, 401 |
| GET | /api/v1/connections/invites | bearer | Danh sách lời mời mình tham gia (không active) — chống enumerate | — |
| POST | /api/v1/connections/invites/claim | bearer | Nhập mã; gắn candidate + xác nhận phía nhận; rate limit | 404 invalid_or_expired_code (mã sai/hết hạn/đã dùng — cùng một mã lỗi), 400 self_connect_denied/already_connected, 429 rate_limited |
| POST | /api/v1/connections/invites/{id}/confirm | bearer | Inviter xác nhận đúng candidate; kích hoạt connection (transaction, generation) | 404 invite_not_found, 400 candidate_not_claimed_yet/invite_not_confirmable/already_connected, 409 revision_conflict |
| POST | /api/v1/connections/invites/{id}/decline | bearer | Candidate từ chối | 404/400 |
| POST | /api/v1/connections/invites/{id}/cancel | bearer | Inviter hủy | 404/400 |
| GET | /api/v1/connections | bearer | Danh sách kết nối active của actor | — |
| POST | /api/v1/connections/{id}/revoke | bearer | Hủy kết nối (idempotent; generation giữ nguyên; reconnect = generation mới) | 404 |

## Mass assignment

Mọi POST reject unknown fields (`input_invalid` kèm danh sách field lạ) —
kể cả `is_staff`, `role`, `status`, `candidate_confirmed_at`.

## Logging/audit

Không log token/mã mời; ClaimAttempt chỉ lưu actor + thời điểm. Audit events
(hook port AuditWriter) sẽ được B16/B16-wiring nối — scope của nhánh này ghi
văn bản hành vi, chưa cắm store thật.
