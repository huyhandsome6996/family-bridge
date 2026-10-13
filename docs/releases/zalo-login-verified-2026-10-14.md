# Mốc đăng nhập Zalo đã nghiệm thu — 14/10/2026

Trạng thái: **hoàn chỉnh luồng kiểm thử đăng nhập thủ công Zalo thật**. Chủ dự án xác nhận thấy nút “Đăng nhập bằng Zalo”, bấm và vào được trên `zdev-4acc61e4`. Backend thử ghi auth/session200 và consents200. Mã nguồn đã merge PR#29 vào main ở commit `0008ceca75f6399a78ce8da9e78e479a1b3ade54`, cùng nội dung runtime với commit đã test `c011b855963665d7b7d6a3d2fee0c4f3c98124a6`.

Frontend171 PASS, build/manifest PASS; F01 backend115 PASS/4 SKIP (MySQL); core/accounts38 PASS/2 SKIP; CI PR#29 thành công. Fix bao gồm upload dynamic chunks, thông báo lỗi an toàn, manual-login profile và fixture UUID. Không thay package version0.3.0 chỉ để tạo tuyên bố release production; version nghiệm thu là Zalo DEV nói trên cùng Git SHA.

## Profile tái lập

Chạy tại `zalo-mini-app/` bằng Node đúng engines của package:

```powershell
$env:VITE_API_BASE_URL = '<URL HTTPS backend Việt Nam đang hoạt động>'
$env:VITE_TEST_LABEL = 'Kiểm thử đăng nhập · Việt Nam · bấm nút để bắt đầu'
$env:VITE_MANUAL_LOGIN_TEST = '1'
npm ci
npm test
npm run build
```

Thay placeholder bằng URL thật do người vận hành xác nhận trước build. Không commit URL tunnel tạm hoặc bí mật. Bản đã test dùng PC tại Việt Nam + SQLite cô lập + Cloudflare tunnel tạm; runtime PC và credential form không thuộc production repo. Chỉ merge source không khởi tạo lại backend đó. Khi runtime/tunnel ngừng, phải chạy lại cấu hình an toàn và build DEV với URL mới. Giữ App Secret ở backend; không chuyển vào VITE variables. SDK token chỉ dùng trong Zalo host, không giả login browser.

## Giới hạn nghiệm thu

Render hiện có Zalo-501 do IP egress ngoài Việt Nam; main không khắc phục hosting địa lý bằng UI. TiDB/MySQL production, race MySQL và luồng kết nối hai tài khoản trên thiết bị chưa được nghiệm thu trong phiên này. Các báo cáo F01 trước mốc này là lịch sử; nhận định “Zalo chưa chạy/Stitch chưa có” đã được bổ sung bằng login thật và bốn asset Stitch mới, không đồng nghĩa mọi F01 đã Done.

## Bàn giao UI

Prompt chuẩn: `docs/design/stitch-ui-upgrade/PROMPT.md`; design áp dụng: `docs/design/stitch-ui-upgrade/DESIGN.md`; bốn mẫu gốc: `docs/design/stitch-reference/`; logo gốc: `docs/design/assets/family-bridge-logo-reference.png`. Các tài liệu/asset không sửa mã runtime. Runtime analysis cho commit bàn giao: N/A, chỉ Markdown và reference tĩnh; không migration, query hay quyền mới.
