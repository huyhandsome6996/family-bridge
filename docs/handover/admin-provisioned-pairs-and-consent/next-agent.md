# Cho agent tiếp theo

## Luồng đang SỐNG (trên main sau đợt này)

1. **Ghép cặp do quản trị cấp (DEC-24)**: admin `#/admin-provision` lưu
   hàng cặp → Connection ACTIVE ngay (`source=admin_provisioned`). Người
   dùng KHÔNG xác nhận ghép đôi cho cặp dạng này. Đừng khôi phục cổng xác
   nhận hai bên cho chế độ cấp phát — đó là quay lại quyết định đã supersede.
2. **Luồng tự nguyện GIỮ NGUYÊN**: mời/claim/confirm (F01) + proposal hai
   phía (F16) vẫn dùng được cho ghép nối tự nguyện; `/proposal` không bị
   xóa, chỉ không còn bắt buộc với cặp đã cấp.
3. **Consent**: màn mới theo Stitch (web + mini) giữ nguyên mọi hợp đồng —
   không precheck, restore chỉ cùng phiên bản, snapshot/stale-guard,
   service-only gate CTA. Đừng thêm auto-accept hay tick hộ.
4. **Scope admin là LỌC THẬT**: `has_capability` giờ so khớp scope. Đừng
   "đơn giản hóa" bỏ lọc scope; grant school phải khớp chính xác class_ref.

## Vùng code + chủ sở hữu

| Vùng | Trạng thái |
| --- | --- |
| `packages/family_bridge_features/f16_classroom` (models/services/api/tests) | phần A của task này (main) |
| `packages/family_bridge_features/admin_core` (models hằng số CAP-23, services/admin.py scope) | phần A — LƯU Ý PR #34 (W036) cũng sửa admin_core/f01 ở vùng khác; merge #34 sau không xung đột file (đã kiểm patch) |
| `packages/family_bridge_features/f01_identity` (Connection source fields, migration 0003) | phần A |
| `web/src/pages/admin-provision/**`, `web/src/app/router.js` (route 22), `web/tests/router.test.mjs` | phần A (web) |
| `packages/family_bridge_shared` (5 method `admin*` + mock + contract 74) | phần A |
| `web/src/pages/consent/**`, `zalo-mini-app/src/pages/consent/**`, styles | nhánh `codex/consent-stitch-responsive` (PR riêng — B) |

## Việc còn lại (đúng thứ tự ưu tiên)

1. Owner chạy migrate TiDB + `backfill_class_pairs` dry-run → apply (runbook).
2. Merge PR consent (sau review) → web deploy tự động; mini app release
   Testing bởi owner (QR mới, không dùng QR cũ).
3. Kiểm chứng trên thiết bị Zalo thật (NOT_RUN hiện tại).
4. Cân nhắc: nếu muốn admin màn riêng cho tổng quan nhiều lớp — đây là sản
   phẩm mới, cần yêu cầu riêng của Huy (không tự mở rộng).

## Cạm bẫy đã xử lý — đừng phá lại

- `first_confirmed_at` của proposal bị admin đóng PHẢI giữ NULL — đó là
  bằng chứng không giả chữ ký.
- `batch_ref` phải do CLIENT tạo và gửi lại nguyên vẹn khi retry timeout —
  server replay theo mã này; đổi sang tự sinh server sẽ mất idempotency.
- Mock adapter phải đủ 74 method (contract test đếm số).
- web `router.test.mjs` ghim 22 route — thêm route mới phải cập nhật cả
  EXPECTED_ROUTES và số đếm.
- Docs checker ghim 23 CAP / 25 WF / 24 DEC — thêm hàng mới phải đồng bộ
  `scripts/check_agent_docs.py`.
