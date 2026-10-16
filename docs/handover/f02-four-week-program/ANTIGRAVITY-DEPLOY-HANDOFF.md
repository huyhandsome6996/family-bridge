# ANTIGRAVITY-DEPLOY-HANDOFF — Deploy Zalo Mini App Testing (2026-10-16)

Người viết: coding agent (Phần A + Phần B). Người THỰC HIỆN deploy:
**Antigravity** (theo phân công của Huy). Coding agent KHÔNG tự deploy Zalo.

## 1. Hai nguồn phát hành tách biệt

| Bản thử | Nguồn build | Phải chứa | Không được làm |
| --- | --- | --- | --- |
| A — Kết nối HS/PH | **exact main SHA `72930ae3fb6530235efa21d8f64b6ae3bd853af1`** (hoặc mới hơn nếu main đã được push có kiểm soát) | Login HS/PH hiện hành + đường đi home → đề xuất ghép đôi (Phần A). KHÔNG chứa F02 | Không tuyên bố bản này có chương trình bốn tuần |
| B — Trải nghiệm F02 | **exact head nhánh `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` sau commit sửa R1–R4 (lấy SHA thật bằng `git fetch` + `git rev-parse origin/tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` — head mới ≥ `b482c5c1485dc1d1a381c11dfc4c29391e678785`, đã sửa 4 lỗi audit)** | Phần A (vì main `72930ae` là ancestor) + F02 đầy đủ (wiring/thỏa ước/UI /companion) + bản sửa R1–R4 | Không tự merge F02 vào main chỉ để deploy; không deploy artifact main cũ rồi nói là F02 mới |

Khuyến nghị: deploy thẳng **bản B** (đã chứa phần A) để Huy test cả hai nhóm
tính năng trên một bản Testing. Nếu nội dung F02 chưa được thầy publish thì
bản B vẫn dùng được cho kết nối (Phần A) + chương trình hiển thị trung thực
"chưa có nội dung phát hành" — KHÔNG fake.

## 2. Thông tin build

- Repo: `https://github.com/huyhandsome6996/family-bridge`
- Thư mục build: `zalo-mini-app/` (KHÔNG build từ `web/`, không đụng web/Render)
- Node: dùng phiên bản đã kiểm chứng CI (22); lệnh:
  ```bash
  cd zalo-mini-app
  npm ci                 # theo lockfile, không upgrade
  npm test               # 313 test happy-dom phải PASS
  npm run build          # vite build + verify-build (Zalo app-config + manifest + assets)
  ```
- Env public build-time: `VITE_API_BASE_URL` trỏ backend thực đang phục vụ
  bản thử (hiện `https://family-bridge-backend.onrender.com`). KHÔNG đặt
  secret vào VITE_*.
- Mini App ID: `3411096375330044972`; đích **Testing**; description ghi nguồn
  (A/main hoặc B/F02) + short SHA + giờ Việt Nam. KHÔNG submit public review.

## 3. Backend mà bản F02 cần — ĐỌC KỸ, KHÔNG DÙNG BACKEND MAIN CHO B

**Bản B ĐẦY ĐỦ không thể chạy trên backend main production.** Backend main
(`72930ae`) KHÔNG có: wiring provider production (→ 503
`program_content_unwired`), API thỏa ước instance (propose/confirm/withdraw),
migration `f02_program.0002`, và nội dung published. Trỏ B vào backend main
chỉ để xem Phần A dùng được; mọi phần F02 sẽ trả lỗi thật (404/503) — đó
KHÔNG phải là "F02 đã chạy". Bản B đầy đủ = backend cùng phiên bản nhánh F02
+ migration `0002` + nội dung published hợp lệ.

**KHÔNG merge F02 vào main, KHÔNG đụng Render production** — dùng backend
test riêng (mục 3b): DB riêng, dữ liệu synthetic, chạy ở máy/tunnel riêng.

### 3b. Runbook backend test RIÊNG cho bản B (DB riêng, synthetic, không đụng production)

Chuẩn bị ở máy/tunnel riêng (KHÔNG trỏ vào Render production, KHÔNG dùng DB
production):

```bash
# 0) Lấy code đúng head nhánh F02 (SHA ghi ở mục 1 sau khi fetch)
git clone https://github.com/huyhandsome6996/family-bridge
cd family-bridge
git checkout tinh-nang/f02-dong-hanh-bon-tuan-us036-us044
git rev-parse HEAD   # ghi lại SHA build

# 1) Môi trường Python (khớp CI: Python 3.12 + Django 5.2)
python3 -m venv .venv-test && . .venv-test/bin/activate
pip install -r backend/requirements.txt

# 2) DB SQLITE RIÊNG (file db.sqlite3 trong backend/ — chỉ dùng cho bản thử)
cd backend
export DJANGO_SECRET_KEY="<tự sinh chuỗi >=50 ký tự, KHÔNG dùng key production>"
export DJANGO_ENV=development
export DB_ENGINE=sqlite
export DJANGO_ALLOWED_HOSTS="127.0.0.1,localhost,<host-tunnel-nếu-có>"
export CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"

# 3) Migration (gồm f02_program 0002)
python manage.py migrate

# 4) Tạo 2 tài khoản lớp synthetic (HS + PH) để Huy đăng nhập thiết bị thật
#    CSV bắt buộc header: external_ref,login_code,role,class_ref,display_name
cat > /tmp/antigravity-accounts.csv <<'CSV'
external_ref,login_code,role,class_ref,display_name
synthetic-b-01,AGHS01,student,AG-CLASS,Học sinh thử
synthetic-b-02,AGPH01,caregiver,AG-CLASS,Phụ huynh thử
CSV
export FB_CLASS_INITIAL_PASSWORD="<mật khẩu khởi tạo do Huy/Antigravity tự đặt, >= 12 ký tự>"
python manage.py provision_classroom --csv /tmp/antigravity-accounts.csv
# Ghi lại login_code (AGHS01/AGPH01) + mật khẩu để đưa Huy (KHÔNG đưa vào repo/log)

# 5) Nạp nội dung DRAFT chương trình + 4 hoạt động chung (idempotent)
python manage.py seed_f02_draft_program

# 6) PUBLISH nội dung synthetic CHO DB TEST RIÊNG (mô phỏng admin có caps —
#    CHỈ làm trên DB thử này; tuyệt đối KHÔNG chạy lệnh này trên production)
python manage.py shell <<'PY'
from family_bridge_features.admin_core.models import ContentItem
from family_bridge_features.admin_core.services.admin import ContentLifecycleService
svc = ContentLifecycleService()
for item in ContentItem.objects.filter(status="draft",
                                       kind__in=("f02_program", "activity", "micro_lesson")):
    svc.publish(actor_id="antigravity:test-setup", content_id=str(item.id),
                expected_revision=item.revision)
    print("published:", item.kind, item.content_key, "rev", item.revision)
PY

# 7) Chạy backend (0.0.0.0 để tunnel trỏ vào được)
python manage.py runserver 0.0.0.0:8000
```

Đưa API ra mạng public cho Zalo điện thoại:
- **Điện thoại không trỏ được localhost** — cần tunnel HTTPS thật (ví dụ
  `cloudflared tunnel --url http://127.0.0.1:8000` hoặc ngrok). Lấy
  `https://<host-tunnel>` làm `VITE_API_BASE_URL` khi build bản B (build-time,
  đổi URL = build lại).
- Nếu request bị chặn CORS từ webview Zalo: xem header `Origin` của request
  bị chặn rồi thêm ĐÚNG origin đó (exact, không wildcard `*` — backend từ
  chối wildcard theo thiết kế) vào `CORS_ALLOWED_ORIGINS` và restart.
- Zalo platform có thể yêu cầu khai báo domain API của Mini App ID trong
  bảng điều khiển Zalo Mini App — Antigravity tự kiểm tra mục đó khi upload.
- Endpoint public quan trọng cho smoke test (không cần đoán):
  `GET <API>/api/v1/health`, `GET /api/v1/ready`, `POST /api/v1/auth/class-session`
  (body `{code, password}`), `GET /api/v1/program/catalog` (Bearer token).

## 4. Checklist trước/sau upload

Trước upload:
- [ ] `git fetch` — xác nhận head nhánh F02 vẫn là SHA ghi ở mục 1 (nếu đã
  đổi: kiểm tra diff, chạy lại `npm test` + `npm run build`, cập nhật mô tả).
- [ ] Working tree sạch, build từ commit (không code local chưa commit).
- [ ] Manifest/dynamic chunks đầy đủ (verify-build tự kiểm tra).
- [ ] Không credential trong bundle (CI đã scan; kiểm tra lại nếu build local).

Sau upload:
- [ ] Ghi lại version ID + deep link + QR của bản Testing VỪA deploy (không
  dùng QR version 2 cũ trong docs/zalo-hs-ph-release làm bằng chứng bản mới).
- [ ] Mô tả rõ nguồn A/main hay B/F02 trong biên bản của Antigravity.
- [ ] Báo lại Huy: SHA đã build, version ID, cách test (checklist ở
  `docs/handover/f02-four-week-program/handover.md` mục 6 và
  `docs/handover/hs-ph-connection-part-a/report.md`).

## 5. Rollback

- Rollback Zalo: upload lại bản Testing trước đó (version đã lưu ở mục 4)
  hoặc build lại từ main `4884c83` (bản cũ trước Phần A nếu cần).
- KHÔNG reset database/tài khoản/consent; không tự hủy kết nối người dùng đã
  xác nhận; không drop data.

## 6. Trạng thái bằng chứng của coding agent

- **"Đã chuẩn bị bàn giao Antigravity, CHƯA deploy Zalo"** — coding agent
  không upload bản mới; mọi version/QR mới chỉ do Antigravity ghi sau khi
  upload + xác minh thành công.
- Audit 2026-10-16 tìm thấy 4 lỗi R1–R4 (nút mời không hiện trên payload
  thật; thỏa ước confirmed bị supersede sớm; pin rev cũ tràn cửa sổ catalog
  không đọc được; tiến độ lỗi bị nuốt). Đã sửa trên head mới + regression
  tests trong repo (`test_f02_audit_regressions.py` 10 case,
  `companion-audit-fixes.test.mjs` 8 case); 2 probe backend + 2 probe DOM
  gốc của audit chạy lại ĐỀU PASS. Mini App 313/313, backend full 494 OK
  (SQLite), shared 34/34, mobile F02 4/4, web regression 187/187 (không sửa
  web), build/manifest/boundary PASS.
- MySQL/TiDB thật, Zalo device test: NOT_RUN (không có thiết bị/runtime
  trong task này) — không đổi thành pass.
