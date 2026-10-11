# packages/ — Nền tảng mô-đun dùng chung (B00)

Quy ước đóng gói được chốt tại nhánh `chore/full-build-contract-baseline` (B00):

| Thư mục | Nội dung | Chủ sở hữu |
| --- | --- | --- |
| `family_bridge_core/` | Python: lỗi chuẩn, DTO, Protocol/ports, registry allowlist, validation bounds, idempotency, audit builder, DRF helpers | Lead (B00) |
| `family_bridge_mobile_core/` | JS thuần: API client, SDK bridge, session store, router, state window, theme tokens | Lead (B00) |
| `family_bridge_features/` | Mỗi feature một Django app riêng: `f07_mood/`, `f15_privacy/`, ... Nhánh feature của feature đó sở hữu | Nhánh feature tương ứng |
| `family_bridge_mobile/` | JS modules của từng feature: pages, api, fixtures/tests | Nhánh feature tương ứng |

## Quy tắc

1. Feature KHÔNG import model/implementation của feature khác — chỉ qua ports trong `family_bridge_core.protocols`. Dependency thật được nối ở nhánh tích hợp B18.
2. Feature KHÔNG sửa `family_bridge_core/`, `family_bridge_mobile_core/`, root settings, routes gốc. Cần đổi contract chung: mở PR nhỏ vào B00, lead review.
3. Mỗi Django app dùng app label + migration riêng; FK tới User luôn qua `settings.AUTH_USER_MODEL`.
4. Không tạo bảng Message/Connection/User thứ hai. F03/F04/F10 gửi qua `MessageTransport` của F05; F11 tái dùng `ConnectionInvitation` của F01.
5. Registry (`family_bridge_core/registry.py`) là allowlist tường minh; feature chỉ cập nhật entry của mình (status).
6. Harness test: `bash tests/feature-lab/scripts/test_feature.sh <app_label>`. SQLite local; MySQL phải bật qua `FB_TEST_DB=mysql` cho suite race và ghi rõ môi trường trong báo cáo.
