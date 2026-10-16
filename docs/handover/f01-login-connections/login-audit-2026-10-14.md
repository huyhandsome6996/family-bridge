# Đối chiếu và kiểm thử đăng nhập Family Bridge — 14/10/2026

## Kết luận và phạm vi

Theo lời chốt của Huy, lần này chỉ kiểm tra đăng nhập, ánh xạ tài khoản và phiên; không nghiệm thu kết nối hai phía, không tổ chức nhóm thử, không merge/deploy/migrate database đang chạy. Luồng đăng nhập đang làm đúng kiến trúc mục tiêu trong phạm vi đọc code và kiểm thử đã chạy. Có một lỗi trả thông tin provider quá rộng đã tái hiện và sửa trên nhánh F01, chưa phát hành.

## Diễn giải nghiệp vụ

Khi một người mở Family Bridge trong Zalo, app dùng SDK lấy token của tài khoản Zalo đang đăng nhập. Token này là chứng cứ để máy chủ kiểm tra với Zalo, không phải một tên hoặc mã user do người dùng tự nhập. Nút “Tiếp tục với Zalo” trên welcome mới dẫn đến trang đăng nhập; trang đăng nhập gọi adapter khi người dùng bấm nút. Trong profile kiểm thử thủ công, app vào thẳng trang đăng nhập và không tự login. Bản thông thường có thể thử đăng nhập im lặng một lần khi mở lại.

Backend gửi token qua header cùng appsecret_proof tới Graph API, rồi mới ánh xạ danh tính provider về user nội bộ. Khóa ánh xạ gồm provider, ứng dụng cha và subject Zalo, nên đăng nhập lại cùng tài khoản vẫn là cùng user; mỗi lần có thể nhận token phiên mới. Tên gọi hiển thị do người dùng tự khai báo, không phải bằng chứng quan hệ pháp lý hay danh tính Zalo đã xác minh. Backend không tin role/user_id/is_admin do frontend tự gửi.

Có hai loại token ở luồng này: token Zalo do SDK lấy, và token phiên Family Bridge do backend cấp. App Secret chỉ ở máy chủ. Token app được lưu dạng hash trong database, token thô chỉ giữ trong bộ nhớ frontend và gửi bằng Authorization: Bearer. Không đưa token hay App Secret vào URL, build, QR hoặc log. QR chỉ chứa link phiên bản Mini App.

Đăng nhập thành công chưa có nghĩa người dùng đã đồng ý nghiên cứu, đã chọn vai trò hoặc đã kết nối. UI đọc consent hiện hành trước bước tiếp theo; service có gate riêng, AI và nghiên cứu là tùy chọn. Chọn học sinh/người chăm sóc là lựa chọn trải nghiệm, không tạo quyền admin. Logout xóa phiên frontend ngay và gửi thu hồi đúng token cũ; server từ chối token đã thu hồi/hết hạn. Response đến muộn của phiên cũ không được khôi phục hoặc xóa nhầm phiên mới.

Browser `?demo=1` dùng dữ liệu minh họa. Browser thường không được giả đăng nhập Zalo. Kiểm thử HTTP với provider giả lập chứng minh đường app/server/database hoạt động theo contract, nhưng không thay thế một lần đăng nhập SDK trên điện thoại thật.

## Các mốc đã xác minh

| Mốc | SHA/trạng thái |
| --- | --- |
| origin/main | `e1dcabf956cd40f8ae23964fdcb0cf34a36f94c5` |
| F01 PR #26 | merged, head `0817a8a6104ffa3ea8f76a9e5e06014d75150431` |
| Merge PR #26 | `88ce92320d3d9453a4ba54a764f00be780f4daf4` |
| PR #29 login/manifest | đã merge vào main |
| Giao diện đang thử, PR #30 | open, head `a1a56c77573b4106a0cccfc32caf074476f605b8` |
| PR #27 F15 | open, head `f4def4c229b9f7935d3890c58db099729b36e382` |
| PR #28 W036/MySQL | open, head `5a2a82e7d0a28b59f43f00fa831874ab9decb882` |

Worktree riêng `work/f01-audit` từ main; dùng lại nhánh `feat/f01-zalo-connections` để sửa. Bảo toàn worktree cũ và nhánh UI. Các file login/session/client/config/startup/main của nhánh Stitch không khác main; adapter chỉ bổ sung các method F06 sau phần F01, không thay luồng login.

## Truy vết code/API

| Bước | File/call path thực |
| --- | --- |
| Welcome CTA → login | `zalo-mini-app/src/pages/welcome/index.js` (bản Stitch) → `ctx.navigate('/login')` |
| Nút login + consent gate | `src/pages/login/index.js` → `adapter.loginWithZaloToken()` → `listConsents()` → consent/role/home |
| Startup | `src/main.js` + `src/core/login-startup.js`; manual test không silent login |
| SDK + đổi token | `src/core/adapter/zalo-adapter.js` → import động zmp-sdk/getAccessToken → POST `/api/v1/auth/session` body chỉ `{access_token}` |
| HTTP + auth | `src/core/api/client.mjs`; HTTPS, timeout15s, Bearer, không tự retry mutation |
| URL backend chính thức | `backend/config/urls.py` registry → F01 urls → `AuthSessionView` trong F01/api.py |
| Provider | `services/zalo_provider.py` → graph.zalo.me/v2.0/me?fields=id; token/proof ở header, timeout10s, response cap16KiB, allowlist TLS |
| User mapping + session | `services/identity.py`: verify ngoài transaction, ProviderIdentity unique(provider,app_id,subject), Session hash token/TTL24h |
| Quyền phiên | `auth.py` → resolve_session: kiểm tra expiry/revoked/user active; client role không cấp quyền |
| Bộ nhớ và request cũ | `src/core/session.js` generation; adapter kiểm tra generation trước/sau SDK/HTTP và bỏ response lỗi thời |
| Logout | POST `/api/v1/auth/logout` → revoke_by_token; client clearSession ngay, vẫn gửi token cũ đã chụp |

Các đường `src/...` trong bảng nằm dưới `zalo-mini-app/`; services/api/auth/models nằm dưới `packages/family_bridge_features/f01_identity/`.

## Lỗi đã tái hiện và sửa

Baseline backend trả `details.reason` gồm nguyên văn message Zalo. Với transport synthetic trả message chứa credential canary, canary xuất hiện trong response401. Frontend hiện che free text nhưng response HTTP vẫn lộ. Test mới FAIL trước sửa.

Sửa: giữ `reason='provider_rejected'`, chỉ bổ sung `provider_code` dạng số có dấu âm tùy chọn, tối đa8 chữ số. Không trả raw message/code không hợp lệ. Frontend main đã hỗ trợ structured provider_code nên không cần đổi SDK, payload hoặc UI. Sau sửa test canary PASS, code-501 vẫn dùng được để chẩn đoán. Không có token thật trong test/báo cáo.

## Bằng chứng kiểm thử lần này

| Kiểm tra | Kết quả | Môi trường/giới hạn |
| --- | --- | --- |
| Backend login-focused suite | 41 PASS, 0 SKIP | SQLite feature-lab; MD5 hasher chỉ trong tiến trình test để giảm thời gian fixture; provider transport synthetic |
| 4 test audit mới trên backend chính thức | 4 PASS | `backend/config/settings.py`, accounts.User, URL registry thật, database test riêng; hasher mặc định |
| Live HTTP login test (nằm trong 4 test trên) | PASS | TCP loopback thật: login200, me200, relogin cùng user, logout200, me token cũ401, phiên mới vẫn200; transport Zalo synthetic |
| Frontend F01 + login error/startup | 61 PASS, 0 SKIP | Trên source UI a1a56c7; DOM/SDK/fetch test doubles; gồm late response/session race |
| git diff --check | PASS | Source sửa chỉ verifier và regression login |
| Đăng nhập Zalo thật của bản cũ | Huy đã xác nhận PASS | zdev-4acc61e4, PC Việt Nam; bằng chứng phiên trước |
| Đăng nhập Zalo thật bản UI mới | CHƯA XÁC NHẬN trong lần audit | zdev-477d96d2 đã deploy ở phiên trước; không deploy lại trong audit |

Lệnh backend chính thức: `DJANGO_ENV=test FB_FEATURES=f01_identity DB_ENGINE=sqlite python backend/manage.py test family_bridge_features.f01_identity.tests.test_login_audit`. Test runner tự tạo database thử, không sửa database PC đang chạy. Lệnh frontend: `node --test tests/f01-flows.test.mjs tests/login-startup.test.mjs tests/login-error.test.mjs` trong zalo-mini-app của nhánh UI.

Một full F01 run khởi động trước khi Huy thu hẹp phạm vi cho kết quả119 tests:114 PASS,1 FAIL,4 SKIP. FAIL ở A02ConsentEffectivenessTests.test_declining_latest_does_not_resurrect_older_acceptance, không phải test xác minh token; fixture tạo hai timestamp quá gần và service tie-break theo UUID. Chưa kết luận nguyên nhân sản phẩm từ một run; giữ finding để audit consent riêng, không xóa test hoặc tuyên bố toàn F01 xanh. Kết quả login-focused41 và live4 ở trên đều PASS.

## Giới hạn còn lại

Không xác minh lại MySQL/TiDB, Render đang chạy SHA nào hay account Zalo thứ hai trong lần này. Render từng bị provider-501 vì IP egress ngoài Việt Nam; test PC thành công không chứng minh Render đã hết lỗi. Provider binding qua appsecret_proof được kiểm tra bằng fixture/contract, chưa chạy token thật của ứng dụng cha khác. Không đọc token/app secret của người dùng và không dùng credential đã lộ trong chat.

Nhánh sửa chưa merge/deploy. Việc sửa thông báo không thay đổi cách đăng nhập hoặc cấp phiên. Runtime analysis: regex diagnostic tối đa8 chữ số; response provider bị giới hạn16KiB; thời gian O(n) theo chuỗi code trong payload giới hạn, bộ nhớ phụ O(1) ngoài dữ liệu đã parse; không thêm query, migration, dependency hay quyền.

Nguồn đối chiếu Zalo: [Hướng dẫn đăng nhập](https://docs.zaloplatforms.com/docs/MA/intro/best-practices/authen-user), [Tài khoản nhà phát triển và mã ID theo app cha](https://docs.zaloplatforms.com/docs/MA/intro/intro/mini-app-account). Source repo và kết quả thực thi là bằng chứng implementation; tài liệu nền tảng không tự chứng minh triển khai của dự án.
