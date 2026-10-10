# Family Bridge

Ứng dụng Zalo Mini App giúp học sinh THPT và cha mẹ hoặc người chăm sóc giao tiếp, bày tỏ cảm xúc và lựa chọn hoạt động kết nối tự nguyện trong 4 tuần.

## Trạng thái

Bản nền tảng có backend Django REST Framework, API kiểm tra dịch vụ/cơ sở dữ liệu và màn hình Mini App gọi API. **15 tính năng nghiệp vụ chưa được triển khai.** Đăng nhập Zalo, ghép nối, AI và hộp thư chưa hoạt động. Chưa triển khai Render hoặc phát hành Zalo; chưa kiểm thử trên điện thoại thật.

## Công nghệ và phạm vi

| Thành phần | Lựa chọn |
| --- | --- |
| Backend | Python 3.12, Django 5.2 LTS, Django REST Framework |
| Cơ sở dữ liệu triển khai | MySQL 8, InnoDB, utf8mb4 |
| Frontend chính thức | React JavaScript, CSS/SCSS, Vite, zmp-sdk, zmp-ui |
| Hosting backend | Render Web Service; MySQL chạy riêng |
| Hosting frontend | Zalo Mini App Platform |
| API dùng chung | REST JSON phiên bản `/api/v1/`, bearer token |

`web/` và `mobile/` là thư mục trống từ khởi tạo trước, không thuộc phạm vi phát triển hiện tại. Backend được thiết kế để frontend khác dùng lại về sau. Kiểm thử nghiệm thu hiện tại tập trung Zalo Mini App.

## Chạy nhanh trên máy phát triển

Backend, từ thư mục gốc repo:

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# Bash: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

Sao chép `backend/.env.example` thành `backend/.env`, điền cấu hình MySQL rồi cài `backend/requirements-mysql.txt`. Để chỉ kiểm tra khung bằng SQLite tại máy cá nhân, đặt `DJANGO_ENV=development` và `DB_ENGINE=sqlite` trong file `.env`; SQLite không được dùng khi triển khai.

```bash
python backend/manage.py migrate
python backend/manage.py runserver
```

Mini App, ở terminal khác:

```bash
cd zalo-mini-app
npm ci
# Sao chép .env.example thành .env và đặt VITE_API_BASE_URL
npm run start
```

`npm run start` chạy Vite để xem trước; để chạy trong môi trường Zalo dùng Extension/Studio hoặc CLI theo [hướng dẫn](docs/development.md). Không coi preview trình duyệt là kiểm thử đăng nhập Zalo.

## Tài liệu cho lập trình

- [15 tính năng và phạm vi mới nhất](docs/project-scope.md)
- [Đánh giá Trello và các điểm cần sửa](docs/project/trello-audit.md)
- [Bản chụp 52 US và phụ thuộc](docs/project/backlog-snapshot.json)
- [Kiến trúc kỹ thuật](docs/architecture.md)
- [Hợp đồng nền tảng và quy tắc API](docs/contracts/api-foundation.md)
- [Cài đặt, kiểm tra và triển khai](docs/development.md)

Repo hiện là **public** theo GitHub tại thời điểm kiểm tra 10/10/2026. Chỉ commit dữ liệu mẫu không nhận diện, không commit token, tâm sự thật, dữ liệu khảo sát thật hoặc file `.env`.
