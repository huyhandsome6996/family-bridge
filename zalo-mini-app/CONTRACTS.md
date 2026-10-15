# CONTRACTS — US-003 Mini App UI Foundation (Lead chốt trước khi agents viết)

Lead: Agent B. File này là hợp đồng interface giữa Lead, agent design system (3-a)
và agent pages (3-b). Không phá hợp đồng này; đề xuất thay đổi ghi vào PR để Lead review.

## 1. Quyền sở hữu file (không đụng chéo)

| Agent | Sở hữu (ghi/đổi) | Cấm đụng |
| --- | --- | --- |
| Lead | package.json, lockfile, vite.config.mjs, index.html, app-config.json, zmp-cli.json, .env.example, src/main.js, src/app/*, src/core/*, scripts/, tests, docs | — |
| Agent 3-a (design system) | src/styles/**, src/components/** | src/app, src/core, src/pages, package.json |
| Agent 3-b (pages) | src/pages/** | src/app, src/core, src/components (chỉ import), src/styles |
| Agent QA (4) | tests/** | src/** (chỉ đọc), package.json |

## 2. Stack bất biến

- HTML5 + CSS3 + JavaScript thuần (ES Modules). KHÔNG React, React Native, zmp-ui, jQuery, Tailwind, SASS, thư viện icon/font. Không thêm dependency nào (Lead là người duy nhất sửa package.json).
- zmp-sdk 2.53.0 đã cài — KHÔNG import trực tiếp trong components/pages. Mọi tương tác Zalo đi qua src/core/adapter/.
- Không animation ngoài transition 100–200ms transform/opacity; tôn trọng prefers-reduced-motion.

## 3. Component contract (Agent 3-a — src/components/*.js)

Mỗi component là một hàm nhận object options và TRẢ VỀ HTMLElement (dùng helper
`h` từ `../app/dom.js`). Tất cả đều thuần hiển thị, không gọi network/adapter.

- `createButton({ label, variant = "primary" | "cta" | "ghost" | "danger", size = "md" | "lg", disabled = false, type = "button", onClick, ariaLabel })` → `<button class="fb-btn fb-btn--{variant} fb-btn--{size}">`. Disabled PHẢI kèm lý do (thuộc tính `title` hoặc element `.fb-btn__hint` do caller cung cấp).
- `createInput({ id, label, hint, error, value = "", placeholder, required = false, maxlength, onInput })` → wrapper `<div class="fb-field">` chứa `<label>` luôn hiển thị + `<input class="fb-input">` + hint/error gần trường. Giữ nội dung khi lỗi.
- `createTextarea({ id, label, hint, error, value = "", maxlength, rows = 4, onInput })` → tương tự Input, `.fb-textarea`.
- `createList({ items, renderItem(item, index) })` → `<ul class="fb-list">`, mỗi item `<li class="fb-list__item">`; nếu rỗng caller phải render EmptyState, không render list rỗng.
- `createCard({ title, description, footer, children, variant = "default" | "brand" })` → `<section class="fb-card">`.
- `createSheet({ title, content, actions = [], onClose })` → bottom sheet `<div class="fb-sheet">` + overlay `.fb-overlay`; đóng bằng nút X, backdrop; focus vào sheet khi mở, trả focus về caller khi đóng; role="dialog" aria-modal.
- `createDialog({ title, message, actions = [{ label, variant, onClick }] })` → dialog trung tâm role="alertdialog"/"dialog"; focus trap tối thiểu: focus action đầu, Esc đóng nếu không phải destructive.
- `createStatusBadge({ tone = "success" | "warning" | "error" | "info" | "neutral", label, icon })` → `<span class="fb-badge fb-badge--{tone}">`; KHÔNG dùng màu chấm cảm xúc học sinh.
- `createSkeleton({ variant = "line" | "card" | "circle", count = 1 })` → khối giữ kích thước, class `.fb-skeleton`.
- `createEmptyState({ title, description, action })` → `.fb-empty`; action là { label, onClick } hoặc null; mô tả nêu bước tiếp theo.
- `createErrorState({ title, description, retryLabel, onRetry })` → `.fb-error`; luôn có cách tiếp tục (thử lại hoặc về trang chủ).
- `createTopBar({ title, showBack = false, onBack })` → chỉ title + back bên TRÁI; không đặt nút nào góc phải (vùng menu Zalo).
- `createBottomNav({ items, active, onNavigate })` → `<nav class="fb-bottom-nav" aria-label="Điều hướng chính">`; items cố định từ `../app/nav.js`: trang chủ, đồng hành, hộp thư, nhật ký, cá nhân; item active có aria-current="page"; vùng chạm ≥44px; icon dùng SVG inline có `<title>` tiếng Việt.
- `createDemoBanner()` → `<div class="fb-demo-banner" role="status">Dữ liệu minh họa — chế độ xem trước</div>`.
- `createLogo({ size = "md" })` → SVG inline 2 bong bóng lời thoại (placeholder, kèm comment "PLACEHOLDER chờ asset logo mẫu 03 được duyệt — brand-identity.md").
- Barrel `src/components/index.js` re-export tất cả.

## 4. CSS contract (Agent 3-a — src/styles/*.css)

- Files: `tokens.css` (biến), `base.css` (reset + layout + container), `components.css` (tất cả class .fb-*), import tuần tự từ main? KHÔNG — Lead import `src/styles/index.css` (agent tạo file này gồm 3 @import).
- Tokens bắt buộc (không đổi giá trị): `--fb-primary:#C65B43; --fb-accent:#E4AB56; --fb-bg:#FFF4E8; --fb-text:#713D32; --fb-text-secondary:#475569; --fb-surface:#FFFFFF; --fb-cta:#A84733; --fb-on-cta:#FFF4E8; --fb-success:#166534; --fb-success-bg:#F0FDF4; --fb-warning:#92400E; --fb-warning-bg:#FFFBEB; --fb-error:#B91C1C; --fb-error-bg:#FEF2F2; --fb-info:#1E40AF; --fb-info-bg:#EFF6FF; --fb-border:#64748B; --fb-focus:#A84733; --fb-radius-control:8px; --fb-radius-group:12px;`
- Spacing thang 4/8/12/16/24/32; padding ngang trang 16px; body 16px line-height 1.5–1.6; heading 20–24px.
- Một cột, container max-width 480px căn giữa; `env(safe-area-inset-bottom)` cho bottom nav; KHÔNG 100vh cứng (dùng min-height:100dvh + fallback 100vh).
- Focus visible `outline: 2px solid var(--fb-focus)`. Touch target ≥44px. prefers-reduced-motion: tắt transition/animation không thiết yếu.
- Chữ #713D32 trên nền #FFF4E8 (8.01:1) là mặc định; CTA #A84733 + chữ #FFF4E8 (5.36:1); KHÔNG dùng #FFF4E8 trên #C65B43 cho chữ nhỏ.

## 5. Page contract (Agent 3-b — src/pages/<ten>/index.js)

```js
export const page = {
  id: "u01-welcome",
  title: "Family Bridge",
  requiresRole: false,       // true → router redirect về #/role-select nếu chưa chọn vai trò
  showBottomNav: false,      // true → router gắn bottom-nav (trang hub)
  render(ctx) { return HTMLElement; }, // ctx: { store: { getState, setRole }, adapter, navigate, setRole, rebuildAdapter, params }
};
// ctx.store là API object (getState/setRole), KHÔNG phải snapshot.
```

### Addendum (Web Render — Task 2, 10/2026)

Mở rộng page contract cho bản web, ADDITIVE (không phá màn cũ):

- `page.requiresAuth: true` → router yêu cầu phiên sống (hasLiveSession) TRƯỚC
  `requiresRole`; chưa có → redirect `#/login?reason=expired`. Demo (?demo=1)
  được coi như phiên xem trước minh họa và được cho qua.
- `page.chrome: "app"` → router bọc content trong `createAppShell` (sidebar 6
  mục + topbar web). Mặc định `"bare"` — hành vi cũ giữ nguyên. Trang
  chrome:"app" KHÔNG tự render app-header riêng (tránh double chrome); trang
  "bare" giữ header hiện có.
- Pattern routes: route dạng `"/messages/:id"` — sau khi exact match thất bại,
  router tách segment và khớp `:param`, gộp giá trị vào `ctx.params`
  (URLSearchParams, giá trị được `decodeURIComponent`).
- Sidebar item "Hộp thư" có badge số chưa đọc; router cập nhật từ
  `listMessages` ĐÃ TẢI thật (received && !read), lỗi → ẩn badge (không bịa).
Import component từ `../../components/index.js`, dùng `h` từ `../../app/dom.js`,
không import trực tiếp file trong src/core (chỉ qua ctx.adapter / ctx.store).

### Copy tiếng Việt bắt buộc từng màn (theo UI rules: động từ cụ thể, không hứa chữa trị/24/7, help luôn mở)

1. **U01 welcome** (`/welcome`): logo placeholder + "Family Bridge" + tagline "Nhịp cầu lắng nghe giữa học sinh và người đồng hành." + mô tả ngắn 1 đoạn: app giúp hai bên mở lời, lắng nghe, không thay thế hỗ trợ chuyên môn. CTA chính "Bắt đầu" → `/how-to-use`. Liên kết phụ "Tìm trợ giúp" → `/help` (luôn hiển thị).
2. **U02 how-to-use** (`/how-to-use`): tiêu đề "Cách dùng Family Bridge"; 4 bước dạng danh sách card: (1) Chọn vai trò xem trước, (2) Kết nối hai bên bằng mã mời (sắp có), (3) Dùng thẻ cảm xúc và hộp thư để mở lời, (4) Đồng hành 4 tuần tự nguyện. Ghi chú: "Bản xem trước dùng dữ liệu minh họa, chưa có đăng nhập." CTA "Tiếp tục" → `/role-select`.
3. **U04 role-select** (`/role-select`): tiêu đề "Bạn muốn xem giao diện của ai?"; 2 card lớn (touch target lớn): "Con (học sinh THPT)" → setRole('student') → `/home`; "Người chăm sóc" → setRole('caregiver') → `/home`. Ghi chú rõ: "Đây là chế độ xem trước giao diện, chưa tạo tài khoản hay phiên đăng nhập." Không precheck, không auto-chọn.
4. **Home** (`/home`, requiresRole, showBottomNav): dispatch theo store.role.
   - Chưa kết nối (fixture getConnectionStatus throw/501 ở mode zalo — hiển thị trạng thái "chưa kết nối" an toàn): EmptyState "Chưa kết nối với người đồng hành" + mô tả kết nối bằng mã mời sắp ra mắt + nút "Tìm hiểu cách kết nối" mở Sheet giải thích (không gọi API, không báo đã gửi mời).
   - Student đã kết nối (demo): chào theo tên fixture; card "Thẻ cảm xúc" (mô tả, nút "Sắp có" disabled có title lý do); card "Tiếng lòng chưa nói — Tuần 1"; card "Hộp thư" → `/mailbox`; nút "Con cần được lắng nghe" mở Sheet chọn người nhận demo → thông báo "Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ" (KHÔNG tự gửi, KHÔNG báo đã gửi).
   - Caregiver (demo): chào theo tên fixture; card "Tín hiệu cần được lắng nghe" trạng thái "chưa có tín hiệu mới" (empty); card "Bài học ngắn 60 giây" → "Sắp có"; card "Hộp thư" → `/mailbox`.
   - Mọi home demo: DemoBanner + badge "Dữ liệu minh họa" gần tên người kết nối fixture.
5. **Hub Đồng hành** (`/companion`, showBottomNav): 4 tuần fixtures từ `ctx.adapter`-independent (import fixtures qua prop page? KHÔNG — hub đọc fixtures bằng cách render state "xem trước" tĩnh từ copy trong page; tuần 1 có nút "Xem trước chủ đề" mở Sheet tóm tắt; tuần 2–4 badge "Sắp có"; ghi chú "Lộ trình tự nguyện, bạn có thể bỏ qua hoặc quay lại bất cứ lúc nào.").
6. **Hub Hộp thư** (`/mailbox`, showBottomNav): EmptyState "Chưa có tin nhắn nào" + "Khi hai bên đã kết nối, lời nhắn và phản hồi nhanh sẽ xuất hiện ở đây." + nút phụ "Kiểm tra kết nối máy chủ" → `/connection-check`.
7. **Hub Nhật ký** (`/diary`, showBottomNav): EmptyState "Nhật ký sẽ mở ở bản đầy đủ" + mô tả nhật ký riêng/song hành là nội dung cá nhân, chia sẻ từng trang do bạn chọn.
8. **Hub Cá nhân** (`/profile`, showBottomNav): tên role đã chọn + nút "Đổi vai trò xem trước" (setRole(null) → `/role-select`); mục "Quản lý chia sẻ & đồng ý" — hàng disabled "Sắp có" kèm giải thích ngắn; mục "Kiểm tra kết nối máy chủ" → `/connection-check`; mục "Tìm trợ giúp" → `/help`; dòng phiên bản "Phiên bản xem trước US-003".
9. **Connection-check** (`/connection-check`): 1 màn duy nhất chạy khi mở; các trạng thái: loading (skeleton/spinner + "Đang kiểm tra kết nối với máy chủ…") → success (badge success "Đã kết nối tới máy chủ") → error (ErrorState + nút "Thử lại") → timeout (ErrorState "Kết nối quá thời gian chờ" + nút "Thử lại"). Gọi tuần tự adapter.getBackendHealth() rồi getBackendReady(); demo mode cho phép chọn kịch bản (ok/error/timeout) bằng 3 nút rõ ràng "Giả lập: thành công / lỗi / timeout" — chỉ hiện ở demo; production KHÔNG có nút giả lập. Cleanup timer/request khi rời trang (page.destroy).
10. **Help** (`/help`): tiêu đề "Tìm trợ giúp"; intro ngắn: khi cần trò chuyện với ai đó ngay, danh sách đầu mối `ctx`-agnostic render từ page: mỗi mục hiển thị "Thông tin đang được xác minh" (không có số điện thoại, không bịa hotline); khối "Thông tin nhà phát triển": tên dự án Family Bridge, "Phiên bản 0.3.0 (US-003)", kênh khiếu nại/hỗ trợ: "Thông tin đang được cập nhật" — không bịa. Luôn hiển thị, không yêu cầu đăng nhập/kết nối.

## 6. An toàn bất biến cho cả hai agent

- Không tạo nút giả hành động rồi báo đã lưu/gửi thật; mọi tính năng chưa làm → "Sắp có" + giải thích.
- Không tự tạo session/token/admin; role chỉ là lựa chọn xem trước.
- Text người dùng chỉ qua textContent (h()); không innerHTML với chuỗi động.
- Không analytics, không remote asset, không font/icon lib mới.
- Không precheck consent; không coi user đã đồng ý điều gì.
- UI copy tiếng Việt có dấu đầy đủ; không mã lỗi kỹ thuật trong luồng người dùng.
