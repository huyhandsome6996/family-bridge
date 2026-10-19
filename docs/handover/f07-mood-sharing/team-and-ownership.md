# Team and ownership — báo cáo THỰC TẾ

## Số agent thật

Theo yêu cầu bàn giao ("báo đúng số agent và phần việc thực tế; không giả lập
hoạt động review"):

- **1 phiên agent chính** (lead kiêm thực thi) thực hiện toàn bộ: đọc tài liệu,
  kiểm tra baseline, tái hiện lỗi, sửa code, viết test, kiểm thử E2E/UI,
  commit/PR, bàn giao. KHÔNG có 9 phiên agent phụ; không mô phỏng "đội 10
  agent" hay "hội thoại review giữa các agent".
- Công cụ kiểm chứng độc lập thay phản biện chéo bằng người: bộ test sẵn có
  (19 test cũ PASS không đổi semantics), CI-equivalent full harness suite
  (523 test), web consumer suite (227 test, không sửa web), mini-app QA suite
  (297 test có sẵn gồm các rule an toàn cấm auto-send/over-claim), docs
  checker, import boundary check. Các kiểm tra này chạy TRÊN CODE MỚI, không
  gán kết quả cũ.
- Kiểm thử UI trình duyệt thật dùng agent-browser (công cụ, không phải agent
  reviewer): luồng 2 tài khoản chéo thiết bị đã mô tả trong verification-report.

## Phạm vi file — một writer

| Vùng | Thay đổi trong đợt này |
| --- | --- |
| `packages/family_bridge_features/f07_mood/**` | services/mood.py (share/read/list + fail-closed), api.py (kwarg + expected_revision + pagination), models.py (grant_view + status), apps.py (MỚI — wiring), services/grant_provider.py (MỚI), services/deletion.py (MỚI), services/__init__.py (facade), tests/ (regression + integration + race mysql) |
| `packages/family_bridge_shared/**` | contract.js (+8 method), http-endpoints.js (page_size fix + 8 method), mock-adapter.js (+8 fixture methods), tests (+F07 contract tests, count 74→82) |
| `packages/family_bridge_mobile/f07_mood/api.js` | share(expectedRevision) + sharedWithMe(cursor,page_size) |
| `zalo-mini-app/src/pages/mood/**, mood-shared/**` | MỚI — 2 trang chính thức |
| `zalo-mini-app/src/app/router.js` | +2 route (additive) |
| `zalo-mini-app/src/pages/profile/index.js`, `home/index.js` | +đường đi F07 (additive, không đổi hành vi cũ) |
| `zalo-mini-app/tests/f07-mood.test.mjs` | MỚI — 10 test UI |
| `scripts/f07_local_e2e.py`, `scripts/f07_local_fixtures.py` | MỚI — E2E + fixture synthetic |
| `docs/features/f07/**`, `docs/handover/f07-mood-sharing/**` | cập nhật bằng chứng + bàn giao |

KHÔNG đụng: `web/**` (chỉ chạy test/build), `backend/config/**`,
`packages/family_bridge_features/f15_privacy/**`, `f02_program/**`,
`f01_identity/**`, migrations F07 (không đổi schema), refs main/F02/F15/web.

## Khóa/lock kiểm tra trước khi sửa

- PR đang mở: #32 (F01), #33 (F15), #34 (W036), #35 (CI), #39 (F02), #40 (F04),
  #41 (Consent) — không có PR F07; không đụng vùng của các PR này. Điểm chạm
  F15 duy nhất là ĐĂNG KÝ provider/hook theo protocol công khai của F15
  (register_grant_provider/register_deletion_hook) từ phía f07 — đúng mẫu F16
  đã đi trước; không sửa file f15_privacy.
- `auth.py`, `services/registry.py` (cảnh báo cầu nối PR #33 trong Word): không
  sửa logic; chỉ thêm `apps.py` mới và facade import.
