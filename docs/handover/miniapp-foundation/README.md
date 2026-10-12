# Bàn giao nền tảng Mini App — US-003 (Agent B / frontend foundation)

Ngày bàn giao: 11/10/2026 · Nhánh: `feat/us-003-miniapp-ui-foundation` · Baseline main: `c2c285a28a6214c8199c438b62c82b080f15be46`

Nhãn kết quả: **"frontend foundation/demo đã kiểm tra cục bộ"**. KHÔNG phải "đăng nhập Zalo hoàn thành", "15 tính năng hoàn thành" hay "Zalo đã duyệt".

## 1. Đã làm

- Scaffold lại `zalo-mini-app/` từ template React sang **JS thuần ES Modules + Vite 8 + zmp-sdk 2.53.0** (không React/zmp-ui/jotai/Tailwind/SASS) theo chỉ thị stack bắt buộc đợt này.
- Design system thuần: 16 shared components + tokens (primary #C65B43, accent #E4AB56, background #FFF4E8, text #713D32, CTA #A84733/on-CTA #FFF4E8), một cột mobile, spacing 4/8/12/16/24/32, focus-visible, touch target ≥44px, prefers-reduced-motion, safe-area fallback.
- Màn hình mở đầu: U01 chào mừng, U02 giới thiệu, U04 chọn vai trò (chỉ xem trước, không tạo auth session), U08/U09 home học sinh (đã/chưa kết nối), U10 home người chăm sóc — toàn bộ bằng fixture synthetic có nhãn "Dữ liệu minh họa".
- 5 hub điều hướng (Trang chủ / Đồng hành / Hộp thư / Nhật ký / Cá nhân) với trạng thái empty/"Sắp có" rõ ràng; lộ trình 4 tuần mức xem trước (tuần 1 xem trước chủ đề, tuần 2–4 "Sắp có", tự nguyện bỏ qua).
- Màn kiểm tra kết nối backend: loading / success / unavailable (ready-503) / error qua adapter mock (`?demo=1&scenario`) hoặc thật (`GET /api/v1/health/`, `GET /api/v1/ready/` theo docs/contracts/api-foundation.md). Lỗi phân loại theo `kind` của ApiError (configuration/network/timeout/http/invalid_response — gắn tại nơi ném): thiếu `VITE_API_BASE_URL` → "Chưa cấu hình địa chỉ máy chủ" (kèm hướng dẫn cấu hình), lỗi mạng → "Chưa kết nối được máy chủ" + Thử lại, timeout thật → "Kết nối quá thời gian chờ", JSON hỏng/lỗi khác → "Không kiểm tra được kết nối"; lỗi không có `kind` → lỗi chung, không bao giờ bị coi là timeout (xem connection-check-fix-report.md).
- Lối "Tìm trợ giúp" luôn truy cập, không cần đăng nhập; đầu mối hiển thị "Thông tin đang được xác minh" (không bịa hotline); khối thông tin nhà phát triển + phiên bản (Điều 5.5.a).
- Tách bạch adapter: `mock-adapter` (chỉ demo mode) và `zalo-adapter` (production boundary cho US-004/Antigravity). Không fallback tự động; lỗi luôn hiển thị trung thực.
- Tests: 97/97 pass (node:test + happy-dom) — adapter, router, demo isolation, no-auto-send, secrets/privacy scan, components, pages smoke, phân loại lỗi connection-check (18 test Task 13-c).
- CI workflow `.github/workflows/miniapp-foundation.yml` (npm ci → test → build → secret scan → artifact).
- Port từ nhánh `feat/us-003-kt01` (PR #1) sau review: `src/core/api/client.mjs` (nguyên vẹn), `scripts/verify-build.mjs`, ý tưởng zaloManifest trong `vite.config.mjs`. Không port thay đổi backend (render.yaml) của nhánh đó.

## 2. Còn lại (không thuộc đợt này)

- Đăng nhập Zalo thật, tạo connection/grant/session, 15 tính năng nghiệp vụ, màn chi tiết mood/nhật ký/messages/AI/admin — boundary đã ghi trong `zalo-adapter.js` (ném lỗi 501, không giả dữ liệu).
- Thiết kế chi tiết theo Stitch exports: repo không có export/assets Stitch ở baseline (xem `stitch-mapping.md`).
- Asset logo mẫu 03 nguồn: chưa có trong repo → dùng placeholder SVG có nhãn rõ, chờ asset được duyệt (brand-identity.md, DEC-07).

## 3. Vướng / cần quyết định

- **5 tab bottom nav vs Zalo Design Guidelines (≤4 tab)**: đề bài đợt này chốt 5 mục; DG khuyến nghị ≤4. Đã giữ 5 mục + tham số hóa `NAV_ITEMS` để hạ xuống 4 dễ dàng; cần Antigravity kiểm tra thực tế và Huy chốt.
- **AGENTS.md/ui-rules/DEC-01 trên main ghi "giữ React/Vite + zmp-ui"** trong khi chỉ thị đợt này chốt JS thuần, cấm React/zmp-ui: đã theo chỉ thị đợt này và ghi discrepancy — cần cập nhật tài liệu quy tắc ở nhiệm vụ riêng để nhất quán với US-004.
- Phân loại danh mục dịch vụ khi đăng ký Mini App (education/verification): cần Huy chốt trước khi tạo app thật (xem zalo-policy-report.md mục 4.2).

## 4. Bằng chứng

- `npm test`: 79/79 → sau khi bổ sung 18 test phân loại lỗi connection-check (Task 13-c): **97/97 pass**; `npm run build`: "Verified Zalo app-config and all referenced assets" (xem worklog các Task 3-a/3-b/4/13-c và CI).
- Commands: `cd zalo-mini-app && npm ci && npm test && npm run build` — xem hướng dẫn `docs/setup/miniapp/README.md`.
- Browser preview + `?demo=1` đã kiểm tra local; **webview Zalo Android/iOS chưa kiểm tra** — Antigravity tiếp nhận (checklist riêng).
