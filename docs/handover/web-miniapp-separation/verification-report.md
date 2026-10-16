# Verification report — web-miniapp-separation

Môi trường xác minh: Node v24.21.0, npm 11.19.0, Python 3.12.15 (venv Django theo `backend/requirements.txt`), SQLite local, Ubuntu sandbox. Ngày chạy: 2026-10-16.

> Quy ước trung thực: mục nào không chạy được thì ghi NOT_RUN kèm lý do; kết quả SQLite KHÔNG được coi là bằng chứng MySQL/TiDB; kết quả browser KHÔNG thay thế thiết bị Zalo thật.

## 1. Kiểm thử tự động (chạy lại tươi trong phiên merge, exit code thật)

| Bộ | Lệnh | Exit | Kết quả |
|---|------|------|---------|
| Shared | `node --test packages/family_bridge_shared/tests/*.test.mjs` | 0 | **34 tests: 34 pass / 0 fail** (gồm purity contract: shared không DOM/zmp-sdk/storage) |
| Web | `cd web && npm test` | 0 | **187 tests: 187 pass / 0 fail** (web-screens 78 it + invariants + demo-isolation + connection-check-errors + router/pages) |
| Mini | `cd zalo-mini-app && npm test` | 0 | **279 tests: 279 pass / 0 fail / 0 skipped** (~86s) — không giảm assertion so với trước tách |
| Boundary | `node scripts/check_import_boundaries.mjs` | 0 | **5/5 assert PASS** — web closure 63 node không chứa `zalo-mini-app/**`; mini closure không chứa `web/**`; shared thuần; web không zmp-sdk/localStorage./sessionStorage.; không bare-import zmp-sdk. Báo cáo: `evidence/import-boundaries.json` |
| Web build | `cd web && npm run build` | 0 | `web/dist/index.html` + **44 assets hashed**, sourcemap OFF |
| Mini build | `cd zalo-mini-app && npm run build` | 0 | `www/` + **"Verified Zalo app-config and all referenced assets"** (mọi chunk động nằm trong manifest) |

## 2. Checkout sạch tái lập từ lockfile (W3-a, `evidence/verification-log-w3a.md`)

Clone cục bộ sạch → `npm ci` ở cả `web/` và `zalo-mini-app/` (exit 0, cài theo lockfile commit) → build web (44 assets) + mini (verify manifest) + 279 mini tests + 34 shared tests + boundary 5/5 — toàn bộ exit 0. Tức là **một checkout mới không phụ thuộc máy dev vẫn tái lập được toàn bộ artifact**.

## 3. E2E hai actor trên API thật (S1–S16)

Backend Django + SQLite (env random: `DJANGO_SECRET_KEY`, `FB_CLASS_INITIAL_PASSWORD` — không bao giờ in trong log), migrate + `provision_classroom` (dry-run rồi apply: 4 tài khoản HS001/HS002/PH001/PH002 + 2 proposal, 0 lỗi) → runserver 8001 → 16 bước.

**Tổng: 16 PASS / 1 FAIL / 2 NOT_RUN.** Chi tiết từng bước (status + mã lỗi thật): `evidence/e2e-results.json` + bảng trong `evidence/verification-log-w3a.md`.

Điểm đáng chú ý:

- S7/S8 proposal hai chiều + xung đột revision: 200 `awaiting_confirmation` → `connected` (`connection_id`, `relationship_kind=primary`, `generation=1`); expected_revision cũ → **409 `revision_conflict`**; confirm lần nữa khi đã connected → 400 `proposal_not_confirmable`.
- S11 F06: pause → deadline = giờ server + ~300s (299.999s); pause lần 2 không đổi deadline (server-decided).
- S13 F15: tạo/xem/hủy deletion request + privacy overview OK.
- S15 rate limit: 401×8 → 429×4, mã `rate_limited`.
- S16 CORS: preflight exact origin, không wildcard.

**S9 FAIL (đã chẩn đoán — KHÔNG phải lỗi web):** catalog cards 200 nhưng 0 card; preview 404 `card_not_available`; send 503 `module_unavailable`/`transport_not_wired`. Nguyên nhân: cổng CardProvider/MessageTransport chỉ được đăng ký trong feature-lab harness, chưa có code production nào đăng ký trên backend main (tính năng liên quan chưa merge). Backend fail-closed **đúng thiết kế**; web render trạng thái lỗi trung thực, không biến lỗi thành thành công. S10 (hộp thư recipient-only) và S12 (AI refine idempotent-replay) NOT_RUN vì hệ quả trực tiếp (không tạo được message; AI provider chưa cấu hình).

## 4. Ảnh thật desktop + mobile

26 PNG (1440x900 + 390x844) trong [evidence/](evidence/) + nhật ký `shots-manifest.json`. Phương pháp và đối chiếu Stitch: [design-verification.md](design-verification.md). Luồng chụp gồm login thật → consent → home → nghiệp vụ → logout (`#/login?reason=logged-out`).

## 5. Kiểm tra tài liệu agent

`python scripts/check_agent_docs.py` → **PASS** (files/links, wiring, Taste checksums, SEC register; 23 DEC giữ nguyên) — chạy lại sau khi bổ sung bộ tài liệu này; các link trong bộ docs đều resolve.

## 6. NOT_RUN / BLOCKED tổng hợp

| Hạng mục | Lý do | Ai có thể mở khóa |
|---|---|---|
| Thiết bị Zalo thật (mini app trên Zalo runtime) | Không có thiết bị/tài khoản Zalo trong phiên | Owner + US-049 |
| MySQL/TiDB thật (race suites) | Chỉ SQLite local; không có DB thật | Owner môi trường; xem note PR #34 |
| AI provider thật (F04 refine + idempotent replay) | Provider chưa cấu hình, backend fail-closed 503 | Owner cấu hình provider |
| Luồng gửi thẻ 201 end-to-end (F10 transport) | Backend chưa có production provider/transport wiring | Merge feature tương ứng |
| Render apply + smoke trên URL thật | Không có Render API key/dashboard trong phiên | Owner theo [deployment.md](deployment.md) OWNER CHECKLIST |
| `zmp deploy` mini app | Release Zalo là đợt riêng theo quy trình | Owner (US-050) |

## 7. Cách tái lập nhanh (3 lệnh)

```bash
cd web && npm ci && npm run build && python3 -m http.server 8080 -d dist
# mở http://127.0.0.1:8080/#/login (cần VITE_API_BASE_URL khi build — thiếu sẽ báo lỗi cấu hình rõ ràng)
node scripts/check_import_boundaries.mjs
```

E2E đầy đủ: script `scripts/websep_e2e_two_actors.mjs` (tự quản migrate/provision/runserver/S1–S16/cleanup) — xem log mẫu `evidence/verification-log-w3a.md`.
