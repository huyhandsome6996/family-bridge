# Cài đặt và kiểm tra Family Bridge

## Backend trên máy cá nhân

Tạo môi trường Python 3.12 và cài `backend/requirements.txt`. Sao chép `backend/.env.example` thành `.env` và đặt DJANGO_ENV=development. Muốn dùng MySQL cài thêm `backend/requirements-mysql.txt`, tạo database utf8mb4 và điền MYSQL_*; tài khoản DB cần quyền migration tại môi trường phát triển.

Nếu chỉ kiểm tra nền tảng không có MySQL, đặt DB_ENGINE=sqlite; chỉ dùng cho máy cá nhân và test.

```bash
python backend/manage.py migrate
python backend/manage.py runserver
```

Kiểm tra `http://127.0.0.1:8000/api/v1/ready/`. Các endpoint login, AI, tin nhắn chưa tồn tại. Không nhập dữ liệu người tham gia thật vào bản nền tảng.

## Frontend

Node 22.12 trở lên được yêu cầu; Node 22 LTS được dùng trong CI; bản kiểm tra tại đây chạy Node 24. Sao chép `zalo-mini-app/.env.example` thành `.env`. APP_ID là cấu hình công khai; VITE_API_BASE_URL là origin backend, không chứa `/api/v1` hoặc key bí mật.

```bash
cd zalo-mini-app
npm ci
npm run start
npm test
npm run build
```

`npm run start` chỉ xem trước bằng Vite. CLI Zalo cài riêng theo công cụ chính thức (`npm install -g zmp-cli`), hoặc dùng Zalo Extension/Studio. Sau khi cấu hình App ID và đăng nhập tài khoản quản trị, chạy `zmp deploy --existing` để tải bản build hiện có theo hướng dẫn CLI. Thao tác này chưa được thực hiện trong PR nền tảng.

Mở bản development/testing trên Zalo bằng QR/link mà công cụ tạo. Quyền truy cập tester và điều kiện nền tảng kiểm tra tại trang quản lý Mini App lúc triển khai; không tự cam kết số lượng tester. Với điện thoại thật phải dùng backend HTTPS có thể truy cập từ internet. Simulator/browser không xác minh được các flow Zalo cần tài khoản thật.

## Kiểm tra backend

Bash, tại thư mục gốc:

```bash
DJANGO_ENV=test DB_ENGINE=sqlite python backend/manage.py check
DJANGO_ENV=test DB_ENGINE=sqlite python backend/manage.py makemigrations --check --dry-run
DJANGO_ENV=test DB_ENGINE=sqlite python backend/manage.py test core
```

PowerShell đặt `$env:DJANGO_ENV="test"` và `$env:DB_ENGINE="sqlite"` trước ba lệnh Python. Nếu có `.env` thì biến môi trường ưu tiên hơn `.env`.

CI cấu hình test nền tảng SQLite, migration/test MySQL 8.4 và build/test client. Job MySQL cần chạy và được xác minh trên GitHub; chưa kiểm tra các tính năng nghiệp vụ MySQL hoặc SDK trên điện thoại. Cần kiểm tra MySQL trước nghiệm thu: migration, Unicode/emoji, transaction ghép nối, idempotency khi concurrent request, backup/restore và quyền truy cập.

## Chuẩn bị Render

1. Cấp MySQL durable trước (dịch vụ riêng hoặc private Docker service và disk trên Render). Dùng TLS theo CA nếu DB ngoài Render.
2. Review `render.yaml` và chi phí. Blueprint dùng dịch vụ paid để tránh cold start lúc thử nghiệm; chưa tạo dịch vụ.
3. Điền DJANGO_ALLOWED_HOSTS (hostname, không có scheme), CORS_ALLOWED_ORIGINS (origin với HTTPS), MYSQL_* và CA nếu cần. Đặt DJANGO_ENV=production.
4. Build Docker và chạy migration trước Gunicorn. Blueprint generateValue tạo SECRET_KEY ngẫu nhiên; giữ cố định khi redeploy, không commit giá trị thật. Nếu giá trị không đủ 50 ký tự, dùng secret mới đủ dài qua Dashboard.
5. Kiểm tra health/ready HTTPS, migration, CORS OPTIONS từ Mini App, mất kết nối, khôi phục DB; đặt frontend VITE_API_BASE_URL rồi build/deploy lại Mini App.
6. Render Free tắt sau 15 phút không có traffic và khởi động lại khoảng một phút; chỉ phù hợp demo kỹ thuật nhỏ. Không lưu SQLite hoặc file nghiệp vụ trên filesystem web service.

Không tự tạo tài nguyên trả phí, không tự phát hành Mini App hoặc đánh dấu Trello hoàn thành từ build local. Cần bằng chứng Zalo thật để nghiệm thu US-003.
