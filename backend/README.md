# Family Bridge — Backend foundation (US-003)

API nền tảng Django/DRF cho Family Bridge: Zalo Mini App hỗ trợ giao tiếp học sinh
THPT ↔ cha mẹ/người chăm sóc. Nhánh này chỉ chứa **nền tảng** (khung API), chưa có
tính năng nghiệp vụ.

- Django 5.2.18 + djangorestframework 3.16.1 (pin trong `requirements.txt`)
- Xác thực: JWT bearer (`djangorestframework-simplejwt`), mặc định `IsAuthenticated`
- MySQL khi deploy (Render, do đội Antigravity triển khai); **SQLite chỉ dùng cho
  kiểm tra cục bộ của nền tảng**, không phải bằng chứng production
- Không có admin site — thiết kế cố ý theo SEC-27 (production tối thiểu)

## Endpoint nền tảng (hợp đồng cố định — không đổi payload/path)

| Method | Path | Quyền | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/health/` | Public | 200 `{"status":"ok"}`, `Cache-Control: no-store` |
| GET | `/api/v1/ready/` | Public | 200 `{"status":"ok"}` khi `SELECT 1` thành công; 503 `{"status":"unavailable"}` |

Lỗi DRF được chuẩn hóa về `{"error":{"code":"...","details":{...}}}`. Đặc tả chi tiết:
`docs/handover/backend-foundation/platform-endpoints.md`.

## Chạy local (SQLite, chỉ để kiểm tra nền tảng)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

DJANGO_ENV=development DB_ENGINE=sqlite python manage.py migrate
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py runserver
# curl http://127.0.0.1:8000/api/v1/health/
```

Yêu cầu Python 3.12. Cấu hình qua biến môi trường (xem `.env.example` — chỉ
placeholder, không chứa giá trị thật); có thể đặt trong file `backend/.env`.

## Lệnh kiểm tra thường dùng

```bash
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py check
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py makemigrations --check --dry-run
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py migrate
DJANGO_ENV=test DB_ENGINE=sqlite python manage.py test
```

Chạy gunicorn cục bộ (giống lệnh start trên Render, không migrate trong startCommand):

```bash
DJANGO_ENV=development DB_ENGINE=sqlite gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

## Biến môi trường (tên + ý nghĩa; giá trị thật do môi trường cung cấp)

| Tên | Ý nghĩa | Placeholder |
| --- | --- | --- |
| `DJANGO_ENV` | `development` \| `test` \| `production` | `development` |
| `DJANGO_SECRET_KEY` | Khóa ký session/token; production bắt buộc ≥50 ký tự random | (để trống) |
| `DJANGO_ALLOWED_HOSTS` | Host hợp lệ, phân tách bằng dấu phẩy | `localhost,127.0.0.1` |
| `DB_ENGINE` | `mysql` (mặc định) hoặc `sqlite` (chỉ local check, không dùng khi production) | `sqlite` |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | Thông tin DB runtime ít quyền | `family_bridge` / `family_bridge` / (để trống) |
| `MYSQL_HOST` / `MYSQL_PORT` | Địa chỉ MySQL provider | `127.0.0.1` / `3306` |
| `MYSQL_SSL_CA` | Đường dẫn CA cert khi MySQL provider yêu cầu TLS (VERIFY_IDENTITY) | (để trống) |
| `CORS_ALLOWED_ORIGINS` | Origin thật của Mini App, phân tách bằng dấu phẩy | `http://localhost:3000` |
| `DJANGO_LOG_LEVEL` | Mức log root (mặc định `INFO`) | `INFO` |

Không bao giờ commit `.env` thật, secret, PAT hay password (SEC-19).

## Giới hạn hiện tại (đừng hiểu nhầm là đã xong)

- **Chưa có đăng nhập Zalo** (US-011): không có endpoint phát token từ danh tính
  Zalo; không tin `zalo_id`/role do client khai.
- **Chưa có module nghiệp vụ**: hộp thư, thẻ cảm xúc, nhật ký, AI, khảo sát… chưa
  tồn tại; chỉ có `accounts.User` (UUID) và 2 endpoint nền tảng.
- SQLite chỉ dùng cho foundation check cục bộ; bằng chứng MySQL nằm ở CI
  (`.github/workflows/backend-foundation.yml`) và deployment thật của Antigravity.

Hướng dẫn cài đặt dev chi tiết (kể cả MySQL local): `docs/setup/backend/README.md`.
Tài liệu bàn giao nền tảng: `docs/handover/backend-foundation/README.md`.
