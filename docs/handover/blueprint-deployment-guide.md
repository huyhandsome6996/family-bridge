# Hướng Dẫn Triển Khai Backend Family Bridge Lên Render Bằng Blueprint

Tài liệu này cung cấp hướng dẫn đầy đủ và chính xác để triển khai dịch vụ backend **Family Bridge** (`family-bridge-backend`) lên Render bằng Blueprint từ repository [huyhandsome6996/family-bridge](https://github.com/huyhandsome6996/family-bridge), nhánh `main`.

> [!IMPORTANT]
> **Điều kiện cần thiết duy nhất chưa có**: Database MySQL từ xa. Phần code và cấu hình repo đã sẵn sàng; deploy thực chất chỉ bắt đầu được khi Huy có thông tin kết nối MySQL.

---

## 1. Quyết định kiến trúc & Cấu hình Blueprint

### 1.1. Lý do lựa chọn Docker Runtime

* **Ràng buộc mã nguồn:** Backend sử dụng `mysqlclient==2.2.8`. Trên Linux, package này chỉ phân phối dưới dạng source distribution (không có binary wheel), bắt buộc phải biên dịch C với `default-libmysqlclient-dev` và `pkg-config`.
* **Ràng buộc Render Native Runtime:** Chạy không có quyền root; thiếu công cụ phát triển MySQL. `pip install mysqlclient` thất bại với `Permission denied`.
* **Giải pháp:** Docker runtime với `dockerContext: .` (repo root) — cài đủ thư viện hệ thống, copy cả `backend/` lẫn `packages/`, hoạt động trên gói Free.
* **Lưu ý về image:** `Dockerfile` hiện tại là single-stage build với `FROM python:3.12-slim`. Phiên bản Python trong container do Docker Hub quyết định theo image tag, **không phải** do file `.python-version` (file đó chỉ dùng cho Render Native Runtime hoặc pyenv).

### 1.2. Migration trên Render Free Plan

> [!WARNING]
> **`preDeployCommand` KHÔNG được hỗ trợ trên Render Free plan.**
> Nguồn chính thức: https://render.com/docs/deploys#pre-deploy-command
> *"The pre-deploy command is available for paid web services, private services, and background workers."*
>
> Render Free plan cũng không có Dashboard Shell hay one-off jobs. Migration phải chạy từ máy Huy trước khi ứng dụng nhận traffic.

### 1.3. Cấu hình `render.yaml` (phiên bản hiện tại)

```yaml
services:
  - type: web
    name: family-bridge-backend
    runtime: docker
    plan: free
    region: singapore
    branch: main
    dockerfilePath: ./Dockerfile
    dockerContext: .
    autoDeployTrigger: 'off'
    healthCheckPath: /api/v1/health/
    envVars:
      - key: DJANGO_ENV
        value: production
      - key: DJANGO_SECRET_KEY
        generateValue: true
      - key: DB_ENGINE
        value: mysql
      - key: DJANGO_ALLOWED_HOSTS
        sync: false
      - key: CORS_ALLOWED_ORIGINS
        sync: false
      - key: MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD / MYSQL_HOST / MYSQL_PORT
        sync: false
      - key: MYSQL_SSL_CA
        sync: false
      - key: ZALO_APP_ID / ZALO_APP_SECRET
        sync: false
      # FB_FEATURES không khai báo ở đây (xem mục 2.3)
```

---

## 2. Biến môi trường

### 2.1. Bảng biến môi trường đầy đủ

| Tên biến | Khi nào bắt buộc | Giá trị / Ví dụ | Ghi chú |
|:---------|:-----------------|:----------------|:--------|
| `DJANGO_ENV` | Luôn | `production` | Đặt sẵn trong `render.yaml` |
| `DJANGO_SECRET_KEY` | Luôn | Chuỗi ngẫu nhiên ≥50 ký tự | `generateValue: true` — Render tự sinh |
| `DB_ENGINE` | Luôn | `mysql` | Đặt sẵn trong `render.yaml` |
| `DJANGO_ALLOWED_HOSTS` | Tùy chọn\* | `my-custom-domain.com` | \*Không bắt buộc cho lần đầu — xem mục 2.2 |
| `CORS_ALLOWED_ORIGINS` | Cho frontend | `http://localhost:3000,http://127.0.0.1:3000` | Xem mục 2.2 |
| `MYSQL_HOST` | Luôn | `gateway01.ap-southeast-1.prod.aws.tidbcloud.com` | Từ nhà cung cấp MySQL |
| `MYSQL_PORT` | Luôn | `3306` hoặc `4000` (TiDB) | Từ nhà cung cấp MySQL |
| `MYSQL_DATABASE` | Luôn | `family_bridge` | Từ nhà cung cấp MySQL |
| `MYSQL_USER` | Luôn | `family_bridge_user` | Từ nhà cung cấp MySQL |
| `MYSQL_PASSWORD` | Luôn | — | Từ nhà cung cấp MySQL |
| `MYSQL_SSL_CA` | Khi DB yêu cầu TLS | `/etc/secrets/ca.pem` | Xem mục 3.2 |
| `ZALO_APP_ID` | Khi dùng auth Zalo | `3813524408107862261` | Zalo Developers Console |
| `ZALO_APP_SECRET` | Khi dùng auth Zalo | — | Zalo Developers Console |
| `FB_FEATURES` | **Không khai báo** | — | Xem mục 2.3 |

### 2.2. Hostname và CORS — Không phải đoán hostname trước

**ALLOWED_HOSTS:**
Render tự động inject biến `RENDER_EXTERNAL_HOSTNAME` (ví dụ: `family-bridge-backend.onrender.com`) cho web services khi chạy. Backend Family Bridge đã được cập nhật để đọc biến này và tự động thêm vào `ALLOWED_HOSTS` (xem `backend/config/settings.py`).

→ **Huy không cần điền `DJANGO_ALLOWED_HOSTS` để bắt đầu deploy.** Chỉ cần điền khi sử dụng custom domain.

**CORS:**
Điền các origin frontend thực tế đang dùng để test:
```
http://localhost:3000,http://127.0.0.1:3000
```
> [!IMPORTANT]
> Origin của Zalo Mini App WebView **chưa được xác minh**. Không thêm vào CORS cho đến khi đã kiểm tra thực tế trên thiết bị. Không dùng wildcard.

### 2.3. FB_FEATURES — Không khai báo trong Blueprint

**Lý do:** Khi `FB_FEATURES` vắng mặt, `settings.py` dùng default (toàn bộ 16 label). Khi `FB_FEATURES=""` (chuỗi rỗng), `csv_env` trả `[]` → load 0 feature → app khởi động thiếu tính năng mà không có lỗi rõ ràng.

**Cách thu hẹp tính năng (khi cần):** Vào Render Dashboard → Environment tab → thêm biến `FB_FEATURES` với giá trị là danh sách label phân tách bởi dấu phẩy. Sử dụng đúng tên label:
```
f01_identity,f02_program,f03_cards,f04_ai,f05_inbox,f06_drafts,
f07_mood,f08_journal,f09_activities,f10_signal,f11_supporters,
f12_appointments,f13_help,f14_surveys,f15_privacy,admin_core
```

---

## 3. Điều kiện cần thiết: Database MySQL từ xa

> [!WARNING]
> **MySQL `localhost:3306` trên máy tính cá nhân không thể truy cập được từ Render.** Huy cần chuẩn bị một database MySQL từ xa có thể truy cập qua internet trước khi bấm Deploy.

### 3.1. Các phương án Database

**Phương án A — MySQL chuẩn (khuyên dùng cho độ tương thích tối đa):**
- [Aiven for MySQL](https://aiven.io/mysql): MySQL 8.0 chuẩn, gói dùng thử miễn phí (thời hạn theo chính sách Aiven tại thời điểm đăng ký — kiểm tra tại trang chính thức). Bắt buộc chứng thư TLS CA.
- Render MySQL Private Service: yêu cầu gói trả phí Render. Xem [Render MySQL Guide](https://render.com/docs/deploy-mysql).

**Phương án B — TiDB Serverless (phương án thay thế cần đánh giá):**

> [!NOTE]
> TiDB tương thích giao thức MySQL nhưng **không phải MySQL nguyên bản**. Có một số khác biệt cần kiểm tra trước khi cam kết:
> - **DDL transactions**: TiDB không hỗ trợ DDL trong transaction — `ALTER TABLE` bên trong transaction sẽ bị rollback khác với MySQL.
> - **AUTO_INCREMENT**: TiDB tăng theo bước lớn hơn (step = 30000 theo mặc định) thay vì tăng 1, có thể gây ID gap lớn.
> - **Foreign key**: Mặc định disabled trên TiDB Serverless; cần bật `foreign_key_checks=ON`.
> - **Gói miễn phí**: Kiểm tra giới hạn và điều khoản dịch vụ tại [tidbcloud.com/pricing](https://www.pingcap.com/tidb-serverless/) — điều khoản có thể thay đổi.
>
> **Không tự quyết định dùng TiDB.** Đây là thông tin để Huy cân nhắc, không phải lựa chọn mặc định.

### 3.2. Cấu hình TLS CA Certificate

Khi nhà cung cấp MySQL yêu cầu TLS:
1. Tải file `ca.pem` từ dashboard của nhà cung cấp.
2. Trên Render Dashboard → service → **Environment** → cuộn xuống **Secret Files**.
3. Bấm **Add Secret File**: Filename = `ca.pem`, dán toàn bộ nội dung file (bắt đầu bằng `-----BEGIN CERTIFICATE-----`).
4. Render mount tại `/etc/secrets/ca.pem` trong container.
5. Điền biến môi trường: `MYSQL_SSL_CA = /etc/secrets/ca.pem`

*(Lưu ý: giá trị phải là đường dẫn file trong container, không dán nội dung chứng thư trực tiếp vào biến.)*

---

## 4. Quy trình chạy Migration từ máy Huy

> [!IMPORTANT]
> Chạy migration **trước khi** bấm Deploy lần đầu và **trước** mỗi lần deploy có schema thay đổi. Không đưa migration vào Docker CMD hay build command.

### Bước 1 — Chuẩn bị môi trường local an toàn

Tạo file `.env.migrate` tại thư mục `backend/` (file này **không được commit** — kiểm tra `.gitignore`):

```dotenv
# backend/.env.migrate — KHÔNG COMMIT FILE NÀY
DJANGO_ENV=production
DB_ENGINE=mysql
DJANGO_SECRET_KEY=du-lieu-gia-chi-de-chay-migrate
MYSQL_HOST=<host từ nhà cung cấp>
MYSQL_PORT=<port từ nhà cung cấp>
MYSQL_DATABASE=<tên database>
MYSQL_USER=<username>
MYSQL_PASSWORD=<password>
# Nếu cần TLS:
MYSQL_SSL_CA=<đường dẫn tuyệt đối tới file ca.pem trên máy Huy>
```

Xác nhận file này trong `.gitignore`:
```powershell
# Kiểm tra .gitignore đã bao gồm .env.migrate chưa
Select-String ".env" C:\Users\PC\.gemini\antigravity\scratch\family-bridge\.gitignore
```

### Bước 2 — Xác nhận đang ở đúng commit sẽ deploy

```powershell
cd C:\Users\PC\.gemini\antigravity\scratch\family-bridge
git log --oneline -3
# Đảm bảo HEAD trỏ về commit sẽ deploy (main mới nhất)
git rev-parse HEAD
```

### Bước 3 — Kích hoạt virtualenv và kiểm tra kết nối database

```powershell
cd C:\Users\PC\.gemini\antigravity\scratch\family-bridge\backend

# Kích hoạt virtualenv
.\.venv\Scripts\Activate.ps1

# Set biến môi trường từ file (không source vào shell — đọc từng dòng)
Get-Content .\.env.migrate | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim())
    }
}

# Kiểm tra kết nối database
python manage.py check --database default
# Kết quả mong đợi: "System check identified no issues (0 silenced)."
```

Nếu cần TLS và CA file, đặt `MYSQL_SSL_CA` trỏ tới đường dẫn tuyệt đối file `.pem` trên máy Huy (ví dụ: `C:\Users\PC\Downloads\ca.pem`).

### Bước 4 — Kiểm tra migration chưa áp dụng

```powershell
# Xem danh sách migration cần chạy (dry run)
python manage.py migrate --noinput --check
# Nếu có migration pending, lệnh này exit code != 0 và liệt kê các migration.
# Nếu tất cả đã áp dụng, không có output và exit code = 0.
```

### Bước 5 — Chạy migration

```powershell
python manage.py migrate --noinput
# Kết quả mong đợi: dòng "Running migrations: No migrations to apply." (lần đầu)
# hoặc danh sách các migration đã áp dụng thành công.
```

### Bước 6 — Xác nhận hoàn tất

```powershell
# Chạy lại check để xác nhận không còn migration pending
python manage.py migrate --noinput --check
# Phải exit code 0.

# Kiểm tra ready endpoint có thể kết nối DB thành công
# (Không chạy được từ local với DB từ xa qua HTTP, nhưng check --database đã đủ)
python manage.py check --database default
```

### Bước 7 — Xóa biến môi trường và file tạm

```powershell
# Xóa biến môi trường đã set (tắt và mở lại PowerShell, hoặc):
[System.Environment]::SetEnvironmentVariable("MYSQL_PASSWORD", $null)
[System.Environment]::SetEnvironmentVariable("DJANGO_SECRET_KEY", $null)
# ... các biến khác

# Xóa file .env.migrate
Remove-Item backend\.env.migrate
```

---

## 5. Các bước Deploy trên Render Dashboard

1. Truy cập [dashboard.render.com](https://dashboard.render.com).
2. Bấm **New +** → chọn **Blueprint**.
3. Kết nối GitHub và chọn repo `huyhandsome6996/family-bridge`.
4. Branch: **`main`**, Blueprint Path: `render.yaml`.
5. Render liệt kê service `family-bridge-backend` (Type: Web, Runtime: Docker, Plan: Free, Region: Singapore).
6. Điền các biến `sync: false`:
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
   - `CORS_ALLOWED_ORIGINS`: ví dụ `http://localhost:3000,http://127.0.0.1:3000`
   - `DJANGO_ALLOWED_HOSTS`: **để trống** (hostname tự động thêm qua `RENDER_EXTERNAL_HOSTNAME`)
   - `MYSQL_SSL_CA`: `/etc/secrets/ca.pem` nếu đã upload CA file
   - `ZALO_APP_ID`, `ZALO_APP_SECRET` nếu đã có
7. Bấm **Apply**.
8. Render build Docker image và khởi động Gunicorn. Khi health check `/api/v1/health/` trả 200, service Live.

---

## 6. Lấy Outbound IP của Render để cấu hình Database Allowlist

> [!IMPORTANT]
> Outbound IP của Render service chỉ có được **sau khi tạo service**. Không có danh sách tĩnh tra trước. Nguồn: https://render.com/docs/outbound-ip-addresses

**Sau khi tạo service:**
1. Vào Render Dashboard → trang service `family-bridge-backend`.
2. Bấm nút **Connect** (góc trên phải) → chọn tab **Outbound**.
3. Sao chép danh sách CIDR ranges.
4. Vào database provider dashboard → thêm các CIDR này vào IP allowlist.

**Khi chạy migration từ máy Huy:**
- Thêm IP công khai của máy Huy (`curl ifconfig.me`) vào allowlist tạm thời.
- Sau khi migration xong, **thu hồi** IP máy Huy khỏi allowlist (chỉ giữ CIDR của Render).

> [!CAUTION]
> Không cấu hình allowlist `0.0.0.0/0` (toàn bộ internet) như cách khắc phục mặc định. Chỉ thêm CIDR cần thiết và thu hồi khi xong.

---

## 7. Kiểm tra sau Deploy

```bash
# 1. Health check (liveness — không kết nối DB)
curl -i https://family-bridge-backend.onrender.com/api/v1/health/
# Kết quả mong đợi: HTTP/2 200, {"status":"ok"}

# 2. Readiness check (xác nhận kết nối MySQL thành công)
curl -i https://family-bridge-backend.onrender.com/api/v1/ready/
# Kết quả mong đợi: HTTP/2 200, {"status":"ok"}
```

Sau khi cả 2 endpoint trả 200, frontend có thể kết nối:
```powershell
$env:VITE_API_BASE_URL = "https://family-bridge-backend.onrender.com"
cd zalo-mini-app
npm start
# Mở http://localhost:3000/#/connection-check để xác nhận kết nối
```

---

## 8. Phân biệt các tầng kiểm chứng

| Tầng | Trạng thái | Ghi chú |
|------|-----------|---------|
| YAML parse (`render.yaml`) | ✅ Đạt | Parse bằng Python yaml |
| Django system check (development) | ✅ Đạt | 0 issues |
| Django system check (production/--deploy) | ✅ Đạt | Chỉ W005/W021 HSTS expected |
| Backend unit tests | ✅ 40/40 PASS | Chạy trên SQLite local |
| Frontend unit tests | ✅ 104/104 PASS | Bao gồm SEC-19 secret scan |
| Feature Lab tests | ✅ 333 PASS, 2 skipped | **Chạy trên SQLite local**, không phải MySQL |
| Docker build | ❌ Chưa kiểm chứng | Docker không có trên máy Windows này |
| Kết nối MySQL từ xa | ❌ Chưa kiểm chứng | Chưa có MySQL từ xa |
| Migration trên MySQL từ xa | ❌ Chưa kiểm chứng | Phụ thuộc MySQL từ xa |

---

## 9. Thứ tự thực hiện tổng thể

```
1. Huy chọn và tạo MySQL từ xa
2. Huy lấy outbound CIDR của Render service (sau khi tạo service trên Render)
3. Huy thêm CIDR Render + IP máy Huy vào MySQL allowlist
4. Huy chạy migration từ máy (theo mục 4)
5. Huy thu hồi IP máy khỏi MySQL allowlist
6. Huy bấm Deploy Blueprint trên Render (theo mục 5)
7. Kiểm tra /health/ và /ready/ (theo mục 7)
8. Cấu hình frontend kết nối backend Render
9. Xác minh origin Zalo Mini App WebView → thêm vào CORS_ALLOWED_ORIGINS
```

---

## 10. Rollback

- **Rollback code**: Render Dashboard → service → tab **Deploys** → bản deploy thành công gần nhất → **Rollback to this deploy**.
- **Lưu ý**: Rollback code không tự động revert migration đã chạy trên MySQL. Không xóa database hay rollback migration nếu chưa có kế hoạch backup.