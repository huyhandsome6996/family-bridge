# Authentication flows — web độc lập & mini app (sau khi tách)

Tài liệu này mô tả chính xác luồng xác thực sau khi tách, khác biệt giữa hai client, và bằng chứng E2E tương ứng (tham chiếu bước S1–S16 trong [verification-report.md](verification-report.md); log gốc `evidence/e2e-results.json`, `evidence/verification-log-w3a.md`).

## 1. Nguồn dùng chung

- `packages/family_bridge_shared/src/api/client.mjs` — `createApiClient({baseUrl, getToken, timeoutMs})`; ApiError 5 kind: `configuration`, `network`, `timeout`, `http`, `invalid_response` (bản đã fix PR #25).
- `packages/family_bridge_shared/src/session.js` — phiên in-memory + generation (SEC-10): 401 từ server làm generation tăng, mọi request đang bay của phiên cũ bị hủy; **không có bất kỳ write nào vào sessionStorage/localStorage/cookie** ở web (checker boundary assert (d)).
- `packages/family_bridge_shared/src/adapter/http-endpoints.js` — `loginWithCredentials` + 66 method endpoint; `credentials: "omit"`, token gắn bằng header `Authorization: Bearer`.

## 2. Đăng nhập lớp học (HS/PH) — dùng chung web + mini

1. Client gọi `GET /api/v1/auth/class-capabilities` (public) → `login_methods` (`local_class`, `zalo`), `settings` (change_password/change_code/change_display_name), `policy` (no_forced_password_change). Bằng chứng S1: 200, `zalo:false` khi backend chạy `FB_ZALO_LOGIN_ENABLED=false`.
2. Form đăng nhập (web `web/src/pages/login/` + `credential-form.js`; mini giữ trang login của mình) gọi `POST /api/v1/auth/class-session {code, password}` → 200 `{token, token_type:"Bearer", expires_at, user:{id, display_name, role, class_ref}, consents_required:[...]}`. `role` từ server quyết định home (student/caregiver) — không chọn role phía client.
3. Lỗi đăng nhập **generic giống hệt nhau** cho sai mật khẩu / mã không tồn tại / tài khoản bị khóa: 401 `not_authenticated`/`invalid_credentials` — anti-enumeration. Bằng chứng S4: hai phản hồi **giống nhau byte-wise**.
4. Giới hạn: throttle IP `class_login` 200/h; DB guard 10 lần sai/15 phút mỗi tài khoản + mỗi IP → 429 `rate_limited`. Bằng chứng S15: burst 12 sai liên tiếp → `401×8` rồi `429×4`, mã `rate_limited`.

## 3. Zalo dormant — hành vi khi `zalo=false`

- Backend có middleware dormant: `POST /api/v1/auth/session` (đăng nhập Zalo) bị chặn 503 `module_unavailable`/`zalo_login_disabled` khi `FB_ZALO_LOGIN_ENABLED=false` hoặc thiếu credentials Zalo. Bằng chứng S2.
- Khi `capabilities.login_methods.zalo=false`, web **không** hiển thị CTA "Đăng nhập bằng Zalo" để rồi ném lỗi chung chung — nút Zalo ẩn/disable theo capabilities, chỉ cho phép đăng nhập mã lớp. Mini app vẫn giữ luồng SDK Zalo khi backend bật.
- Trang compose trên web dùng copy trung thực "Đăng nhập để tiếp tục" thay vì "Đăng nhập bằng Zalo" (khác biệt có chủ đích, đã ghi ở [route-feature-parity.md](route-feature-parity.md)).

## 4. Consent bắt buộc sau login

- `consents_required` trả về trong response login (S3: `["service","ai_processing","research"]` cho HS001).
- Client điều hướng tới `#/consent` cho tới khi các purpose bắt buộc được đồng ý; `POST /api/v1/consents` trả **201 Created** (S6 — lưu ý: 201, không phải 200). Chưa consent → các màn nghiệp vụ bị chặn phía router (`requiresAuth` + cờ consent).

## 5. Phiên làm việc (SEC-10)

- Token giữ **in-memory** duy nhất (web `src/core/session.js` từ shared; web `src/app/store.js` chỉ giữ `role` in-memory). Reload trang = mất token → trạng thái "đã đăng xuất" trung thực, không phục hồi âm thầm.
- Mini app: `store.js` mini dùng sessionStorage `{role}` (giữ nguyên — có test pin `qa-secrets-privacy`); token vẫn in-memory.
- 401 giữa phiên → generation tăng → hủy request đang bay → điều hướng login kèm reason (`logged-out-pending` trung thực; test web có case "revocation network failure still navigates to an honest logged-out-pending state").

## 6. Thao tác nhạy cảm & re-auth

- `POST /api/v1/auth/class-password {current_password, new_password}` → `{changed:true, sessions_revoked_other:N}` — thu hồi phiên KHÁC, giữ phiên hiện tại.
- `POST /api/v1/auth/class-code {current_password, new_code}` → `{login_code:"HSxxx", changed:true}`.
- `POST /api/v1/auth/class-display-name {current_password, display_name}` → `{display_name, identity_basis:"self_declared"}`.
- Web map theo `loginMethod`: phiên đăng nhập mã lớp → các endpoint class-*; phiên Zalo (mini) → `PUT /auth/me` như cũ. Sai mật khẩu hiện tại → 403 `reauth_failed`, UI render danh sách `details.messages` của server (test web chốt cả hai case).

## 7. Đăng xuất & thu hồi

- `POST /api/v1/auth/logout` → server thu hồi token; sau đó gọi `/auth/me` bằng token cũ → **401 `authentication_failed`**. Bằng chứng S14.
- Quan sát trung thực: 401 do token đã thu hồi có code `authentication_failed`, KHÁC với 401 do không gửi token (`not_authenticated`) — hai tình huống phân biệt được qua envelope. Không coi đây là rò rỉ bảo mật (cả hai đều 401), nhưng agent sau không nên "chuẩn hóa" vội nếu không có yêu cầu.

## 8. Demo mode `?demo=1`

- `?demo=1` trên web chọn mock adapter từ shared (`src/adapter/mock-adapter.js`), hiển thị demo banner, **không tạo token, không gọi API thật, không ghi state production** (test `qa-demo-isolation` web + purity shared). Tắt demo = trở lại adapter HTTP thật, phiên in-memory sạch.

## 9. CORS & origin

- CORS do backend env `CORS_ALLOWED_ORIGINS` điều khiển (exact origin, không wildcard); web không cần thay đổi backend. Bằng chứng S16: preflight từ `http://127.0.0.1:8080` → `Access-Control-Allow-Origin` đúng origin đó, không wildcard.
- Không gắn quyền nghiệp vụ vào Origin; token Bearer + object-level authorization phía backend vẫn là ranh giới thật. CORS chỉ là giảm thiểu.

## 10. Điều KHÔNG đổi sau khi tách

- Mini app giữ nguyên luồng đăng nhập SDK Zalo (`loginWithZaloToken`, silent login) trong glue `zalo-adapter.js`; dynamic import zmp-sdk đúng 1 chỗ.
- Không thêm storage bền vững cho token ở cả hai client; không lưu token vào URL; không log token/mật khẩu.
