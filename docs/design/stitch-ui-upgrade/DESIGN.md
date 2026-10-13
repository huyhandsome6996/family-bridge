# Family Bridge — chuẩn áp dụng cho nâng cấp Stitch UI

## 1. Visual theme

Warm Sanctuary: thân thiện, nhẹ, nền kem hồng, card trắng và hồng rất nhạt, khối rust/amber tiết chế, ảnh gia đình và khoảng thở rõ. Bốn screenshot cùng HTML trong `docs/design/stitch-reference/` là chuẩn cụ thể. Logo chính chủ thay logo prototype là ngoại lệ có chủ đích. Không tự thiết kế lại bố cục hoặc biến app thành landing page chung.

## 2. Color roles

HTML của cả bốn mẫu dùng `surface/background #fff8f6`, `surface-container-lowest #ffffff`, `surface-container-low #fff0ee`, `surface-container #ffe9e5`, `primary #9d3d27`, `primary-container #bd543d`, `on-primary #ffffff`, `on-surface #360f07`, `on-surface-variant #56423e`, `outline #8a726c`, `outline-variant #ddc0ba`, `tertiary-fixed #ffddb2`, `tertiary-fixed-dim #f7bc65`. Các hardcoded màu của từng khối trong HTML vẫn phải kiểm tra riêng. Narrative DESIGN gốc có palette khác; không thay HTML/screenshots bằng narrative một cách máy móc. Logo giữ pixels/màu nguyên gốc. Semantic success/error/warning/info lấy UI rules và kiểm tra contrast từng pair, ghi ngoại lệ nếu cần.

## 3. Typography

Be Vietnam Pro, Vietnamese glyphs đầy đủ, 400/500/600/700. Headline nền tảng24/32 semibold, medium20/28, small18/24; body16/24, small14/20; label14/20 và12/16. Tiêu đề hero và các utility lớn riêng phải đo trực tiếp từ code.html. Wordmark là asset chính chủ, không typeset lại. Font asset có license; fallback không được là lý do tự đổi font mục tiêu. Ngắt dòng screenshot là phần nghiệm thu.

## 4. Component styling

Card trắng/tint bo mềm; controls/pills/shadows lấy từng mẫu và token chung. Header compact với logo/help/avatar; privacy chip rõ nhưng nhẹ; mood tiles có selected/focus/disabled; bottom nav5 mục đúng active. Logo tập trung một component, img có tỷ lệ/alt và kích thước. Prototype chỉ định mỹ thuật; consent, dữ liệu thật, inbox permission, pause300/preview/confirm vẫn theo hợp đồng sản phẩm. Không ship statistic1200 hoặc safety100% chưa xác thực.

## 5. Layout principles

Mobile fluid320–430px, tài liệu baseline390px; viewport screenshot gốc phải đo trước overlay. Gutters16px (compact12 theo mẫu), nhịp4/8px, chừa cuối trang/nav/safe-area. Welcome centered đúng ảnh; home theo stack card; compose theo recipient→intent→draft→pause→preview. Không ép asymmetry từ generic Taste. Màn thiếu screenshot mở rộng từ system, ghi rõ chưa có reference riêng. Không tràn ngang hoặc overlay che CTA/bàn phím.

## 6. Motion and interaction

Chuyển trạng thái ngắn150–200ms nếu cần, reduced-motion. Không perpetual animation, không auto-send/auto-consent. Busy phải có kết thúc/error; không retry mutation tự động. Route cleanup dọn listener/timer và bỏ async response lỗi thời. Help mở ngay; pause không chặn trợ giúp. Manual-login test profile giữ nút và không silent-login.

## 7. Anti-patterns

Không screenshot-as-page; không logo SVG giả/emoji/AI vẽ lại; không Tailwind CDN runtime, framework migration hoặc dependency upgrade chỉ vì style. Không hardcode tên/ngày/connection/online/unread hoặc sample draft thành dữ liệu thật. Không mặc định mock khi API thất bại. Không lưu token vào storage/URL/log. Không thay backend/tunnel/Render profile trong công việc UI. Không gọi browser demo, SQLite hoặc CI là bằng chứng production/TiDB. Mọi khác biệt so với ảnh phải có lý do và ảnh đối chiếu.
