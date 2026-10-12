# Setup backend Family Bridge (máy dev local)

Hướng dẫn cài đặt và kiểm tra cục bộ cho **nền tảng backend** (US-003). Tài liệu
này mô tả máy dev; hướng dẫn deploy production lên Render bằng Blueprint xem
`docs/handover/blueprint-deployment-guide.md`.

> Quy ước quan trọng: **SQLite chỉ dùng để kiểm tra nền tảng local**. Production
> dùng MySQL. Kết quả chạy SQLite không được ghi nhận là bằng chứng MySQL hay
> thiết bị (theo AGENTS.md).

## 1. Yêu cầu

- Python **3.12** (đã thử với 3.12.15) và `python3 -m venv` hoạt động
- `pip` có mạng tới PyPI
- MySQL 8.x **chỉ cần khi muốn chạy MySQL local**; không bắt buộc để kiểm tra nền tảng
- Không cần quyền root

## 2. Tạo môi trường ảo và cài dependency

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` (pin cứng) gồm: Django 5.2.18, djangorestframework 3.16.1,
django-cors-headers 4.9.0, djangorestframework-simplejwt 5.5.1, gunicorn 23.0.0,
python-dotenv 1.2.4.

`requirements-mysql.txt` = `requirements.txt` + `mysqlclient 2.2.8`. Chỉ cài gói
này khi máy có sẵn thư viện hệ thống của MySQL client (xem mục 7).

## 3. Biến môi trường

Sao chép `backend/.env.example` thành `backend/.env` rồi điền, hoặc xuất thẳng
biến môi trường. `DJANGO_ENV` nhận `development` / `test` / `production`;
`production` bắt buộc `DJANGO_SECRET_KEY` ≥50 ký tự random và **từ chối SQLite**
(`DB_ENGINE=sqlite` chỉ có hiệu lực khi `DJANGO_ENV != production`).

Kiểm tra nền tảng local (không cần MySQL):

```bash
export DJANGO_ENV=development
export DB_ENGINE=sqlite
```

## 4. Chạy migrate, check, test (SQLite local)

```bash
python manage.py check                             # cấu hình phải sạch
python manage.py makemigrations --check --dry-run  # không được có drift migration
python manage.py migrate                           # tạo db.sqlite3 cục bộ
python manage.py test                              # chạy test suite của nhánh
python manage.py runserver                         # http://127.0.0.1:8000/
```

Kiểm tra thủ công hai endpoint nền tảng:

```bash
curl -i http://127.0.0.1:8000/api/v1/health/
curl -i http://127.0.0.1:8000/api/v1/ready/
```

Kỳ vọng: `200 {"status":"ok"}` và header `Cache-Control: no-store`; `/ready/`
trả `503 {"status":"unavailable"}` khi DB lỗi, không lộ tên DB/password/stack trace.

Chạy gunicorn cục bộ (giống startCommand trên Render, không kèm migrate):

```bash
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 60
```

## 5. MySQL local (tùy chọn, cho mô phỏng gần production hơn)

Với MySQL 8.x đang chạy local, tạo DB và user **ít quyền** (không dùng root cho
runtime — SEC-20):

```sql
CREATE DATABASE family_bridge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'family_bridge'@'localhost' IDENTIFIED BY 'ĐỔI_PASSWORD_NÀY';
GRANT ALL PRIVILEGES ON family_bridge.* TO 'family_bridge'@'localhost';
FLUSH PRIVILEGES;
```

Chuyển sang MySQL local:

```bash
export DJANGO_ENV=development
export DB_ENGINE=mysql
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_DATABASE=family_bridge
export MYSQL_USER=family_bridge
export MYSQL_PASSWORD='ĐỔI_PASSWORD_NÀY'
python manage.py migrate
```

Nếu MySQL provider/host yêu cầu TLS, đặt `MYSQL_SSL_CA=/đường/dẫn/ca.pem`;
settings sẽ bật `ssl_mode=VERIFY_IDENTITY`.

## 6. Superuser và lưu ý admin

Không có admin site trong scaffold (thiết kế theo SEC-27: production tối thiểu,
không bật admin/debug). Vẫn có thể tạo user bằng shell khi cần thử `accounts.User`:

```bash
python manage.py createsuperuser
```

Lệnh trên chỉ tạo bản ghi trong `accounts_user`; nó **không** mở admin UI và
không cấp quyền đọc dữ liệu riêng tư. Đừng dùng superuser/is_staff để suy diễn
quyền nghiệp vụ (quyền admin thật thuộc US sau, theo DEC-05 và scope doc).

## 7. Troubleshooting

- **`mysqlclient` build lỗi khi `pip install -r requirements-mysql.txt`**: gói cần
  header/thư viện client của MySQL. Trên Debian/Ubuntu cần quyền sudo để cài phần
  hệ thống (máy không có sudo thì dùng SQLite local hoặc Docker):
  `sudo apt-get install build-essential pkg-config default-libmysqlclient-dev`
  rồi cài lại. Lỗi `pkg-config not found` / `mysql_config not found` đều cùng
  nguyên nhân trên. `Dockerfile` tại repository root đã cài sẵn các gói này.
- **`ImproperlyConfigured: DJANGO_SECRET_KEY is required`**: đang chạy
  `DJANGO_ENV=production` thiếu secret. Local hãy dùng `development`/`test`.
- **`Production requires MySQL; SQLite is only for local checks`**: đang đặt
  `DB_ENGINE=sqlite` kèm `DJANGO_ENV=production` — không được phép, đổi env.
- **`Use a random DJANGO_SECRET_KEY...`**: secret production dưới 50 ký tự.
- **`ImproperlyConfigured: DJANGO_ENV must be...`**: giá trị `DJANGO_ENV` ngoài
  ba mức cho phép.

## 8. Kiểm tra production config cục bộ (không deploy)

```bash
DJANGO_ENV=production \
DJANGO_SECRET_KEY='<chuỗi random ≥50 ký tự chỉ để thử>' \
DJANGO_ALLOWED_HOSTS='api.example.com' \
DB_ENGINE=mysql MYSQL_DATABASE=family_bridge MYSQL_USER=family_bridge \
MYSQL_PASSWORD='<password giả>' CORS_ALLOWED_ORIGINS='https://example.zdn.vn' \
python manage.py check --deploy
```

Lệnh này chỉ in warning/kết quả check, không kết nối MySQL và không deploy.
Không dùng secret thật trong bước thử.
