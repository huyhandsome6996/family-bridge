# Bàn giao: Cấp phát cặp HS/PH do quản trị + Consent theo Stitch (18/10/2026)

Phạm vi bàn giao này chứa HAI sản phẩm theo gói yêu cầu ANTIGRAVITY V2:

- **A — Admin cấp phát cặp HS/PH**: bảng hai cột (Phụ huynh trái, Học sinh
  phải) trên web; lưu cặp → Connection ACTIVE ngay với provenance
  `admin_provisioned`; kèm công cụ chuyển đổi bộ cặp mẫu đang chờ
  (backfill inventory → dry-run → apply idempotent).
- **B — Consent theo thiết kế Stitch**: màn "Quyền lựa chọn thuộc về bạn"
  dựng lại cho web (desktop 2 cột 5/7) và Mini App (1 cột mobile) — giữ
  nguyên toàn bộ hành vi đồng ý thật (listConsents/recordConsent, không
  precheck, snapshot + stale guard). B nằm trên nhánh riêng
  `codex/consent-stitch-responsive` — **PR #41**
  (https://github.com/huyhandsome6996/family-bridge/pull/41), chờ review/merge.

Trạng thái bàn giao A trên main: `12171a6` (feature) + `c838bfc`
(fix CSV map theo tên cột + import lệnh backfill) — CI ALL SUCCESS.

## Tài liệu trong mục này

| File | Nội dung |
| --- | --- |
| [decision.md](decision.md) | Quyết định 18/10/2026 của Huy + phạm vi ngoại lệ so với luồng hai phía |
| [architecture.md](architecture.md) | Nguồn sự thật của cặp, provenance Connection, generation, grant/consent |
| [admin-runbook.md](admin-runbook.md) | Cách admin dùng màn hai cột, dry-run, import/backfill, kết nối lại |
| [api-contract.md](api-contract.md) | Endpoint F16-A, trường, lỗi, authz, tương thích |
| [data-migration.md](data-migration.md) | DDL vs dữ liệu (migration 0003 f01 + 0002 f16), non-destructive rollout |
| [test-report.md](test-report.md) | Lệnh + kết quả đã chạy thật, môi trường, NOT_RUN trung thực |
| [huy-test.md](huy-test.md) | URL + bước kiểm thử cho Huy, tiêu chí PASS từng bài |
| [next-agent.md](next-agent.md) | Luồng đang sống, Zalo dormant, chủ sở hữu vùng code, việc còn lại |
| [f02-compatibility.md](f02-compatibility.md) | F02 nhận hợp đồng A mới trên nhánh của mình không cần merge |
| [stitch-deviations.md](stitch-deviations.md) | Giữ baseline hình ảnh; từng chỉnh sửa bắt buộc + lý do |

## Quy tắc đọc

- Hợp đồng chi tiết endpoint: `docs/contracts/api-foundation.md` mục F16-A.
- Quyết định đăng ký: DEC-24; quy tắc: WF-25; capability: CAP-23 trong
  `docs/product/admin-capabilities.md`. Mọi ghi chú supersede có ngày ở
  `docs/project-scope.md`, `docs/product/workflow-state-machines.md`,
  `docs/product/access-sharing-matrix.md`, `docs/product/user-flows.md`.
- Lệnh vận hành production: `ops/runbook.md` mục "Cấp phát cặp HS/PH do
  quản trị + chuyển đổi cặp đang chờ".
