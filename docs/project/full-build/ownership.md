# Ownership tệp — full-build Family Bridge

Nguyên tắc: một tệp một chủ; nhánh khác cần sửa phải qua PR vào nhánh sở hữu
hoặc chờ tích hợp B18. Không reset/clean worktree người khác, không force-push.

## Khu vực dành riêng cho Agent A và Agent B (US-003) — KHÔNG ĐỤNG

| Owner | Đường dẫn |
| --- | --- |
| Agent A | `backend/**`, `render.yaml`, `docs/setup/backend/**`, `docs/handover/backend-foundation/**` |
| Agent B | `zalo-mini-app/**`, `docs/setup/miniapp/**`, `docs/handover/miniapp-foundation/**` |

Lead được phép ĐỌC snapshot (pin SHA) và ghép ở nhánh B18 mà không sửa nhánh gốc.

## Khu vực lead (B00) sở hữu và phân phối

| Đường dẫn | Sở hữu | Ai được sửa |
| --- | --- | --- |
| `packages/family_bridge_core/**` | Lead/B00 | chỉ PR nhỏ vào B00 khi phải đổi contract |
| `packages/family_bridge_mobile_core/**` | Lead/B00 | như trên |
| `packages/family_bridge_features/<label>/**` | Nhánh feature của label đó | chỉ nhánh feature tương ứng |
| `packages/family_bridge_mobile/<label>/**` | Nhánh feature của label đó | chỉ nhánh feature tương ứng |
| `tests/feature-lab/**` | Lead/B00 | fixtures: nhánh feature được THÊM file fixture riêng của mình; không sửa dùng chung |
| `docs/features/<fxx>/**` | Nhánh feature fxx | nhánh feature |
| `docs/project/full-build/**` | Lead | lead cập nhật manifest/plan |
| `docs/contracts/openapi.yaml` | Lead/B00 | feature nhánh mở rộng phần mình qua PR |
| `AGENTS.md`, `docs/engineering/**`, `docs/product/**` | Nhánh docs trên main | lead chỉnh có dated supersede; không xóa rule riêng tư/DSA/bảo mật/workflow |
| `.github/workflows/**` | B17 | không đụng trong nhánh feature |

## Mapping nhánh → module (registry là nguồn chính xác)

Xem `packages/family_bridge_core/registry.py` — mỗi feature có
backend package `family_bridge_features.<label>` (app label = label) và mobile
module `packages/family_bridge_mobile/<label>`. Một nhánh sở hữu đúng một
entry; không tự tạo app label mới ngoài registry.

## Quy ước commit/push

- Commit tập trung theo nhánh, message dạng `feat(f07): ...` / `test(f07): ...` / `docs(f07): ...`.
- Không commit secret, token, mã mời, dữ liệu thật; `git diff --check` trước push.
- Không push main. Draft PR theo `branch-manifest.json`.
