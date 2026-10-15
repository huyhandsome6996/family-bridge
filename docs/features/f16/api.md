# F16 api.md — endpoint + mapping lỗi (khớp docs/contracts/api-foundation.md + openapi.yaml)

## Auth lớp học (public)

| Method | Path | Body | 200 | Lỗi |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/class-session` | `{code, password}` | `{token, token_type:"Bearer", expires_at, user:{id, display_name, role, class_ref}, consents_required}` | 400 `input_invalid` (body sai shape); 401 `not_authenticated` + `details.reason=invalid_credentials` — body BYTE GIỐNG HỆT cho mã không tồn tại/sai mật khẩu/tài khoản vô hiệu/sai định dạng; 429 `rate_limited` + `too_many_attempts` (guard DB 10 fail/15ph) hoặc `throttled` (throttle class_login 200/hour) |
| GET | `/api/v1/auth/class-capabilities` | — | `{login_methods:{local_class:true, zalo}, settings:{change_password,change_code,change_display_name}, policy:{no_forced_password_change:true}}` | — |

`zalo` = `FB_ZALO_LOGIN_ENABLED` đang bật **và** có `ZALO_APP_ID` + `ZALO_APP_SECRET`. Thiếu điều kiện nào → false (fail closed).

## Cài đặt (Bearer; re-auth bằng `current_password`)

| Method | Path | Body | 200 | Lỗi |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/class-password` | `{current_password, new_password}` | `{changed:true, sessions_revoked_other:N}` (giữ phiên hiện tại) | 400 `weak_password`/`same_password`; 403 `reauth_failed`; 403 `not_authorized` nếu không phải class account |
| POST | `/api/v1/auth/class-code` | `{current_password, new_code}` | `{login_code:"HSxxx", changed:true}` | 400 `invalid_code_format`/`same_code`/`duplicate_code`; 403 `reauth_failed` |
| POST | `/api/v1/auth/class-display-name` | `{current_password, display_name}` | `{display_name, identity_basis:"self_declared"}` | 400 `input_invalid` (bounds của F01); 403 `reauth_failed` |

## Đề xuất kết nối (Bearer)

| Method | Path | Body | 200 | Lỗi |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/classroom/proposals` | query `cursor`, `limit` (1..50, default 20) | `{results:[{proposal_id, status, my_role, my_confirmed, counterpart_confirmed, counterpart:{display_name, identity_basis}, created_at, updated_at, revision}], next_cursor}` | 401 |
| POST | `/api/v1/classroom/proposals/{id}/confirm` | `{}` hoặc `{expected_revision}` | bước 1: `{proposal_id, status:"awaiting_confirmation", my_confirmed:true, counterpart_confirmed:false, connection:null}`; bước 2: `{..., status:"connected", connection:{connection_id, status, relationship_kind, generation}}` | 404 `proposal_not_found` (không thuộc — không leak); 400 `proposal_not_confirmable`/`proposal_blocked_by_open_invite`/`already_connected`; 403 `consent_required`/`account_inactive`; 409 `revision_conflict`; 429 |
| POST | `/api/v1/classroom/proposals/{id}/decline` | `{reason:"refused"\|"wrong_pair"}` | payload proposal (status declined) | 404; 400 `proposal_not_open`/`invalid_enum` |
| POST | `/api/v1/classroom/proposals/{id}/cancel` | `{}` | payload proposal (status canceled, outcome_reason `canceled_by_student\|canceled_by_caregiver`) | 404; 400 `proposal_not_open` |

Bất đồng bộ trạng thái my/counterpart confirmed: `my_confirmed=true` ⇔ (status=awaiting_confirmation và first_confirmed_role=my_role) hoặc status=connected.

## Zalo dormancy (middleware dùng chung, không sửa f01)

- `FB_ZALO_LOGIN_ENABLED=false` → `POST /api/v1/auth/session` trả 503
  `{"error":{"code":"module_unavailable","details":{"reason":"zalo_login_disabled"}}}`
  với `Cache-Control: no-store`, trước khi chạm f01. Các path khác đi qua
  bình thường. Middleware class: `family_bridge_core.middleware.FBZaloDormancyMiddleware`,
  mount ở `backend/config/settings.py` (harness không mount — gate kiểm thử
  qua backend settings + unit test RequestFactory).

## Điều hướng throttle

- `class_login` 200/hour (ScopedRateThrottle, định danh IP cho anonymous) —
  pin tường minh trên view để không kế thừa AnonRateThrottle 60/min của
  scaffold (60/phút chặn sớm hơn hợp đồng khi burst).
- Confirm/decline/cancel dùng scope `invite_claim` (30/hour, chung F01).
- Guard DB 10 fail/15 phút theo `acct:<user-uuid>`, `codeh:<hmac(sha256(SECRET_KEY+b"fb-classroom-guard"), code)>`, `ip:<sha256(ip)>`; kết quả `locked_out` ghi audit nhưng không cộng vào ngưỡng.
