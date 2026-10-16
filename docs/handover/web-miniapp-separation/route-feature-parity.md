# Route & feature parity — web độc lập vs Zalo Mini App

Web giữ nguyên **21 hash path** của router hiện có (không phá link đang dùng). Bảng dưới map từng route → file web → nguồn mini → tính năng. Cột "Khác biệt" ghi rõ mọi lệch có chủ đích; những gì không ghi ở đây thì phải giống mini.

| # | Route | Web (`web/src/pages/…`) | Nguồn mini (`zalo-mini-app/src/pages/…`) | Tính năng | Khác biệt có chủ đích trên web |
|---|-------|--------------------------|------------------------------------------|-----------|-------------------------------|
| 1 | `/` | `welcome/` | `welcome/` | Onboarding | Không mini-chrome (bottom-nav/top-bar/demo-banner của mini không port) |
| 2 | `/welcome` | `welcome/` | `welcome/` | Onboarding | Như trên |
| 3 | `/how-to-use` | `how-to-use/` | `how-to-use/` | Hướng dẫn | Copy Zalo→web trung thực |
| 4 | `/role-select` | `role-select/` | `role-select/` | F01 | Role thực tế lấy từ server sau login; trang chỉ là flow phụ |
| 5 | `/home` | `home/` | `home/` | F02/F07 | Home HS + home PH; dữ liệu thật từ API |
| 6 | `/companion` | `companion/` | `companion/` | F02 | — |
| 7 | `/mailbox` | `mailbox/` | `mailbox/` | F05 | **Title-only + grouping theo kind** — API F05 list không có snippet; badge tính từ dữ liệu đã tải |
| 8 | `/diary` | `diary/` | `diary/` | F08 | — |
| 9 | `/profile` | `profile/` | `profile/` | F01/F16 | Re-auth: `loginMethod=class` → changeClassDisplayName kèm `current_password`; phiên Zalo (mini) → `PUT /auth/me` |
| 10 | `/connection-check` | `connection-check/` | `connection-check/` | US-003 | `errorKind`/`failureFor` import từ shared (semantics SC12–SC18 giữ nguyên; giữ 15s cho connection-check) |
| 11 | `/help` | `help/` | `help/` | F13 | — |
| 12 | `/login` | `login/` + `credential-form.js` | `login/` | F01/F16 | Web: mã lớp + mật khẩu theo capabilities; không silent-login Zalo; không implied consent |
| 13 | `/consent` | `consent/` | `consent/` | F01 | POST consents trả 201; chặn đến khi đủ purpose |
| 14 | `/connect` | `connect/` | `connect/` | F01 | Luồng invite classic giữ nguyên |
| 15 | `/compose` | `compose/` | `compose/` | F06/F04 | Gate copy "Đăng nhập để tiếp tục" (web không có CTA Zalo); pause 300s do server quyết; không time-picker |
| 16 | `/cards` | `cards/` | `cards/` | F10 | Pills 6 mã cố định map `group_code` |
| 17 | `/signal` | `signal/` | `signal/` | F07 | — |
| 18 | `/messages/:id` | `message/` | (mini đọc chi tiết trong mailbox) | F05 | Pattern route web-only; mini không có route riêng này |
| 19 | `/proposal` | `proposal/` | `proposal/` | F16/F01 | Confirm 1 → `awaiting_confirmation`; confirm 2 → `connected` (1 transaction phía backend) |
| 20 | `/settings` | `settings/` | `settings/` | F16 | Map theo `capabilities.settings` (`change_password/change_code/change_display_name`); false → thẻ disabled từ đầu |
| 21 | `/privacy` | `privacy/` | `privacy/` | F15 | Deletion request: tạo/thấy/hủy; overview; revoke làm mất truy cập ngay |

Route không khớp nào → `not-found` (không có trong bảng vì không phải path khai báo).

## Ranh giới cần nhớ khi thêm route mới

1. Route web khai báo trong `web/src/app/router.js` (exact trước, pattern `:param` sau); route mini trong `zalo-mini-app/src/app/router.js` — **hai file độc lập**, không import chéo.
2. Trang web chỉ được import từ `web/src/**` + `packages/family_bridge_shared/**`; cấm import `zalo-mini-app/**` (checker transitive sẽ fail CI).
3. Method API mới: thêm vào `packages/family_bridge_shared/src/adapter/http-endpoints.js` + tên trong `contract.js` (`ADAPTER_METHODS`) — sau đó glue mini và `web-adapter` tự có mặt qua merge/contract; **không** viết method trùng trong glue.
4. `requiresAuth` chạy trước `requiresRole`; chrome web là "app" (app-shell responsive), không dùng chrome mini.

## Parity test nào chứng minh bảng này?

- `web/tests/web-screens.test.mjs` — 78 it port từ mini, chỉ đổi path setup; assert hành vi từng trang.
- `web/tests/qa-web-invariants.test.mjs` — no CDN, no storage write, no zmp-sdk, banned copy, render.yaml path mới.
- `zalo-mini-app/tests/web-screens.test.mjs` — bản mini tương ứng (2201 dòng, giữ pin hành vi mini).
- checker `scripts/check_import_boundaries.mjs` — 5/5 assert (`evidence/import-boundaries.json`).
