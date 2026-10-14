# Tích hợp shared files — một người điều phối (quy hoạch 15/10/2026)

## 1. Ai được sửa shared files

**Chỉ lead (Huy)** sửa các khu vực dùng chung, qua **PR tích hợp nhỏ riêng**:

- `backend/config/**`, root deployment config, requirements/lockfiles.
- `packages/family_bridge_core/**`, `packages/family_bridge_mobile_core/**`,
  registry/OpenAPI/common DTO/error contracts.
- `zalo-mini-app/src/app/**`, `zalo-mini-app/src/core/**`, `zalo-mini-app/src/main.js`,
  shared components/styles/assets, home/profile/navigation chung.
- Shared test harness/fixtures/migrations dùng chung, CI workflows.
- `admin_core` và publish/configuration provider có owner riêng ghi rõ — không rải
  ownership admin cho nhánh feature chỉ vì feature cần content.

Feature owner cung cấp module/pages/local adapter và tests trong own paths của mình
(`branches.json`). Đổi router, main/bootstrap, shared session client hoặc contracts
→ đề xuất cho lead, lead ghép bằng PR tích hợp. Không cho 15 người tự chỉnh các file đó.

## 2. Lock tạm thời đang có hiệu lực (15/10/2026)

Trong khi các PR dưới đây đang review, nhánh bị tác động **không sửa các file đang khóa**
— phần file không trùng vẫn làm độc lập. Không tuyên bố "15 nhánh không có xung đột"
trong khi locks này còn.

| PR | Nhánh | Files khóa | Ảnh hưởng |
|---|---|---|---|
| #32 (F01) | `tinh-nang/f01-...` | `f01_identity/services/zalo_provider.py` (+test/docs đi kèm) | F01 tự lock của mình |
| #33 (F15) | `tinh-nang/f15-...` | `tests/feature-lab/harness/settings.py`; `f01_identity/api.py`, `services/identity.py`; `f07_mood/auth.py`, `services/mood.py`, `services/registry.py`; `f08_journal/**`; `f15_privacy/**`; `zalo-mini-app/src/app/router.js`; `src/pages/profile/index.js` | F07/F08 chờ patch cầu nối; router/profile là shared → F15 chỉ được qua lead khi integrate |
| #34 (W036) | `bao-tri/chong-trung-mysql-tidb-us004` | models/migrations/services/tests của `f01_identity`, `f09_activities`, `f11_supporters`, `admin_core` + `tests/feature-lab/harness/settings.py` (trùng lock với #33) | F09/F11 chờ; `harness/settings.py` cần điều phối gộp #33+#34 |

Điểm cần điều phối gộp: **`tests/feature-lab/harness/settings.py`** bị cả #33 và #34 sửa —
người điều phối tích hợp merge ý định của cả hai (feature labels + config test) trong
một commit gộp khi hai PR lần lượt vào main.

## 3. Thứ tự tích hợp đề xuất

1. **W036 (#34) trước**: rebase lên main hiện tại (đang dirty), review bởi một người
   điều phối; unlock models/migrations của F01/F09/F11/admin sau merge.
2. **F15 (#33)**: review; phần `harness/settings.py` ghép theo ý định W036 nếu W036 đã vào
   main; unlock `f07_mood`/`f08_journal` file lock sau merge.
3. **F01 (#32)**: review; sync commit Stitch của main trước khi merge; chốt concurrency
   hai-lời-mời sau khi W036 tích hợp.
4. Feature mới (F02–F14): PR khi có diff thật; file lock còn hiệu lực thì tránh hoặc
   chờ; đổi shared files luôn qua lead.

## 4. Kiểm tra hợp đồng thật khi tích hợp

- Batch integration chạy **backend settings thật** (không chỉ mock/SQLite):
  harness feature-lab + test nền tảng + mobile/miniapp tests + build & verify.
- MySQL: CI mysql-checks hoặc harness MySQL-gated chạy thật trước khi nghiệm thu nhóm US.
- Không downgrade/nâng dependency, không bỏ checks hay bỏ MySQL tests để đạt xanh.
- Mỗi đợt ghi lại: main SHA trước/sau, PR vào, kết quả checks — vào report của đợt.
