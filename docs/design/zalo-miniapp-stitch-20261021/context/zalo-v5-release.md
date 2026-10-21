# Family Bridge — bàn giao Zalo Testing v5

Ngày 21/10/2026, khoảng 10:36–10:41 giờ Việt Nam/Thái Lan.

**Đã deploy thật:** Zalo CLI 4.0.3 trả `Deploy Done` và `Version: 5`.
Đích Mini App: `3411096375330044972`, trạng thái **Testing**.

[Mở bản Testing phiên bản 5](https://zalo.me/s/3411096375330044972/?env=TESTING&version=5)

QR trong `family-bridge-v5-testing-qr.png` được khôi phục từ chính QR mà CLI
trả về sau upload; giải mã lại khớp app ID, env=TESTING và version=5.
Đây chưa phải bản đã xét duyệt trên App Store.

## Bản sửa

- Baseline fetch từ main: `fc9e524eefd711c6ef76b055f1efe0be1816f733`.
- Commit đã build/upload: `0eea109adb893867dbbe1e5ffbb07f2221559133`.
- PR head sau sửa bổ sung cấu hình CI: `0bfa27d68a99c02dc4bd7afa0b43f13a193f1925`.
- [PR #44](https://github.com/huyhandsome6996/family-bridge/pull/44), Draft, chưa merge.
- Bundle: `zalo-mini-app/www`, URL API thực sự có trong JS:
  `https://family-bridge-backend.onrender.com`.

Thông báo thiếu địa chỉ máy chủ xảy ra trước khi gọi đăng nhập. Tệp
`.env.example` không tự được Vite nạp. Đã build bằng biến công khai đúng,
thêm guard chặn URL thiếu/rỗng/không phải HTTPS origin trước sinh bundle,
và verifier so sánh public metadata với JS, kiểm tra đủ manifest/tài nguyên.
Không reset mật khẩu, không bật SDK login, không đổi luồng tài khoản HS/PH.

Files chính: `zalo-mini-app/vite.config.mjs`, `scripts/build-config.mjs`,
`scripts/verify-build.mjs`, `tests/build-config.test.mjs`, fixture artifact
test, `package.json`, hai workflow Mini App. Backend chỉ bổ sung tên biến AI
và placeholder trong `.env.example`; không đổi runtime AI.

## Kiểm chứng

| Phần | Kết quả |
|---|---|
| Mini App local | 441/441 tests PASS |
| Web local | 358/358 tests PASS |
| Backend core health/ready/classroom integration | 11/11 PASS, SQLite |
| Build Mini App và web | PASS |
| Build thiếu API URL | FAIL đúng thiết kế trước sinh bundle |
| Manifest/bundle | 42 JS/CSS assets xác minh, SHA-256 tại release-v5.json |
| Secret-pattern scan bundle | PASS; không phải chứng nhận không có mọi loại secret |
| Import boundary + git diff --check | PASS |
| Production /api/v1/health/ + /api/v1/ready/ | HTTP 200 trong phiên này |
| Zalo upload | PASS, Testing v5; deploy log kèm theo |
| HS/PH login thật + đúng người đồng hành trên thiết bị | NOT_RUN |
| Gemini thật + consent + soạn/hồi âm trên hai client | DEFERRED theo lựa chọn của Huy |
| Render deployed SHA, Docker override, Gunicorn logs | NOT_VERIFIED, không có kênh quản trị Render |

CI Linux tại commit build: miniapp/web/mobile/agent-docs/production-guard/
mysql-checks PASS. `mysql-checks` chỉ chứng minh phạm vi workflow đó, không
chứng minh auth production hoặc MySQL race.

CI backend còn hai lỗi ngoài diff: harness thiếu parent migration
`accounts.0001_initial` được `f16_classroom.0003_seed_pilot_accounts` tham chiếu;
sqlite-checks thấy migration chưa tạo cho việc gỡ constraint
`admin_core.uniq_content_key_revision`. Không tự sửa schema trong đợt upload
Mini App. Workflow miniapp-foundation ban đầu thiếu public API origin và đã
được bổ sung trong commit head. CI tại head `0bfa27d`: miniapp,
test-and-build (foundation), web và agent-docs đều PASS.

`check_agent_docs.py` local báo checksum hai file Taste do checkout CRLF;
đã đối chiếu Git và xác nhận chỉ khác line ending; CI Linux agent-docs PASS.
Lần chạy F04 trực tiếp qua backend settings lỗi import `labgrants`, không
tính PASS. Suite đó cần feature-lab harness; AI đã được Huy hoãn.

## Thử trên điện thoại

1. Dùng Zalo quét QR hoặc mở link Testing v5; đóng phiên Mini App cũ trước.
2. Đăng nhập mã HS/PH và mật khẩu được cấp qua kênh riêng.
3. Kiểm tra không còn báo thiếu địa chỉ máy chủ và người đồng hành đúng.
4. Thử soạn/lưu nháp và đăng xuất. AI để sau theo yêu cầu của Huy.

[Web đăng nhập](https://family-bridge-web.onrender.com/#/login),
[web soạn thư](https://family-bridge-web.onrender.com/#/compose).
Không deploy backend/web trong lần upload này; commit đang live của Render
chưa được xác minh. Không sửa migration hay dữ liệu production.

## Vận hành

Đã chạy `node work/deploy-testing.cjs`: wrapper kiểm tra token local đúng
app/còn hạn, xác minh bundle, staging www mới rồi gọi CLI với
`deploy --existing --passive --testing --outputDir www` và mô tả commit.
Không in token. CLI cũ có cảnh báo thay TLS default; wrapper đã ép
`rejectUnauthorized: true` cho HTTPS request trước upload.

Rollback là tải lại một build Mini App tốt đã xác minh URL backend; không
cần rollback/xóa database. Các secrets từng xuất hiện trong ảnh vẫn cần
được chủ tài khoản thay mới qua console an toàn; không sử dụng lại giá trị
từ ảnh/chat. Runtime AI chưa được kiểm tra hoặc thay đổi.
