# Checklist tích hợp/deploy cho Antigravity — backend foundation US-003

Người thực hiện: **đội Antigravity** (agent tạo nhánh KHÔNG deploy). Mọi bước
dưới đây cần giá trị thật từ môi trường/secret manager; không nhận secret qua
chat, không commit secret (SEC-19).

## 1. Tạo dịch vụ Render từ `render.yaml`

- render.yaml đã khai báo 1 web service `family-bridge-backend` (runtime python,
  `rootDir: backend`, plan `starter`, `autoDeploy: false`).
- `buildCommand`: `pip install -r requirements-mysql.txt`
- `startCommand`: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
- `healthCheckPath`: `/api/v1/health/`
- `DJANGO_SECRET_KEY` dùng `generateValue: true` của Render (Render sinh chuỗi random 128 ký tự — đạt yêu cầu ≥50 của settings; nếu tự cấp, dùng generator, không dùng chuỗi đoán được); `PYTHON_VERSION = 3.12.15`.
- Tạo service từ Blueprint/`render.yaml` của nhánh này. **Migrate không nằm trong
  startCommand** — chạy one-off theo bước 3.

## 2. Cấp secrets/biến môi trường (Render dashboard hoặc secret manager)

| Key | Yêu cầu |
| --- | --- |
| `DJANGO_SECRET_KEY` | Random ≥50 ký tự (Render `generateValue` sinh 128 ký tự — đáp ứng; nếu tự cấp, dùng generator, không dùng chuỗi đoán được) |
| `DJANGO_ALLOWED_HOSTS` | Host thật của service Render (vd `<service>.onrender.com` + domain tùy chỉnh), phân tách bằng dấu phẩy |
| `CORS_ALLOWED_ORIGINS` | Origin thật của Mini App quan sát được trên **Android/iOS Zalo** (không dùng origin localhost ở production) |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | Từ MySQL provider; user runtime **ít quyền** (SEC-20 — không root/superuser) |
| `MYSQL_HOST` / `MYSQL_PORT` | Endpoint MySQL provider |
| `MYSQL_SSL_CA` | Chỉ khi provider yêu cầu TLS client-CA; khi có, settings bật `VERIFY_IDENTITY` |
| `DJANGO_ENV` | `production` (đã mặc định trong render.yaml) |

Kiểm tra lại: không secret nào nằm trong repo/log/issue; nếu lộ, revoke/rotate
trước khi tiếp tục.

## 3. Chạy migrate lần đầu (one-off, không nằm trong startCommand)

Sau khi service tạo xong và env đã cấp, chạy một lần từ máy có access hoặc Render
Shell/one-off job:

```bash
pip install -r requirements-mysql.txt
DJANGO_ENV=production DJANGO_SECRET_KEY='<secret thật, ≥50 ký tự>' \
DB_ENGINE=mysql MYSQL_HOST='<host thật>' MYSQL_PORT='<port>' \
MYSQL_DATABASE='<db>' MYSQL_USER='<user ít quyền>' MYSQL_PASSWORD='<password>' \
[MYSQL_SSL_CA='<ca.pem nếu cần>'] \
python manage.py migrate --noinput
```

Lưu ý `DJANGO_SECRET_KEY` bắt buộc trong lệnh trên: settings production fail-closed
khi thiếu secret, migrate sẽ từ chối chạy nếu không cấp (hành vi kiểm soát chủ đích).

Phân biệt hai đường triển khai: nếu chạy bằng **Docker image** (backend/Dockerfile),
CMD hiện có chạy `migrate --noinput` tự động trước gunicorn — chấp nhận được cho
môi trường testing nhưng lưu ý instance không boot khi MySQL chưa sẵn sàng; nếu
cảo thiện hơn, tách migrate one-off như đường Render python runtime ở trên và
để CMD chỉ chạy gunicorn (quyết định thuộc Antigravity, không bắt buộc đổi trong đợt này).

Kỳ vọng: `accounts.0001_initial` (và migrations auth đi kèm) được áp dụng lên
MySQL thật. Nếu dùng account migrate riêng nhiều quyền hơn user runtime (SEC-20),
hãy tách và chỉ cấp cho bước one-off này.

## 4. Verify sau deploy

```bash
curl -i https://<host thật>/api/v1/health/   # 200 {"status":"ok"}, Cache-Control: no-store
curl -i https://<host thật>/api/v1/ready/    # 200 {"status":"ok"} khi MySQL reachable
```

Kiểm tra thêm:

- `/ready/` khi MySQL dừng → `503 {"status":"unavailable"}`, response và log
  KHÔNG chứa tên DB/password/host/stack trace.
- Một API chưa tồn tại (vd `POST /api/v1/auth/zalo/`) → 404, không lộ cấu hình.
- Render health check (healthCheckPath) chuyển xanh và giữ ổn định.

## 5. ALLOWED_HOSTS / CORS với origin thật

- Bật Mini App qua Zalo Android/iOS thật, ghi lại origin thực tế mà webview dùng.
- Đưa origin đó vào `CORS_ALLOWED_ORIGINS`; host Render vào
  `DJANGO_ALLOWED_HOSTS`. Settings **từ chối** `*` và từ chối khởi động nếu thiếu
  secret/đặt cấu hình sai — đó là hành vi mong muốn, đừng "nới" để qua.
- Xác nhận request từ origin khác bị chặn CORS trên `/api/.*` và
  `CORS_ALLOW_CREDENTIALS = False` (không dùng cookie auth).

## 6. Những gì KHÔNG được coi là đã xong sau khi checklist này xanh

- **Đăng nhập Zalo / phát token** (US-011): chưa có endpoint; không đếm auth
  Zalo là hoàn thành.
- **Tính năng nghiệp vụ** (hộp thư, thẻ cảm xúc, nhật ký, AI, khảo sát…):
  chưa tồn tại trong nhánh này.
- **Bằng chứng MySQL "đã thử trên thiết bị"**: job CI MySQL chỉ chứng minh
  migration chạy trên MySQL 8.4 trong CI; device/Zalo thật chưa thử.
- **"US-003 Done"/"Zalo đã duyệt"**: nhãn đúng là "backend foundation đã kiểm
  tra cục bộ" + tích hợp Render theo checklist này khi hoàn tất.

## 7. Rollback / kill switch cơ bản (chỉ dùng sẵn có của Render)

- **Rollback phiên bản**: Render dashboard → service → "Events"/"Deploys" →
  chọn deploy trước đó → **Rollback** (Render hỗ trợ rollback deploy gần nhất).
- **Tắt nhanh (kill switch)**: Suspend service hoặc set env tạm thời khiến
  settings fail-closed (vd rút `DJANGO_SECRET_KEY`/đổi sai chủ ý là **không**
  khuyến nghị làm kill switch — dùng Suspend/Deploy cancel của Render).
  Health check fail sẽ giữ traffic không được đẩy đến instance lỗi.
- **autoDeploy: false**: deploy mới chỉ chạy khi bấm thủ công — dùng làm cơ chế ngăn
  thay đổi ngoài ý muốn.
- Không yêu cầu hạ tầng mới (WAF, gateway, Redis…) trong đợt nền tảng này;
  DRF throttle chỉ là lớp giới hạn cơ bản, không thay gateway chống DoS.

## 8. Ranh giới bảo mật còn mở (ghi lại khi bàn tiếp)

- Chưa có token revoke/refresh rotation flow (US-011/012 thiết kế trước khi phát
  hành token thật — SEC-02).
- Chưa có Zalo credential verification (SEC-01).
- `check --deploy` cần chạy lại với env thật sau khi secrets được cấp (CI đã chạy
  với giá trị dummy chỉ dùng cho CI).
