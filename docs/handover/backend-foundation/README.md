# Bàn giao nền tảng backend — US-003 (backend foundation)

Nhánh: `feat/us-003-backend-foundation` (từ main c2c285a, port có chọn lọc từ
scaffold `feat/us-003-kt01`/PR #1 sau review).

## Mục đích đợt US-003

Đưa lên một **nền tảng Django/DRF đã kiểm tra cục bộ**: scaffold cấu hình an toàn
(production từ chối secret yếu/thiếu, SQLite bị chặn khi production), model
`accounts.User` UUID, 2 endpoint nền tảng `/api/v1/health/` và `/api/v1/ready/`
đúng hợp đồng `docs/contracts/api-foundation.md`, envelope lỗi DRF
`{"error":{"code","details"}}`, JWT + `IsAuthenticated` mặc định, throttle mặc
định (SEC-14), CI 3 job (SQLite/MySQL/guard production) và cấu hình Render
**chuẩn bị** cho đội Antigravity.

## Nhãn kết quả — đọc kỹ trước khi trích dẫn

Kết quả đúng của đợt này là: **"backend foundation đã kiểm tra cục bộ"**
(check/migrate/endpoint/test chạy trên SQLite local; MySQL qua job CI).

KHÔNG được ghi nhãn nào trong các nhóm sau cho đợt này:

- ❌ "US-003 Done" / "US-003 hoàn thành"
- ❌ "đăng nhập Zalo hoàn thành" (US-011 chưa triển khai)
- ❌ "Zalo đã duyệt" / "đã thử trên thiết bị Zalo Android/iOS"
- ❌ "MySQL trên thiết bị/deployment thật đã nghiệm thu"

SQLite chỉ là foundation check. Bằng chứng MySQL nằm ở job CI
`.github/workflows/backend-foundation.yml` và deployment thật của Antigravity.

## Danh sách thư mục bàn giao

| Thư mục / file | Nội dung |
| --- | --- |
| `backend/` | Scaffold Django/DRF: `config/` (settings, urls, wsgi, asgi), `accounts/` (User UUID + migration 0001), `core/` (health, readiness, exception handler), `manage.py`, `requirements*.txt`, `.env.example`, `Dockerfile`, `.dockerignore`, README |
| `docs/setup/backend/` | Hướng dẫn cài đặt dev (venv, SQLite local, MySQL local, troubleshooting) |
| `docs/handover/backend-foundation/` | Bộ tài liệu bàn giao này |
| `.github/workflows/backend-foundation.yml` | CI nền tảng: sqlite-checks, mysql-checks, production-guard |
| `render.yaml` | Cấu hình Render chuẩn bị cho Antigravity (KHÔNG deploy trong đợt này) |

## Các file còn lại của bộ bàn giao

- `zalo-policy-security-report.md` — (đang tạo bởi Agent 2-a)
- `platform-endpoints.md` — đặc tả endpoint nền tảng + cấu hình network Antigravity
- `antigravity-checklist.md` — checklist tích hợp/deploy cho Antigravity
- `verification-report.md` — (đang tạo bởi Agent 2-c)

## Đề xuất cho các đợt sau (không tạo dependency mới trong đợt này)

- US-004 cần chốt baseline validation catalog (DEC-17) rồi Siết lại throttle rate
  theo từng endpoint thay cho mức mặc định nền tảng `anon 60/min, user 120/min`.
- Cân nhắc bổ sung gói kiểm thử phụ trợ (ví dụ coverage) **chỉ khi** US-004 chốt
  nhu cầu; hiện requirements giữ tối thiểu đúng pin kt01.
