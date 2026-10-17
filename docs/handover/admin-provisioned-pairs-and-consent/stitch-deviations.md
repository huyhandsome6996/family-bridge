# Stitch → sản phẩm thật: giữ baseline, từng chỉnh sửa bắt buộc + lý do

Nguồn tham chiếu: `design/stitch-consent-original.html` (bản paste gốc,
shell-type=web_standard). Bản dán gốc KHÔNG phải ứng dụng đã nối API —
đây là danh sách đầy đủ những gì giữ / sửa / bỏ, theo
`02-STITCH-HANDOFF-NOTES.md`.

## Giữ nguyên (visual baseline)

- Nền ấm `--fb-bg` (#FFF8F6), form trắng, điểm nhấn rust `--fb-primary`
  (#9D3D27), chip vàng `--fb-secondary-fixed` (#FFDDB2), chữ `--fb-text`
  (#360F07) — dùng đúng token hiện có, KHÔNG đổi token toàn cục.
- Bố cục desktop: hai cột chủ ý 5/7 trong khung tối đa ~1240px (aside ngữ
  cảnh trái + form quyết định phải); <1024px sập thành một cột đọc dọc.
- Font Be Vietnam Pro bundle cục bộ; thang chữ; nhóm "Cần để tiếp tục —
  1 mục bắt buộc" tách khỏi nhóm "Các lựa chọn tùy chọn — 2 tùy chọn".
- Tiêu đề + lead + 3 điểm ngữ cảnh (chỉ mục bắt buộc / tùy chọn tự nguyện /
  xem lại & thu hồi); CTA "Xác nhận và tiếp tục"; chân trang thương hiệu.
- Logo thật: `createLogo` (PNG approved trong repo, cả hai client) —
  KHÔNG vẽ lại logo bằng icon hay chữ.

## Chỉnh sửa bắt buộc (mỗi mục có lý do)

| # | Prototype | Bản thật | Lý do |
| --- | --- | --- | --- |
| 1 | Logo mock `diversity_1`/`favorite` | Logo PNG thật qua `createLogo` | Handoff #1 |
| 2 | "Bảng kiểm thử trạng thái (QA Tools)" + 6 nút `setScreenState` | ĐÃ BỎ khỏi DOM/bundle (không chỉ ẩn CSS) | Handoff #2/#3 — test B01 chặn lại |
| 3 | Lưu giả `setTimeout(...)` + `alert(success)` | `recordConsent` thật + đối chiếu sổ cái + stale-guard | Handoff #4; không báo thành công giả |
| 4 | Chuỗi số "1" lặp trong khối icon | ĐÃ BỎ (nhiễu export) | Handoff #5 |
| 5 | Thẻ "Mã hóa bảo vệ gia đình" | ĐÃ BỎ — thay bằng điểm "tùy chọn tự nguyện" nói đúng hành vi | Không thiết lập kiến trúc mã hóa; copy trung thực (Handoff #6) |
| 6 | Alert "nghiên cứu ẩn danh hoàn toàn" | Không còn alert; mô tả research dùng nguyên văn policy.js (không claim ẩn danh tuyệt đối) | Handoff #7 |
| 7 | "Tắt AI … dùng ứng dụng trọn vẹn" | "…các tính năng không cần AI vẫn hoạt động bình thường, còn tính năng AI chỉ chạy khi bạn đồng ý cho AI xử lý" | Handoff #8 — đúng sự thật |
| 8 | `href="#"`/placeholder + link điều khoản "mở tab mới" | Nút "Xem chi tiết" mở **dialog trong app** với nội dung policy thật (mô tả + phiên bản + trạng thái hiện tại); nút nằm NGOÀI `label` nên không làm đổi checkbox | Handoff #9 + §10.13 brief |
| 9 | Breadcrumb giả "Thông tin gia đình" (không tồn tại) | Breadcrumb thật: "Thiết lập ban đầu › Quyền riêng tư & Cam kết" | Handoff #10 — không hướng dẫn người dùng đi bước không có |
| 10 | Tailwind runtime CDN + Google Fonts/Icons CDN | CSS thuần theo token hiện có + icon SVG inline sẵn trong repo; checkbox vẽ bằng SVG data-URI | Handoff #12/#13; không thêm dependency |
| 11 | Nút `min-width:260px` tràn 320px | CTA full-width mobile, `min-width` chỉ ở desktop ≤ 320px an toàn; nút chi tiết cho xuống dòng <360px | Handoff #14 |
| 12 | Custom checkbox dùng `peer-checked` (hệ thừa kế không cập nhật icon) | Input native `appearance:none` — hộp 24px + check thấy rõ, vùng chạm 44px, focus-visible outline | Handoff #15 — kiểm tay selector thật |
| 13 | Suppress scrollbar + pulse/rotation loop | Không có; `prefers-reduced-motion` tắt transition | Handoff #11 |
| 14 | Trạng thái QA mô phỏng (checked/outdated) | Trạng thái chỉ từ backend `listConsents` (accepted cùng phiên bản mới khôi phục; bản cũ hiển thị ghi chú) | Không biến mô phỏng thành consent thật |

## Thích ứng Mini App (khai báo trung thực)

Bản Stitch gốc chỉ có `web_standard` — KHÔNG có frame mobile riêng. Mini
App dùng CÙNG một bản port (byte-identical) với:

- một cột 320–430px, gutter 12–16px, cuộn tự nhiên;
- aside vẫn hiện TRÊN form (thứ tự đọc: ngữ cảnh → quyết định) — không
  phải desktop aside;
- CTA full-width, không panel QA, không cột 2;
- giữ vùng an toàn của host (không đụng safe-area vì action không sticky
  dưới — CTA nằm trong luồng, tránh che nội dung).

Đây là **thích ứng có chủ đích**, không phải "bản mobile đã được cung cấp".
