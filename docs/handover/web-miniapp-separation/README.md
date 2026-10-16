# Bàn giao — Tách Web độc lập khỏi Zalo Mini App (web-miniapp-separation)

Ngày: 2026-10-16. Nhánh: `tinh-nang/web-miniapp-separation` (base `origin/main` = `96deda1ffee190db339389428c38ca897c1481a9`).
Phạm vi: tách frontend web thành ứng dụng độc lập (`web/`) khỏi Zalo Mini App (`zalo-mini-app/`), dùng chung package headless `packages/family_bridge_shared/`, kèm chứng minh import-boundary, CI, cấu hình Render và bộ tài liệu bàn giao này.

## Trạng thái tóm tắt (trung thực)

| Hạng mục | Trạng thái |
| --- | --- |
| Shared headless package (client/session/endpoints/mock/contract) | DONE — 34/34 tests xanh, purity contract có kiểm chứng |
| Web độc lập 21 hash route + build `web/dist` | DONE — 187/187 tests, build exit 0 (44 assets) |
| Mini app không hồi quy (glue + 5 shim) | DONE — 279/279 tests, build + verify manifest Zalo exit 0 |
| Import boundary transitive (web↔mini↔shared) | DONE — 5/5 assert PASS, 0 unresolved (`evidence/import-boundaries.json`) |
| E2E hai actor trên API thật (Django + SQLite) | 16 PASS / 1 FAIL / 2 NOT_RUN — FAIL (S9 cards) do backend `transport_not_wired` fail-closed đúng thiết kế, KHÔNG phải lỗi web (chi tiết `verification-report.md`) |
| Ảnh viewport thật desktop + mobile | DONE — 26 PNG (`evidence/`), đăng nhập thật qua form |
| CI job `web` + boundary check | DONE (`.github/workflows/tests.yml`) |
| Render static service build `web/dist` | DONE cấu hình (`render.yaml`) — việc apply/verify trên Render là bước OWNER (xem `deployment.md`) |
| Thiết bị Zalo thật, MySQL/TiDB thật, AI provider thật | NOT_RUN — không có môi trường trong phiên; ghi rõ trong `verification-report.md` |

## 9 tài liệu của bộ này

1. [README.md](README.md) — mục lục + trạng thái (file này).
2. [reading-map.md](reading-map.md) — code ở đâu, đọc theo thứ tự nào, giả định đã dùng.
3. [architecture.md](architecture.md) — ADR-1..6: shared package, glue mini, web độc lập, Render/CI, session, rollback.
4. [authentication-flows.md](authentication-flows.md) — đăng nhập HS/PH, capabilities, consent, phiên in-memory, thu hồi, chống dò tài khoản.
5. [route-feature-parity.md](route-feature-parity.md) — 21 route web ↔ nguồn mini ↔ tính năng F01..F15 + khác biệt có chủ đích.
6. [design-verification.md](design-verification.md) — phương pháp + kết quả đối chiếu Stitch, ảnh thật 2 viewport.
7. [deployment.md](deployment.md) — Render/CI/Zalo release, biến môi trường, CORS, rollback, kiểm toán tương thích nhánh.
8. [verification-report.md](verification-report.md) — toàn bộ lệnh + số test đã chạy (kèm NOT_RUN/BLOCKED trung thực).
9. [next-agent.md](next-agent.md) — những gì agent tiếp theo phải biết: ownership, quy tắc biên giới, việc còn dang.

## Bằng chứng

Thư mục [evidence/](evidence/) chứa: 26 ảnh PNG (1440x900 + 390x844), `shots-manifest.json` (nhật ký chụp thật), `e2e-results.json` (S1–S16, đã quét không chứa token/mật khẩu), `import-boundaries.json` (báo cáo checker), `verification-log-w3a.md` (log xác minh checkout sạch + E2E).

## Quy tắc vàng của bộ tài liệu này

- `packages/family_bridge_shared/` là **nguồn duy nhất** của client HTTP, session, endpoint method, hợp đồng adapter, mock demo. Không tạo bản sao thứ hai.
- `web/` **không được** import UI/SDK của `zalo-mini-app/` và ngược lại; kiểm chứng bằng `node scripts/check_import_boundaries.mjs` (transitive, theo cả dynamic import).
- Không tự nâng trạng thái: mọi mệnh đề "đã kiểm chứng" trong bộ này phải trỏ được vào bằng chứng trong `verification-report.md` hoặc `evidence/`.
