# Kế hoạch xây dựng đầy đủ (full-build) — B00..B18

> **SUPERSEDE 15/10/2026 (dated):** quy hoạch nhánh mới là nguồn hiện hành về phân công —
> xem `docs/project/branch-reorganization/`. Cụ thể: nguyên tắc 4 ("Draft PR feature target
> B00…không PR feature thẳng main") **không còn áp dụng** — feature làm việc trên nhánh
> `tinh-nang/fxx-…` và mở Draft PR thẳng main; B00/B18 đã merge (PR #23/#24) nên các nhánh
> B00..B18 chỉ còn là lịch sử; `branch-manifest.json` (11/10) và bảng tên nhánh dưới đây là
> lịch sử, giữ nguyên để tra cứu bằng chứng. Các quy tắc nghiệp vụ/bảo mật trong tài liệu
> này VẪN HIỆU LỰC.

Ngày lập: 11/10/2026. Chủ trì: lead coding agent (theo PROMPT TỔNG của Huy).
Đây là kế hoạch tổ chức công việc và trạng thái — không phải bằng chứng tính
năng đã chạy. Bằng chứng nằm ở report từng nhánh (`docs/features/<fxx>/report.md`)
và PR/SHA cụ thể.

## Nguyên tắc tổ chức

1. **Nền tảng chung cố định**: mọi nhánh feature B01..B17 tạo từ cùng một SHA
   đóng băng của B00 (`branch-manifest.json:baseline_sha`). Module chỉ gọi
   ports trong `packages/family_bridge_core`; tests dùng adapter tổng hợp trong
   `tests/feature-lab/fixtures`.
2. **Độc lập lập trình, ghép ở B18** *(lịch sử — B18 đã merge qua PR #23; tích hợp nay
   theo `docs/project/branch-reorganization/shared-integration.md`)*: nhánh nào cũng tự
   chạy test được bằng một lệnh documented. Phụ thuộc thật (Connection thật,
   MessageTransport thật, AccessPolicy thật) đã được nối ở nhánh tích hợp
   `review/full-product-integration` (đã chuyển thành `bao-tri/chong-trung-mysql-tidb-us004`).
3. **Không giành ownership A/B**: `backend/**`, `render.yaml`,
   `docs/setup/backend/**`, `docs/handover/backend-foundation/**` (Agent A) và
   `zalo-mini-app/**`, `docs/setup/miniapp/**`,
   `docs/handover/miniapp-foundation/**` (Agent B) không bị sửa. Tích hợp dùng
   snapshot pin SHA đọc-ghép ở nhánh B18 riêng.
4. **Draft PR feature target B00** để diff chỉ hiện module của mình. Không PR
   feature thẳng main. Không merge/auto-merge — Huy và agent review quyết định.

## Thứ tự làm việc (thứ tự tổ chức, không phải chuỗi phụ thuộc)

B00 → B01 → B15 → B05 → B03 → B04 → B06 → B07 → B08 → B10 → B11 → B13 →
B12 → B09 → B02 → B14 → B16 → B17 → B18.

Lý do: B00 chốt hợp đồng; B01 có Connection (phụ thuộc nhiều nhất); B15 chốt
AccessPolicy/grant mà F07/F08 dùng; B05 chốt MessageTransport mà F03/F04/F10
gửi qua; sau đó các module còn lại theo mức phụ thuộc; B16 admin cần schema
các module; B17 ops; B18 ghép.

## Định nghĩa hoàn thành một nhánh

- Code trong phạm vi registry + tests (happy/negative/stale/permission) chạy
  được bằng lệnh riêng documented.
- `docs/features/<fxx>/` có scope.md, api.md, test.md, report.md,
  manual-review.md, manifest.json.
- Commit đã push, Draft PR mở (khi auth cho phép), Trello queue đã ghi.
- Các gate thật (Zalo thật, provider thật, nội dung duyệt, MySQL race khi chưa
  có MySQL) được ghi NOT_RUN/BLOCKED đúng vị trí — không tổng kết PASS che lỗi.

## Phân công vai trò trong lượt agent này

Môi trường agent hiện tại chỉ hỗ trợ sub-agent chung (không có hàng đợi chuyên
biên dài hạn), nên lead tự thực hiện phần lớn và phân đúng phạm vi:

| Vai trò | Thực hiện bởi | Phạm vi |
| --- | --- | --- |
| Architecture/contracts | Lead | B00, registry, OpenAPI, review diff mọi PR |
| Backend implementation | Lead (tự) | các app Django trong `packages/family_bridge_features/` |
| Frontend implementation | Lead (tự) | JS modules trong `packages/family_bridge_mobile/` |
| Policy/security | Lead + review diff bắt buộc từng nhánh | invariants WF/SEC, kiểm tra không rò secret |
| QA | Lead | test suites, chạy harness, ghi NOT_RUN trung thực |
| Trello/ops | Lead | trello-update-queue.md (không có Trello token trong môi trường) |

Mọi sub-agent được giao việc đều nhận: bối cảnh dự án, US, file ownership,
baseline SHA, tài liệu phải đọc, invariants, tiêu chí test (theo PROMPT TỔNG §4).

## Quản lý context/dừng giữa chừng

Khi gần hết context/tool budget: checkpoint commit + cập nhật report hiện
trạng + "next exact action" trong `docs/project/full-build/plan.md` mục
"Checkpoint" dưới đây, push phần đã kiểm tra. Không hứa chạy vô hạn.

## Checkpoint hiện trạng

- (được lead cập nhật sau mỗi nhánh — xem branch-manifest.json cho SHA/PR)
