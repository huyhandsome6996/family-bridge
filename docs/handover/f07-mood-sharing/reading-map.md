# Reading map — F07 (18/10/2026)

## Nguồn đã đọc thật

| Nguồn | Nội dung |
| --- | --- |
| Gói bàn giao `f07-docx` (bundles 01+02+03, `bundles.py verify` OK 946 tệp) | 00-READ-ME-FIRST, 01-START-HERE, 02-DETAILED-MISSION, 03-ACCEPTANCE, 04-SYSTEM-MAP, 05-F02-OWNERSHIP |
| `AGENTS.md` root + doc repo | quy tắc nhánh, stack, bảo mật, admin-provisioned pairs (DEC-24/CAP-23) |
| `docs/project-scope.md`, `docs/contracts/api-foundation.md`, `docs/data/erd.md` (qua code + harness) | phạm vi 15 tính năng, envelope lỗi, mô hình dữ liệu |
| `packages/family_bridge_core/*` | protocols (ConnectionReader/GrantView/DeletionHook), errors/HTTP_BY_CODE, drf.cursor_paginate, validation, sessions |
| `packages/family_bridge_features/f07_mood/**` | models, api, auth, urls, services/{mood,registry}, tests — đọc toàn bộ, sửa theo finding |
| `packages/family_bridge_features/f01_identity/**` (models Connection, services/invites.py InviteService, display) | canonical connection, generation, admin_provisioned/invite NULL, reader port |
| `packages/family_bridge_features/f15_privacy/**` (api, services/registry.py, services/deletion.py) | provider protocol, revoke_grant, can_view_item, deletion flow |
| `packages/family_bridge_features/f16_classroom/**` (apps.py, services/deletion.py, accounts) | pattern đăng ký ready(), hook protocol, class-session login |
| `packages/family_bridge_shared/**` (contract.js, http-endpoints.js, mock-adapter.js, tests) | ADR-1/2, 69→74→82 methods, session generation |
| `zalo-mini-app/**` (router.js, main.js, core/*, components/*, CONTRACTS.md, pages home/profile/connect/privacy) | page contract, adapter glue, a11y, QA rules (không auto-send, cấm chuỗi over-claim) |
| `tests/feature-lab/**` (harness settings, fixtures/actors, labgrants) | cách chạy module test, MySQL gate pattern (f01 test_race_mysql.py) |
| `.github/workflows/tests.yml` | bộ checks CI: harness full suite, mobile, miniapp, web+shared+boundaries |
| `web/` (chỉ chạy regression, không sửa) | consumer shared adapter |

## Yêu cầu → test map (bằng chứng chính)

| Yêu cầu (Word/Trello/mission) | Test/By chứng |
| --- | --- |
| US-015 riêng tư mặc định, 1 mục/ngày, ngày VN server | test_f07.py EntryCrudTests; E2E step 2-3; UI "Chỉ mình bạn" |
| US-015 lịch sử + sửa đúng mục mình | list_own cursor + cross-user 404 tests; UI history "Sửa mục này" |
| US-026 share từng mục/recipient/revision + preview + xác nhận | ShareTests; Finding4/6 regressions; E2E 8-15; UI sheet flow |
| Thu hồi/hủy kết nối chặn đọc tiếp | Finding2/3/5 regressions; integration F15 revoke; E2E 14-17; browser chéo thiết bị |
| Ma trận nghiệm thu 02-F07 mission §15.1 (F07-T01..T30) | `verification-report.md` ánh xạ từng mã |
| F07-01..F25 (03-ACCEPTANCE) | `verification-report.md` |

## Mâu thuẫn/supersede ghi nhận

- `docs/features/f07/manifest.json` cũ ghi branch `feat/f07-mood-history-sharing`
  và baseline `cc6ade2f` (mốc lịch sử trước tái cấu trúc nhánh 15/10) — đã cập
  nhật theo nhánh hiện hành; business rules giữ nguyên.
- Mission §11 ghi "route alias summary nằm dưới entry": vẫn giữ
  `mood/entries/{id}/summary` alias, không đổi (consumer chưa rõ, ít rủi ro hơn khi giữ).
- Bàn giao nói F07 chậm main 61 commit — đúng tại thời điểm fetch; đã fast-forward.
