# Checklist tích hợp/deploy cho Antigravity — backend foundation US-003

Người thực hiện: **đội Antigravity** (agent tạo nhánh KHÔNG deploy). Mọi bước
dưới đây cần giá trị thật từ môi trường/secret manager; không nhận secret qua
chat, không commit secret (SEC-19).

## 1. Tạo dịch vụ Render từ `render.yaml`
*(Hướng dẫn chi tiết toàn diện: xem `docs/handover/blueprint-deployment-guide.md`)*

- render.yaml khai báo 1 web service `family-bridge-backend` (runtime docker,
  context repo root `.`, plan `free`, region `singapore`, `autoDeployTrigger: 'off'`).
- `dockerfilePath`: `./Dockerfile` (cài đặt `default-libmysqlclient-dev` và copy cả `backend/` + `packages/`).
- **Không có `preDeployCommand`**: Render Free plan không hỗ trợ pre-deploy command (chỉ dành cho paid services).
  Migration phải chạy từ máy Huy trước khi bấm Deploy — xem mục 3.
- `healthCheckPath`: `/api/v1/health/`
- `DJANGO_SECRET_KEY` dùng `generateValue: true` của Render (sinh chuỗi random an toàn).
- Tạo service từ Blueprint/`render.yaml` trên nhánh `main`.

## 2. Cấp secrets/biến môi trường (Render dashboard hoặc secret manager)

| Key | Yêu cầu |
| --- | --- |
| `DJANGO_SECRET_KEY` | Random ≥50 ký tự (Render `generateValue` sinh 128 ký tự — đáp ứng; nếu tự cấp, dùng generator, không dùng chuỗi đoán được) |
| `DJANGO_ALLOWED_HOSTS` | **Tùy chọn cho lần đầu**: hostname `onrender.com` được tự động thêm từ `RENDER_EXTERNAL_HOSTNAME` (xem `settings.py`). Chỉ cần điền cho custom domain. |
| `CORS_ALLOWED_ORIGINS` | Origin frontend thực tế dùng để test (ví dụ `http://localhost:3000`). Origin Zalo WebView xác minh sau khi thử thiết bị thật, không đoán trước. Không dùng wildcard. |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | Từ MySQL provider; user runtime **ít quyền** (SEC-20 — không root/superuser) |
| `MYSQL_HOST` / `MYSQL_PORT` | Endpoint MySQL provider |
| `MYSQL_SSL_CA` | Chỉ khi provider yêu cầu TLS client-CA; khi có, settings bật `VERIFY_IDENTITY` |
| `DJANGO_ENV` | `production` (đã mặc định trong render.yaml) |
| `FB_FEATURES` | **Không khai báo** trong Blueprint; để vắng mặt để load đủ 16 feature labels. Chỉ set thủ công khi cần thu hẹp tính năng với danh sách label cụ thể. |

Kiểm tra lại: không secret nào nằm trong repo/log/issue; nếu lộ, revoke/rotate
trước khi tiếp tục.

## 3. Chạy migrate lần đầu từ máy Huy (TRƯỚC khi bấm Deploy)

> **Lưu ý:** Render Free plan không có Dashboard Shell, one-off jobs, hay preDeployCommand.
> Migration BẮT BUỘC phải chạy từ máy Huy trước khi ứng dụng nhận traffic.

Xem hướng dẫn đầy đủ từng bước tại `docs/handover/blueprint-deployment-guide.md`, mục 4.

Tóm tắt quy trình:
1. Tạo file `.env.migrate` tại `backend/` (không commit).
2. Xác nhận đang ở đúng commit sẽ deploy (`git rev-parse HEAD`).
3. Kích hoạt virtualenv và kiểm tra kết nối: `python manage.py check --database default`.
4. Kiểm tra migration pending: `python manage.py migrate --noinput --check`.
5. Chạy migration: `python manage.py migrate --noinput`.
6. Xác nhận hoàn tất (exit code 0).
7. Xóa file `.env.migrate` và thu hồi IP tạm khỏi MySQL allowlist.

Kỳ vọng: `accounts.0001_initial` (và migrations auth đi kèm) được áp dụng lên
MySQL thật.

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

- Backend đã tự động thêm `RENDER_EXTERNAL_HOSTNAME` vào `ALLOWED_HOSTS` khi khởi động.
  Không cần điền hostname đoán trước vào `DJANGO_ALLOWED_HOSTS`.
- Bật Mini App qua Zalo Android/iOS thật, ghi lại origin thực tế mà webview dùng.
- Đưa origin đó vào `CORS_ALLOWED_ORIGINS` sau khi xác minh. Settings **từ chối** `*`
  và từ chối khởi động nếu thiếu secret/đặt cấu hình sai — đó là hành vi mong muốn.
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