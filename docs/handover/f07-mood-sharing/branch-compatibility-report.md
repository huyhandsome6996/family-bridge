# Branch compatibility report — F07

## Refs tại thời điểm bắt đầu (fetch 18/10/2026)

| Ref | SHA |
| --- | --- |
| `origin/main` | `571abcb7916954964d82e0aa27e7661e7d7efd83` |
| `origin/tinh-nang/f07-tam-trang-va-chia-se-us015-us026` (trước sync) | `f8fc6a4cc8bbceb2b115bbadc06619734142cad7` (behind 61, ahead 0) |
| `origin/tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` | `689531e06a593d39462041329c0581b4ec1b0aba` |
| `origin/codex/consent-stitch-responsive` | `85666b9e571345a0158c601db4e96e2033da3945` |
| PR đang mở | #32 F01, #33 F15, #34 W036, #35 CI, #39 F02, #40 F04, #41 Consent — không có PR F07 |

## Đồng bộ main

- merge-base = head F07 (F07 là ancestor thuần của main) → `git merge --ff-only
  origin/main`: f8fc6a4 → 571abcb. KHÔNG reset, KHÔNG force-push, KHÔNG mất
  commit ai. Working tree sạch trước/sau.

## Phạm vi diff của đợt này (so với main 571abcb)

- Backend: `packages/family_bridge_features/f07_mood/**` (services, api, models
  grant_view, apps.py mới, grant_provider.py mới, deletion.py mới, tests mới) —
  KHÔNG đổi migrations/schema.
- Shared JS: contract (+8), http-endpoints (page_size fix + 8 method),
  mock-adapter (+8), tests cập nhật count + mới.
- Mini App: 2 trang mới, router (+2 route additive), home/profile (+link),
  tests mới. KHÔNG đụng `web/**`, `backend/config/**`, f01/f02/f15/f16 code,
  CI, render.yaml.
- Repo scripts: `scripts/f07_local_e2e.py`, `scripts/f07_local_fixtures.py` (mới,
  chỉ chạy local).

## Tương thích

- Consumer cũ của shared adapter (home, web): `listMoodEntries({limit})` giữ
  nguyên tên tham số — chỉ query param gửi lên đổi từ `limit` sang `page_size`
  (trước đây bị server bỏ qua). Web regression 227 PASS + build OK.
- API additive: response thêm field (`status` trong grant_view; `next` trong
  /mood/shared) — client cũ đọc theo field cũ không vỡ.
- `ADAPTER_METHODS` 74→82: mock adapter + zalo adapter + web adapter đều đủ
  (contract test bắt từng method là hàm).
- F02 (shared pointsmission 05): không đụng file F02; shared adapter thay đổi
  chỉ additive nên union methods không xung đột theo kiểu "chọn một phía".
- Merge giả lập F07→main: fast-forward thuần (không commit ngoài main), không
  conflict có thể phát sinh. KHÔNG merge thật; main không bị push.

## Lệnh tái kiểm

```bash
git fetch origin
git rev-parse origin/main origin/tinh-nang/f07-tam-trang-va-chia-se-us015-us026
bash tests/feature-lab/scripts/test_feature.sh f07_mood
node --test packages/family_bridge_shared/tests/*.test.mjs
cd zalo-mini-app && npm ci && npm test && npm run build
cd ../web && npm ci && npm test && npm run build
node scripts/check_import_boundaries.mjs
```
