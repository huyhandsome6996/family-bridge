# Screen/component inventory và mapping Stitch — US-003

## Trạng thái nguồn Stitch

**Repo baseline `main c2c285a` KHÔNG có thư mục export/screens/assets của Stitch** (chỉ có docs/design/brand-identity.md). Thiết kế Stitch của Huy chưa được đưa vào repo ở thời điểm bàn giao. Do đó:

- UI xây theo **tokens đã chốt** (brand-identity.md/DEC-07) + mô tả mã màn trong chỉ thị US-003 + quy tắc docs/engineering/ui-rules.md.
- **Không màn nào được coi là đã khớp pixel với Stitch.** Cột "Pixel match" dưới đây là `chưa đối chiếu` cho tất cả.
- Khi Stitch exports được đưa vào repo, đối chiếu lại từng màn và ghi discrepancy trong PR tiếp theo.

## Inventory màn hình

| Mã | Route | File | Nội dung đã làm | Pixel match Stitch |
| --- | --- | --- | --- | --- |
| U01 | `#/welcome` | src/pages/welcome/index.js | Chào mừng: logo placeholder, tagline, mô tả ngắn, CTA "Bắt đầu", lối "Tìm trợ giúp" | Chưa đối chiếu |
| U02 | `#/how-to-use` | src/pages/how-to-use/index.js | 4 bước cách dùng; ghi chú xem trước + dữ liệu minh họa | Chưa đối chiếu |
| U04 | `#/role-select` | src/pages/role-select/index.js | 2 card vai trò (học sinh/người chăm sóc), không tạo session | Chưa đối chiếu |
| U08/U09 | `#/home` (student) | src/pages/home/index.js | Home học sinh đã kết nối (fixture, nhãn minh họa) / chưa kết nối (empty state + sheet giải thích kết nối) | Chưa đối chiếu |
| U10 | `#/home` (caregiver) | src/pages/home/index.js | Home người chăm sóc (fixture): tín hiệu trống, bài học 60s "Sắp có", hộp thư | Chưa đối chiếu |
| — | `#/companion` | src/pages/companion/index.js | Hub Đồng hành: lộ trình 4 tuần xem trước, tuần 1 mở preview, 2–4 "Sắp có" | Chưa đối chiếu |
| — | `#/mailbox` | src/pages/mailbox/index.js | Hub Hộp thư: empty state + lối kiểm tra kết nối | Chưa đối chiếu |
| — | `#/diary` | src/pages/diary/index.js | Hub Nhật ký: "sẽ mở ở bản đầy đủ", nhấn mạnh riêng tư | Chưa đối chiếu |
| — | `#/profile` | src/pages/profile/index.js | Vai trò đã chọn, đổi vai trò, quản lý chia sẻ "Sắp có", phiên bản | Chưa đối chiếu |
| — | `#/connection-check` | src/pages/connection-check/index.js | loading/success/error/timeout; demo có 3 nút giả lập kịch bản | Chưa đối chiếu |
| — | `#/help` | src/pages/help/index.js | Tìm trợ giúp: đầu mối "đang được xác minh", khối nhà phát triển | Chưa đối chiếu |
| — | `#/…` khác | src/pages/not-found/index.js | Trang 404 an toàn + lối về | — |

## Component inventory (src/components/)

button, input, textarea, list, card, sheet (focus trap cơ bản), dialog, skeleton, empty-state, error-state, status-badge, top-bar (title + back trái, trống góc phải cho menu Zalo), bottom-nav (5 mục, aria-current, tham số hóa), demo-banner ("Dữ liệu minh họa"), logo (placeholder 2 bong bóng — **chưa phải asset duyệt**), barrel index.js.

## Boundary rõ ràng

- Logo: placeholder inline SVG theo mô tả "mẫu 03: hai biểu tượng lời thoại" — brand-identity.md cấm coi đây là asset đã duyệt; cần file nguồn từ đơn vị cung cấp.
- Không nhúng HTML standalone/CDN của bất kỳ export nào vào app (chỉ thị VI.C).
- Màn chi tiết mood/nhật ký/messages/AI/admin KHÔNG thuộc đợt này — không dựng "trước nửa vời" gây hiểu nhầm đã có tính năng.
