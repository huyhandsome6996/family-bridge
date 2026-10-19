# Bàn giao (handover) — Family Bridge

Chỉ mục các bộ tài liệu bàn giao. Mỗi thư mục là một đợt/phạm vi bàn giao riêng;
nhãn kết quả của từng đợt phải đọc đúng như tài liệu đó ghi (không nâng trạng
thái vì docs tồn tại).

| Bộ tài liệu | Phạm vi |
| --- | --- |
| [f07-mood-sharing/](f07-mood-sharing/README.md) | F07 tâm trạng/lịch sử/chia sẻ từng mục (US-015/026): sửa 8 lỗi tái hiện được, wiring F15/F01 thật, Mini App /mood + /mood-shared, E2E 21 bước, giới hạn MySQL/Zalo |
| [backend-foundation/](backend-foundation/README.md) | Nền tảng Django/DRF US-003: scaffold, health/ready, envelope lỗi, CI, cấu hình Render chuẩn bị |
| [f01-login-connections/](f01-login-connections/README.md) | F01 đăng nhập Zalo + kết nối hai phía (US-011/013), kịch bản hai tài khoản |
| [miniapp-foundation/](miniapp-foundation/README.md) | Nền tảng Zalo Mini App US-003: router hash, session in-memory, stitch-mapping, zalo-policy-report |
| [blueprint-deployment-guide.md](blueprint-deployment-guide.md) | Hướng dẫn triển khai backend Render bằng Blueprint (Docker, MySQL, migration tay trên Free) |
| [web-render/](web-render/web-render-deployment.md) | Task 2 web Render: static service `family-bridge-web`, bàn giao Stitch web, teacher quick start, verification |
| [web-miniapp-separation/](web-miniapp-separation/README.md) | Tách web độc lập khỏi Zalo Mini App (2026-10-16): `web/` + `packages/family_bridge_shared/`, boundary, E2E hai actor, ảnh thật, supersede "single codebase" |
| [hs-ph-connection-part-a/](hs-ph-connection-part-a/report.md) | Phần A kết nối HS/PH (2026-10-16): đường đi home → đề xuất ghép đôi F16, hủy theo API, map lỗi envelope thật; kèm branch-compatibility report |
| [f02-four-week-program/](f02-four-week-program/handover.md) | F02 Đồng hành bốn tuần (2026-10-16, nhánh riêng): provider production wiring, thỏa ước gia đình 2 bên, UI /companion thật; kèm ANTIGRAVITY-DEPLOY-HANDOFF |

## web-render/ (Task 2, nhánh `tinh-nang/web-render-task2`)

- [web-render-deployment.md](web-render/web-render-deployment.md) — topology,
  env vars, OWNER CHECKLIST apply/CORS/verify, rollback, cold start, ADR.
- [stitch-web-handoff.md](web-render/stitch-web-handoff.md) — map màn Stitch →
  route web thật + bảng deviation có chủ đích.
- [teacher-quick-start.md](web-render/teacher-quick-start.md) — luồng giáo viên
  + troubleshooting (cold start, sai mã, 409).
- [verification-report.md](web-render/verification-report.md) — lệnh + số test
  đã chạy, phần NOT_RUN (Render apply, CORS, MySQL, thiết bị Zalo).
