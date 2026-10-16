# Next agent — những gì bạn cần biết ngay

## 1. Bạn đang ở đâu

- Nhánh `tinh-nang/web-miniapp-separation`: base `origin/main` `96deda1` + các commit:
  1. `da83680` feat(shared) — tách headless client/session/endpoints/mock + shims + 34 tests.
  2. `7fd5135` ci(web) — boundary checker transitive + job `web` + render.yaml publish `web/dist`.
  3. `c7a576d` feat(web) — web độc lập (entry/router/build riêng) + 13 trang dùng chung.
  4. `2a91047` feat(web) — 8 trang phức tạp port nguyên văn + web-screens tests.
  5. Commit docs hiện tại — 9 file bàn giao + evidence + supersede notes (chỉ thêm tài liệu/ảnh, không đụng code).
- Trạng thái test tại thời điểm bàn giao: mini 279/279, web 187/187, shared 34/34, boundary 5/5, build + verify manifest xanh — chi tiết [verification-report.md](verification-report.md).

## 2. Ownership đang mở — ĐỪNG đụng

| Vùng | Ai sở hữu | Ghi chú |
|---|---|---|
| `zalo-mini-app/src/pages/login/**`, consent mini | PR #32 (F01) | Web có bản copy riêng — sửa web thoải mái, không sửa mini |
| `zalo-mini-app/src/app/router.js`, `privacy/`, `profile/` mini, `f15_privacy/**` | PR #33 (F15) | Conflict của #33 với main là CÓ SẴN — nhánh này không làm tệ thêm |
| `f01_identity/**` | PR #34 (W036 MySQL) | Như trên |
| `backend-foundation.yml`, `miniapp-foundation.yml` | PR #35 | Reorg path filters của họ; job `web` của tests.yml là của nhánh này |
| Backend nói chung | — | Nhánh này 0 file backend; nếu bạn cần đổi backend thì đi PR riêng kèm contract test |

## 3. Quy tắc biên giới (vi phạm = CI đỏ)

1. `web/**` cấm import `zalo-mini-app/**` (kể cả transitive + dynamic import).
2. `zalo-mini-app/**` cấm import `web/**`.
3. `packages/family_bridge_shared/**` cấm DOM/zmp-sdk/storage (purity contract có test).
4. Method API mới chỉ thêm ở shared (`http-endpoints.js` + `contract.js`), không viết bản sao trong glue.
5. Kiểm chứng: `node scripts/check_import_boundaries.mjs` (thêm `--json` để lấy báo cáo).

## 4. Việc còn dang (theo thứ tự ưu tiên)

1. **Owner steps sau merge main** (không phải việc code): Render apply/verify theo [deployment.md](deployment.md) OWNER CHECKLIST; release Zalo là đợt riêng.
2. **Resolve conflict có sẵn** cho PR #33/#34 khi merge (không liên quan nhánh này).
3. **CSS token drift**: styles đang được COPY nguyên khối (web/ và mini/ giữ bản riêng) — follow-up hợp nhất token nếu muốn giảm drift; không làm trong PR này.
4. **F10 transport + AI provider wiring** trên backend để mở khóa S9/S10/S12 E2E.
5. **History router?** Hiện giữ hash router theo chủ đích (không phá link). Nếu sau này đổi: cần lý do + mapping link cũ + SPA rewrite Render + test đường dẫn trực tiếp/refresh/404 — theo brief §10.2.
6. **Trello/cập nhật US**: chưa có token Trello trong phiên — owner cập nhật.

## 5. Giả định cần chủ dự án xác nhận

- Brief gốc §1–9 không có trong phiên làm việc; mọi yêu cầu đã tái tạo từ docs repo + worklog (ghi ở [reading-map.md](reading-map.md)). Nếu brief gốc có mục nào khác (đặc biệt về cache header chi tiết hoặc milestone D "Stitch + logo"), đối chiếu với [design-verification.md](design-verification.md) và nêu chênh lệch trước khi code tiếp.

## 6. Lệnh hay dùng

```bash
# test từng đầu
cd zalo-mini-app && npm test && npm run build        # mini + verify manifest
cd web && npm ci && npm test && npm run build        # web
node --test packages/family_bridge_shared/tests/*.test.mjs
node scripts/check_import_boundaries.mjs             # boundary
python scripts/check_agent_docs.py                   # docs wiring
# E2E hai actor (tự quản hạ tầng)
node scripts/websep_e2e_two_actors.mjs
```

Đọc tiếp: [reading-map.md](reading-map.md) (bản đồ code) → [architecture.md](architecture.md) (lý do thiết kế) → [verification-report.md](verification-report.md) (bằng chứng).
