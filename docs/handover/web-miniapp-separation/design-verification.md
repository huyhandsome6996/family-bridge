# Design verification — đối chiếu Stitch và ảnh thật

## Phương pháp (không phải chụp khơi khơi)

1. Build web **trong worktree thật** với `VITE_API_BASE_URL=http://127.0.0.1:8001` (exit 0) → `web/dist`.
2. Serve `web/dist` bằng `python3 -m http.server 8080` (static đúng cách Render sẽ làm).
3. Backend thật: Django `runserver 127.0.0.1:8001` (SQLite, `FB_ZALO_LOGIN_ENABLED=false`, CORS cho origin 8080), đã migrate + `provision_classroom` 4 tài khoản synthetic (HS001/HS002/PH001/PH002) + 2 proposal.
4. Headless browser (agent-browser) đăng nhập **thật qua form** — HS001 rồi PH001 — rồi mới điều hướng route để chụp. Không mock, không chụp trang lỗi xác thực.
5. Mỗi màn chụp 2 viewport: **1440x900** (desktop) và **390x844** (mobile) — đúng hai viewport đối chiếu Stitch.

## Kết quả

- 26 ảnh PNG trong [evidence/](evidence/): `login`, `consent`, `home`, `proposal`, `cards`, `mailbox`, `compose`, `signal`, `settings`, `privacy`, `help` (HS, desktop+mobile), `ph_consent`, `ph_home`, `ph_mailbox` (PH, desktop+mobile).
- `evidence/shots-manifest.json` — nhật ký từng lần chụp: fill form ok, hash sau login (`#/consent` → `#/home`), logout ok (`#/login?reason=logged-out`).
- Luồng chụp xác nhận: login → consent → home → các màn nghiệp vụ → logout về `#/login?reason=logged-out` (khớp chrome/flow 21 route).

## Đối chiếu Stitch

- Layout/flow khớp bộ thiết kế Stitch đã bàn giao trong `docs/handover/web-render/stitch-web-handoff.md` (map màn → route); web độc lập tái sử dụng đúng map đó vì trang được port nguyên văn (diff rỗng so với nguồn mini cho 8 trang phức tạp — cards 557, signal 633, message 522, mailbox 487, compose 970, proposal 511, settings 538, privacy 678 dòng).
- Deviation có chủ đích (đã ghi ở [route-feature-parity.md](route-feature-parity.md)): không mini-chrome; mailbox title-only (F05 không có snippet); compose gate copy "Đăng nhập để tiếp tục"; settings/privacy map theo capabilities class-*; `/messages/:id` pattern route web-only.
- Kiểm chứng responsive: sidebar app-shell 240px co/giãn giữa 1440 và 390; không phát hiện overflow ngang ở các màn đã chụp.

## NOT_RUN / giới hạn (trung thực)

- **Thiết bị Zalo thật**: NOT_RUN — không có thiết bị/môi trường Zalo trong phiên. Ảnh ở đây là web chạy trên Chromium headless desktop/mobile viewport; KHÔNG thay thế được kiểm thử Mini App trên Zalo (US-049).
- So sánh pixel-perfect tự động với file Stitch: KHÔNG có pipeline diff ảnh trong phiên; việc đối chiếu là thủ công theo map màn + tính nhất quán token CSS (đã copy nguyên khối styles).
- Các màn phụ thuộc backend chưa merge (F10 transport, AI provider) chỉ chụp được trạng thái UI render an toàn khi API trả lỗi fail-closed (không bị treo trắng) — không chụp được dữ liệu mẫu thật vì backend không sinh dữ liệu giả.

## Cách tái lập

Xem [verification-report.md](verification-report.md) mục "Cách tái lập nhanh" (3 lệnh: build web với VITE_API_BASE_URL, serve dist, mở trình duyệt). Ảnh PNG là bằng chứng tĩnh; tái lập sống cần backend chạy như mục E2E.
