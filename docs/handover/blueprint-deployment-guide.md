# Hướng Dẫn Triển Khai Backend Family Bridge Lên Render Bằng Blueprint

Tài liệu này cung cấp hướng dẫn đầy đủ, chi tiết và chuẩn hóa theo đặc tả [Render Blueprint](https://render.com/docs/blueprint-spec) để triển khai dịch vụ backend **Family Bridge** (`family-bridge-backend`) từ repository [huyhandsome6996/family-bridge](https://github.com/huyhandsome6996/family-bridge) trên nhánh `main`.

---

## 1. Quyết định kiến trúc & Cấu hình Blueprint

### 1.1. Lý do lựa chọn Docker Runtime trên Render
* **Ràng buộc mã nguồn:** Backend sử dụng `mysqlclient==2.2.8`. Trên nền tảng Linux, package này chỉ được phân phối dưới dạng source distribution (`.tar.gz`), không có pre-built binary wheel trên PyPI. Quá trình cài đặt bắt buộc phải biên dịch C và yêu cầu các thư viện hệ thống `default-libmysqlclient-dev` và `pkg-config`.
* **Ràng buộc Render Native Runtime:** Render Native Python Runtime chạy trong môi trường unprivileged (không có quyền root/sudo), không thể chạy `apt-get` trong lệnh build (sẽ gặp lỗi `Permission denied`). Đồng thời, bộ công cụ mặc định của Render Native Runtime chỉ có `postgresql-client`, không có các thư viện phát triển MySQL C.
* **Giải pháp chuẩn hóa:** Sử dụng **Docker Runtime (`runtime: docker`)** với `Dockerfile` tại repository root (`dockerContext: .`). Điều này đảm bảo:
  1. Biên dịch và import `mysqlclient` ổn định 100% nhờ các gói hệ thống được cài đặt trong image build.
  2. Build context bao gồm toàn bộ repository root, sao chép cả `backend/` và `packages/` (nạp đủ 15 feature modules).
  3. Hoạt động trên **Render Free Plan** (`plan: free`) mà không phát sinh chi phí bắt buộc.
  4. Giữ nguyên 100% stack kỹ thuật (`Django 5.2.18`, `DRF 3.17.2`, `mysqlclient 2.2.8`), không phải thay thế bằng `PyMySQL` hay viết lại driver.

### 1.2. Cấu hình dịch vụ trong `render.yaml`
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
    preDeployCommand: python backend/manage.py migrate --noinput
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
      - key: MYSQL_DATABASE
        sync: false
      - key: MYSQL_USER
        sync: false
      - key: MYSQL_PASSWORD
        sync: false
      - key: MYSQL_HOST
        sync: false
      - key: MYSQL_PORT
        sync: false
      - key: MYSQL_SSL_CA
        sync: false
      - key: ZALO_APP_ID
        sync: false
      - key: ZALO_APP_SECRET
        sync: false
      - key: FB_FEATURES
        sync: false
```

* **`autoDeployTrigger: 'off'`**: Tắt tính năng tự động deploy sau mỗi lần push code (theo chuẩn Render mới nhất, thay thế `autoDeploy: false`).
* **`preDeployCommand: python backend/manage.py migrate --noinput`**: Chạy database migration một lần duy nhất trong quá trình deploy trước khi container live nhận traffic. Nếu kết nối database thất bại, quá trình deploy sẽ dừng lại một cách an toàn mà không làm gián đoạn hệ thống.
* **`healthCheckPath: /api/v1/health/`**: Endpoint kiểm tra liveness độc lập, không truy vấn database và được miễn trừ rate limit throttling, giúp Render giám sát trạng thái container ổn định.

---

## 2. Bảng biến môi trường đầy đủ (Environment Variables)

| Tên biến | Bắt buộc khi nào | Định dạng / Ví dụ | Nơi lấy giá trị | Cách nhập trên Render Dashboard |
| :--- | :--- | :--- | :--- | :--- |
| **Nhóm A: Khởi động Backend** | | | | |
| `DJANGO_ENV` | **Bắt buộc** | `production` | Cố định cho môi trường triển khai | Đã đặt sẵn trong `render.yaml` |
| `DJANGO_SECRET_KEY` | **Bắt buộc** | Chuỗi ngẫu nhiên ≥ 50 ký tự | Tự động sinh | `generateValue: true` (Render tự sinh chuỗi 128 ký tự base64 an toàn) |
| `DJANGO_ALLOWED_HOSTS` | **Bắt buộc** | Hostname phân tách dấu phẩy (vd: `family-bridge-backend.onrender.com`) | Hostname do Render cấp cho dịch vụ | Nhập trong màn hình Environment lúc tạo Blueprint |
| `CORS_ALLOWED_ORIGINS` | **Bắt buộc** | URL origin đầy đủ (vd: `https://zalo.me,http://localhost:3000`) | Origin của client frontend Zalo Mini App / web | Nhập trong màn hình Environment lúc tạo Blueprint |
| **Nhóm B: Kết nối Database** | | | | |
| `DB_ENGINE` | **Bắt buộc** | `mysql` | Cố định cho backend MySQL | Đã đặt sẵn trong `render.yaml` |
| `MYSQL_HOST` | **Bắt buộc** | Địa chỉ IP hoặc FQDN (vd: `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`) | Từ nhà cung cấp MySQL từ xa | Nhập trong màn hình Environment lúc tạo Blueprint |
| `MYSQL_PORT` | **Bắt buộc** | Số nguyên (vd: `3306` hoặc `4000`) | Từ nhà cung cấp MySQL từ xa | Nhập trong màn hình Environment lúc tạo Blueprint |
| `MYSQL_DATABASE` | **Bắt buộc** | Tên database (vd: `family_bridge`) | Từ nhà cung cấp MySQL từ xa | Nhập trong màn hình Environment lúc tạo Blueprint |
| `MYSQL_USER` | **Bắt buộc** | Tên tài khoản runtime (vd: `family_bridge_user`) | Tạo trên MySQL, cấp quyền vừa đủ (SEC-20) | Nhập trong màn hình Environment lúc tạo Blueprint |
| `MYSQL_PASSWORD` | **Bắt buộc** | Mật khẩu tài khoản database | Tạo trên MySQL | Nhập trong màn hình Environment lúc tạo Blueprint |
| `MYSQL_SSL_CA` | Tùy chọn (khi TLS yêu cầu CA) | Đường dẫn file (vd: `/etc/secrets/ca.pem`) | Tải file chứng thư CA từ nhà cung cấp | Tạo qua Secret File trên Render (xem mục 3.2) |
| **Nhóm C: Xác thực Zalo** | | | | |
| `ZALO_APP_ID` | Bắt buộc khi dùng auth Zalo | Chuỗi số (vd: `3411096375330044972`) | Zalo Developers Console | Nhập trong màn hình Environment lúc tạo Blueprint |
| `ZALO_APP_SECRET` | Bắt buộc khi dùng auth Zalo | Chuỗi bí mật | Zalo Developers Console | Nhập trong màn hình Environment lúc tạo Blueprint |
| **Nhóm D: Tùy chọn bổ sung** | | | | |
| `FB_FEATURES` | Tùy chọn | Danh sách nhãn tính năng phân tách dấu phẩy | Mặc định nạp đủ 16 app labels | Để trống (hoặc điền khi cần thu hẹp tính năng) |
| `DJANGO_LOG_LEVEL` | Tùy chọn | `INFO`, `WARNING`, `ERROR` | Mặc định `INFO` | Có thể bỏ qua |

---

## 3. Điều kiện cần chuẩn bị: Cơ sở dữ liệu MySQL từ xa

> [!WARNING]
> MySQL chạy tại `localhost:3306` trên máy tính cá nhân **không thể truy cập được từ Render**. Render không cung cấp MySQL miễn phí trên Dashboard. Do đó, bạn cần chuẩn bị một cơ sở dữ liệu MySQL từ xa trước khi bấm Deploy.

### 3.1. Các phương án Database MySQL khả dụng
1. **Phương án 1: TiDB Serverless (Khuyên dùng - Miễn phí trọn đời)**
   * **Chi phí:** Hoàn toàn miễn phí (5 GB lưu trữ, 50 triệu request/tháng).
   * **Trang chủ:** [https://tidbcloud.com](https://tidbcloud.com)
   * **Cách lấy thông tin:**
     - Đăng ký tài khoản và chọn tạo **Serverless Cluster** (chọn Region `Singapore` hoặc `Tokyo` để tối ưu tốc độ).
     - Vào Cluster -> Bấm **Connect** -> Chọn ngôn ngữ **General** hoặc **Python**.
     - Ghi lại: `Host`, `Port` (thường là `4000`), `User`, `Password`, và tải file CA certificate (nếu có).
2. **Phương án 2: Aiven for MySQL**
   * **Trang chủ:** [https://aiven.io/mysql](https://aiven.io/mysql)
   * **Đặc điểm:** MySQL 8.0 chuẩn, hỗ trợ gói dùng thử miễn phí, bắt buộc chứng thư TLS CA.
3. **Phương án 3: Render Private Service với Docker MySQL**
   * **Chi phí:** Yêu cầu gói trả phí của Render (tối thiểu $7/tháng cho dịch vụ Private Service + $0.25/GB/tháng cho Persistent Disk). Hướng dẫn chính thức tại [Render MySQL Guide](https://render.com/docs/deploy-mysql).

### 3.2. Cấu hình chứng thư TLS CA (`MYSQL_SSL_CA`) trên Render
Khi nhà cung cấp MySQL (như TiDB hoặc Aiven) yêu cầu chứng thực TLS:
1. Tải file chứng thư `ca.pem` từ nhà cung cấp về máy tính.
2. Trên Render Dashboard, tại trang cấu hình dịch vụ, chọn mục **Environment** -> cuộn xuống phần **Secret Files**.
3. Bấm **Add Secret File**:
   * **Filename:** `ca.pem`
   * **Contents:** Mở file `ca.pem` bằng Notepad/text editor, sao chép toàn bộ nội dung (bắt đầu bằng `-----BEGIN CERTIFICATE-----`) và dán vào ô nội dung.
4. Render sẽ mount file này vào đường dẫn `/etc/secrets/ca.pem` bên trong container.
5. Đặt biến môi trường:
   `MYSQL_SSL_CA = /etc/secrets/ca.pem`
*(Lưu ý: `MYSQL_SSL_CA` phải là đường dẫn file trong container, không được dán trực tiếp nội dung chuỗi chứng thư).*

---

## 4. Các bước thao tác trên Render Dashboard

1. Truy cập [Render Dashboard](https://dashboard.render.com).
2. Bấm nút **New +** ở góc trên cùng bên phải và chọn **Blueprint**.
3. Kết nối tài khoản GitHub và chọn repository: `huyhandsome6996/family-bridge`.
4. Điền cấu hình cơ bản:
   * **Branch:** `main`
   * **Blueprint Path:** `render.yaml`
5. Render sẽ đọc file `render.yaml` và liệt kê tài nguyên:
   * Service Name: `family-bridge-backend`
   * Type: Web Service
   * Environment: Docker
   * Plan: Free
   * Region: Singapore
6. Điền các giá trị cho các biến môi trường được đánh dấu `sync: false`:
   * `DJANGO_ALLOWED_HOSTS`: Tạm thời điền hostname dự kiến (ví dụ: `family-bridge-backend.onrender.com`).
   * `CORS_ALLOWED_ORIGINS`: Điền `https://zalo.me,http://localhost:3000,http://127.0.0.1:3000`.
   * Điền `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`.
   * Nếu có Secret File CA: Tải file `ca.pem` lên và điền `MYSQL_SSL_CA = /etc/secrets/ca.pem`.
   * Điền `ZALO_APP_ID`, `ZALO_APP_SECRET` (nếu đã có).
7. Bấm **Apply** / **Deploy Blueprint**.
8. Render sẽ tiến hành build Docker image và chạy tự động `preDeployCommand: python backend/manage.py migrate --noinput` trước khi bật service.

---

## 5. Kiểm tra và kết nối sau khi Deploy

### 5.1. Lấy URL HTTPS và cập nhật ALLOWED_HOSTS
1. Sau khi deploy thành công, Render sẽ hiển thị URL chính thức của Web Service ở đầu trang (ví dụ: `https://family-bridge-backend-xxxx.onrender.com`).
2. Trích xuất hostname (bỏ phần `https://` và dấu `/` ở cuối), ví dụ: `family-bridge-backend-xxxx.onrender.com`.
3. Kiểm tra biến `DJANGO_ALLOWED_HOSTS` trong tab **Environment**: nếu chưa khớp với hostname chính thức, hãy sửa lại cho đúng và bấm **Save Changes** (Render sẽ tự khởi động lại dịch vụ với cấu hình mới).

### 5.2. Kiểm tra Health Check và Readiness Check
Mở terminal hoặc trình duyệt để kiểm tra 2 endpoint probe của backend:

```bash
# 1. Kiểm tra Liveness (phải trả về 200 OK ngay cả khi DB chưa sẵn sàng)
curl -i https://family-bridge-backend-xxxx.onrender.com/api/v1/health/

# Kết quả kỳ vọng:
# HTTP/2 200
# cache-control: no-store
# {"status":"ok"}

# 2. Kiểm tra Readiness (xác nhận kết nối Database MySQL thành công)
curl -i https://family-bridge-backend-xxxx.onrender.com/api/v1/ready/

# Kết quả kỳ vọng:
# HTTP/2 200
# cache-control: no-store
# {"status":"ok"}
```

### 5.3. Cấu hình Frontend Mini App kết nối tới Backend mới
1. Mở terminal trên máy dev, đặt biến môi trường cho Vite trỏ về backend Render:
   ```powershell
   $env:VITE_API_BASE_URL = "https://family-bridge-backend-xxxx.onrender.com"
   cd zalo-mini-app
   npm start
   ```
2. Mở trình duyệt tại trang `http://localhost:3000/#/connection-check`:
   * Trang kiểm tra kết nối sẽ tự động gọi `/api/v1/health/` và `/api/v1/ready/` của backend trên Render.
   * Khi kết nối thành công, badge trạng thái màu xanh **"Đã kết nối tới máy chủ"** sẽ xuất hiện!

---

## 6. Xử lý sự cố thường gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **`preDeployCommand` báo lỗi kết nối MySQL** | Host/Port hoặc mật khẩu MySQL sai; hoặc MySQL chặn IP | Kiểm tra thông tin kết nối; trên database provider (vd TiDB Cloud), mở Allowlist IP cho phép `0.0.0.0/0` để Render có thể kết nối |
| **`/api/v1/ready/` trả về `503 Unavailable`** | Kết nối DB bị ngắt hoặc truy vấn kiểm tra `SELECT 1` thất bại | Xem log trên Render Dashboard (chỉ hiển thị tên exception, không lộ DSN); kiểm tra trạng thái cụm MySQL |
| **`400 Bad Request` khi gọi API** | Hostname của request không nằm trong `DJANGO_ALLOWED_HOSTS` | Vào Render Dashboard -> Environment -> bổ sung hostname thật vào `DJANGO_ALLOWED_HOSTS` |
| **Lỗi `CORS policy` trên trình duyệt** | Origin của frontend chưa được cấp phép | Bổ sung origin (vd `http://localhost:3000` hoặc domain webview) vào `CORS_ALLOWED_ORIGINS` |
| **Lần truy cập đầu tiên phản hồi chậm (~50s)** | Cơ chế "Spin down" của Render Free Plan sau 15 phút không có request | Đây là đặc tính bình thường của gói Free. Container sẽ thức dậy và phản hồi nhanh chóng ở các request tiếp theo |

---

## 7. Quy trình Rollback & Khôi phục
* **Rollback code:** Trong Render Dashboard -> Web Service -> tab **Deploys** -> tìm bản build thành công gần nhất -> bấm **Rollback to this deploy**.
* **Lưu ý dữ liệu:** Rollback phiên bản code không tự động hoàn tác (revert) các migration đã chạy trên database. Tuyệt đối không xóa database hay rollback migration nếu chưa có kế hoạch backup.
