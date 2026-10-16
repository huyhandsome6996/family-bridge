# Branch compatibility report — Phần A kết nối HS/PH (2026-10-16)

Yêu cầu của Huy (2.2 của task): trước khi push Phần A lên `main` phải kiểm tra
tác động merge lên **toàn bộ branch heads hiện hành**, không tạo thêm/làm nặng
xung đột của nhánh nào. Báo cáo này ghi snapshot, phương pháp, kết quả
baseline/candidate theo cặp SHA cụ thể.

## 1. Snapshot remote (checked-at: 2026-10-16 ~19:10–19:40 +0700)

`git fetch origin --prune` rồi liệt kê `refs/remotes/origin`. Baseline main:
`4884c832c6a3596e76b536f8e75285716cd00270`. PR mở: #32 (F01 draft), #33 (F15
draft), #34 (W036 draft), #35 (ci-branch-filters).

| Nhánh | Head SHA | Quan hệ với main baseline |
| --- | --- | --- |
| `bao-tri/chong-trung-mysql-tidb-us004` (PR #34) | `5a2a82e7d0a28b59f43f00fa831874ab9decb882` | AHEAD 2 commits (merge-base `0253595`) |
| `bao-tri/ci-branch-filters-reorg` (PR #35) | `16e46b46c1ebf70b0240845c8f73f92c0c85c8ca` | AHEAD 1 commit (merge-base `ecb38f2`) |
| `codex/responsive-web-login` | `6e46d3a73e38a488387ba0e02f2312f78f38d539` | ANCESTOR của main (đã merge qua #38) |
| `codex/review-render-web` | `e3c30f1594183c82ee8cf41063e3a4670ae936a6` | ANCESTOR của main |
| `tinh-nang/f01-dang-nhap-va-ket-noi-us011-us013` (PR #32) | `fe2a9142e513179844c266b2dbeb524292e396b2` | AHEAD 1 commit (merge-base `e1dcabf`) |
| `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` | `f8fc6a4cc8bbceb2b115bbadc06619734142cad7` | ANCESTOR — placeholder 0 commit riêng |
| `tinh-nang/f03…f10` (8 nhánh) | `f8fc6a4cc8bb…` (cùng head) | ANCESTOR — placeholder 0 commit riêng |
| `tinh-nang/f11-diem-tua-du-phong-us022-us035` | `4f0d9c45fc0208955ed74219e5d34469e9fc6a2e` | AHEAD 1 commit (merge-base `f8fc6a4`) |
| `tinh-nang/f12…f14` (3 nhánh) | `f8fc6a4cc8bb…` | ANCESTOR — placeholder |
| `tinh-nang/f15-quyen-rieng-tu…` (PR #33) | `aeae32124a00bd05fc39802f662370df60ebea93` | AHEAD 9 commits (merge-base `f8fc6a4`) |
| `tinh-nang/web-miniapp-separation` | `c677aab6b2c695a9088778834b00ac057d3df41b` | ANCESTOR của main |
| `tinh-nang/web-render-task2` | `a4ef19771ed91b9f9bd179fe0a075f282aa65163` | ANCESTOR của main |

Chỉ push đúng 1 ref đích: `main` (fast-forward, không force, không `--all`).
Các nhánh AHEAD **không bị thay đổi head** bởi push này (push main không đụng
ref nhánh khác); việc của task là bảo đảm merge TƯƠNG LAI của họ vào main
không xấu đi.

## 2. File Phần A thay đổi

- `zalo-mini-app/src/pages/home/index.js`
- `zalo-mini-app/src/pages/proposal/index.js`
- `zalo-mini-app/tests/proposal-entry.test.mjs` (mới)
- `scripts/f16_e2e_flow.mjs` (mới)
- `docs/handover/hs-ph-connection-part-a/*` (mới), `docs/handover/README.md` (+1 dòng index)

Đối chiếu với tập file mà 5 nhánh AHEAD chạm (diff từ merge-base của từng
nhánh): **giao (intersection) = rỗng** — không nhánh nào đang sửa các file này.

## 3. Kết quả merge giả lập (git 2.47.3, `git merge-tree --write-tree`)

### Baseline — merge nhánh → main `4884c83` (TRƯỚC Phần A)

| Nhánh | Kết quả | File conflict |
| --- | --- | --- |
| `bao-tri/chong-trung-mysql-tidb-us004` | CONFLICT (có sẵn) | `packages/family_bridge_features/f01_identity/tests/test_race_mysql.py` |
| `bao-tri/ci-branch-filters-reorg` | CLEAN | — |
| `tinh-nang/f01-dang-nhap-va-ket-noi…` | CLEAN | — |
| `tinh-nang/f11-diem-tua-du-phong…` | CLEAN | — |
| `tinh-nang/f15-quyen-rieng-tu…` | CONFLICT (có sẵn) | `f15_privacy/services/sessions.py`; `zalo-mini-app/src/pages/privacy/index.js` (add/add); `zalo-mini-app/src/pages/profile/index.js`; `zalo-mini-app/tests/pages.test.mjs` |
| 17 nhánh ANCESTOR (f02–f14 placeholder, codex/*, web-*) | CLEAN (fast-forward rỗng) | — |

### Candidate — merge nhánh → main `4884c83` + Phần A `f14666c`

| Nhánh | Kết quả | So với baseline |
| --- | --- | --- |
| `bao-tri/chong-trung-mysql-tidb-us004` | CONFLICT: cùng 1 file như baseline | **Không mới, không nặng hơn** |
| `bao-tri/ci-branch-filters-reorg` | CLEAN | Không đổi |
| `tinh-nang/f01-dang-nhap-va-ket-noi…` | CLEAN | Không đổi |
| `tinh-nang/f11-diem-tua-du-phong…` | CLEAN | Không đổi |
| `tinh-nang/f15-quyen-rieng-tu…` | CONFLICT: cùng 4 file như baseline | **Không mới, không nặng hơn** |
| 17 nhánh ANCESTOR | CLEAN | Không đổi |

**Xung đột mới do Phần A tạo: 0.** Hai conflict có sẵn trên là do các nhánh đó
sinh ra từ merge-base cũ hơn (trước `4884c83` tích hợp nhiều thay đổi F01/F15
và stitch UI) — thuộc owner của PR #34 và PR #33 xử lý khi merge; task này
không quy chúng cho mình và không "sửa hộ" nhánh người khác.

## 4. Compatibility không chỉ là Git

Thay đổi Phần A là UI Mini App + test + script E2E local; **không** đổi
contract API, session/auth, router entry, schema, migration, lockfile, CI
config, `render.yaml`. Consumer checks đã chạy lại trên candidate:

| Check | Kết quả |
| --- | --- |
| Mini App full suite (297 test, gồm 9 case mới) | PASS |
| Mini App production build + verify Zalo manifest | PASS |
| Web tests 187 + build (web không đổi nhưng chạy hồi quy vì CI sẽ chạy trên push) | PASS |
| Shared package tests 34 | PASS |
| Import boundary transitive web↔mini↔shared | CLEAN |
| Backend feature-lab 475 (backend không đổi) | PASS, skipped=9 như baseline |
| E2E API backend thật local (30 checks) | PASS |

## 5. Giới hạn của báo cáo (trung thực)

- Kết quả áp dụng cho cặp SHA: baseline `4884c83` ↔ candidate `f14666c…`
  (docs commit ngay sau chỉ thêm file docs mới, không đụng file nào nhánh khác
  chạm — re-check merge-tree lại trước push, xem mục 6).
- Nếu main hoặc các branch head thay đổi sau thời điểm này (người khác đang
  làm việc đồng thời), snapshot cũ hết hiệu lực cho **phần bị tác động**; push
  trước khi thực hiện đã fetch lại; ai merge sau cần fetch + re-check riêng.
- Không tuyên bố "mọi lần merge tương lai đều sạch" — các nhánh đang được
  owner khác cập nhật liên tục.

## 6. Re-check sát thời điểm push + sau push

- Trước push: `git fetch origin --prune` lại; nếu `origin/main` vẫn
  `4884c83` → push fast-forward; nếu đã đổi → inspect + integrate rồi
  merge-tree lại phần bị tác động trước khi push (không ghi đè).
- Sau push: xác minh chỉ `origin/main` được cập nhật bởi task này
  (`git for-each-ref` so với bảng mục 1); các nhánh khác phải giữ nguyên head.
  Kết quả ghi ở commit message + báo cáo cuối.
