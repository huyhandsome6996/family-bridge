# Deployment — Render, CI, Zalo release, rollback

## 1. Render web service (hiện trạng sau khi tách)

`render.yaml` — service `family-bridge-web` (không thêm service mới, không đổi domain, không tạo DB mới):

```yaml
name: family-bridge-web
runtime: static
branch: main
buildCommand: cd web && npm ci && npm run build
staticPublishPath: web/dist
autoDeployTrigger: commit
```

- `cd web && npm ci` cài **từ `web/package-lock.json` đã commit** — không phụ thuộc file sinh trên máy dev; `npm run build` build Vite ra `web/dist` (và tự động build đúng vì shared package được import bằng relative path từ root — build context vẫn là root repo).
- `VITE_API_BASE_URL` là env **build-time** (`sync:false`): đổi giá trị phải rebuild; giữ nguyên là public API origin hiện tại; **không** đặt secret vào VITE_*.
- Thiếu `VITE_API_BASE_URL` khi build → app web ném ApiError kind `configuration` tiếng Việt ngay khi chạy — **không có fallback mock** (test web chốt).
- Cache headers: asset hashed (`assets/*`) immutable; `index.html` no-cache/revalidate → sau publish, refresh không trộn chunk cũ/mới.
- Comment ADR trong `render.yaml` đã viết lại (supersede 2026-10-16: hai frontend độc lập + shared + rollback về `zalo-mini-app/www`).

### OWNER CHECKLIST sau khi main cập nhật (autoDeployTrigger: commit)

1. Render dashboard → service `family-bridge-web` → lần deploy mới nhất phải SUCCESS với buildCommand mới; mở trang → phải thấy app web (không phải bản mini build cũ).
2. Kiểm tra env `VITE_API_BASE_URL` vẫn trỏ origin API công khai (giữ nguyên giá trị cũ).
3. CORS backend: origin web Render giữ nguyên như đã cấu hình từ đợt web-render Task 2 (exact origin, không wildcard) — không cần đổi vì domain không đổi.
4. Smoke: mở `/#/login` → đăng nhập mã lớp thật → `#/consent` → `#/home`.
5. Rollback nếu hỏng: xem mục 4.

## 2. CI (GitHub Actions)

- `.github/workflows/tests.yml` — job `web` mới (Wave 1): `cd web && npm ci && node --test tests/*.test.mjs` + build + shared tests + `node scripts/check_import_boundaries.mjs`. Có guard "wave readiness" nên không gãy khi web/shared chưa tồn tại ở lịch sử commit.
- Hiện KHÔNG có `paths:` filter → mọi push chạy cả mini + web job → điều "thay đổi shared package phải chạy cả hai đầu" thỏa mãn theo hướng luôn-chạy. Việc reorg path filters thuộc ownership PR #35 (đang mở) — KHÔNG đụng trong nhánh này để tránh xung đột.
- Không đụng `backend-foundation.yml` / `miniapp-foundation.yml` (PR #35 đang sở hữu).
- CI web KHÔNG tự deploy Zalo: `zmp deploy` không nằm trong CI — việc publish Mini App lên Zalo là một đợt release riêng (mục 3).

## 3. Zalo Mini App release

- `zalo-mini-app/` build ra `www/` + `app-config.json` (manifest) — `verify-build.mjs` assert mọi chunk động nằm trong manifest (đã chạy PASS trong đợt xác minh; xem [verification-report.md](verification-report.md)).
- Web tách xong KHÔNG tự động làm mini app lên Zalo: submit/publish Zalo vẫn là bước owner theo quy trình hiện hành (US-049/050).
- Nếu muốn release mini sau khi main cập nhật: chạy `cd zalo-mini-app && npm ci && npm run build` rồi submit theo quy trình Zalo; manifest + chunk đã được verify trước khi commit.

## 4. Rollback (runbook ngắn)

- **Rollback web về bản cũ**: revert `render.yaml` về build/publish trước đó (`buildCommand` build zalo-mini-app, `staticPublishPath: zalo-mini-app/www`) → Render redeploy. Mini app build vẫn chạy song song trong repo nên đường này luôn khả thi.
- Không drop DB, không reset account, không tắt revoke/deletion ledger khi rollback — chỉ đổi static source.
- Mọi thay đổi backend (nếu sau này cần) phải đi diff/test/contract/release plan riêng — nhánh này không đụng backend.

## 5. Kiểm toán tương thích nhánh (điều kiện "chừa đường" khi vào main)

Đã thực hiện 2026-10-16 trước khi merge (chi tiết lệnh ở [verification-report.md](verification-report.md)):

- Toàn bộ 20 nhánh remote (không tính main) đã được liệt kê và so `origin/main...branch`.
- 16 nhánh có **0 commit riêng** (placeholder/đã merge: f02–f10, f12–f14, web-render-task2, codex/*) → không rủi ro.
- 5 nhánh có commit riêng:
  - `bao-tri/ci-branch-filters-reorg` (PR #35) — **0 file chung** với nhánh này, merge mô phỏng CLEAN.
  - `tinh-nang/f01-…` (PR #32) — **0 file chung**, CLEAN.
  - `tinh-nang/f11-…` — **0 file chung**, CLEAN.
  - `bao-tri/chong-trung-mysql-tidb-us004` (PR #34) — conflict **CÓ SẴN** với main (`test_race_mysql.py`) từ trước nhánh này; nhánh này KHÔNG thêm conflict mới.
  - `tinh-nang/f15-…` (PR #33) — conflict **CÓ SẴN** với main (`sessions.py`, `privacy/index.js`, `profile/index.js`, `pages.test.mjs`) từ trước; nhánh này KHÔNG thêm conflict mới.
- Kết luận: merge nhánh này vào main **không làm tồi tệ hơn** tình trạng merge của bất kỳ nhánh nào; #32/#35/f11 merge sạch; #33/#34 cần owner resolve conflict có sẵn như trước đây.
