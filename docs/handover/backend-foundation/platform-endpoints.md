# Đặc tả endpoint nền tảng (US-003 backend foundation)

Tài liệu này mô tả đúng những gì có trên nhánh `feat/us-003-backend-foundation`.
Hợp đồng gốc: `docs/contracts/api-foundation.md` — **giữ nguyên payload/path,
không thêm endpoint demo**.

## Ranh giới bằng chứng

Các endpoint dưới đây **KHÔNG** chứng minh:

- migration/schema đã chạy trên MySQL hay thiết bị thật (chỉ chứng minh
  khả năng truy vấn DB ở nơi chúng chạy);
- permission nghiệp vụ, ACL, grant hay bất kỳ tính năng nào của 15 nhóm tính năng.

Chúng chỉ chứng minh: process trả lời (health) và DB reachability (ready).

## GET /api/v1/health/

| Thuộc tính | Giá trị |
| --- | --- |
| Quyền | Public (`AllowAny`, không authentication) |
| Throttle | Miễn (`@throttle_classes([])`) — monitoring không bao giờ bị rate-limit |
| DB | Không chạm database |
| 200 | `{"status":"ok"}` |
| Header | `Cache-Control: no-store` |

Ý nghĩa: liveness — chỉ chứng minh process đang trả lời. **Không** nghĩa là đăng
nhập hay tính năng nghiệp vụ hoạt động.

## GET /api/v1/ready/

| Thuộc tính | Giá trị |
| --- | --- |
| Quyền | Public (`AllowAny`, không authentication) |
| Throttle | Miễn (`@throttle_classes([])`) |
| DB | `SELECT 1` qua connection mặc định |
| 200 | `{"status":"ok"}` khi `SELECT 1` thành công |
| 503 | `{"status":"unavailable"}` khi DB lỗi |
| Header | `Cache-Control: no-store` (cả 200 và 503) |

Không leak: response và log **không** chứa tên DB, password, host/DSN hay stack
trace. View chỉ log tên class của ngoại lệ (`logger.warning("Readiness check
failed: %s", type(exc).__name__)`), không log message.

## Quy ước khung cho mọi API sau này

1. **Envelope lỗi DRF**: mọi lỗi do DRF xử lý trả
   `{"error":{"code":"...","details":{...}}}` (handler `core.exceptions.api_exception_handler`),
   kèm `Cache-Control: no-store`. Không trả stack trace cho client (SEC-27).
2. **Mặc định đóng (default-deny)**: `DEFAULT_PERMISSION_CLASSES =
   IsAuthenticated`; `DEFAULT_AUTHENTICATION_CLASSES` dùng JWT bearer của Family
   Bridge (`djangorestframework-simplejwt`, access token 15 phút). Mọi APIView
   tương lai kế thừa mặc định này; từng API vẫn phải thêm quyền theo đối tượng
   (SEC-03). Không dùng cookie xác thực Mini App.
3. **Throttle mặc định (SEC-14)**: `AnonRateThrottle 60/min`,
   `UserRateThrottle 120/min` — mức nền tảng pending US-004 baseline catalog
   (DEC-17). Health/ready được miễn để monitoring không bị chặn.
4. **Phân trang**: DRF `PageNumberPagination`, `PAGE_SIZE = 20` (envelope `count`,
   `next`, `previous`, `results`). Hiện **chưa có list nghiệp vụ** nào; với
   inbox/mood/journal, US-004 phải chốt cursor envelope trước khi triển khai.
5. **Định danh**: UUID cho user/đối tượng nội bộ (`accounts.User.id` là UUID);
   Zalo ID giữ kiểu **string**, không ép số.
6. **Giờ**: UTC lưu trữ (`USE_TZ = True`), hiển thị múi giờ `Asia/Ho_Chi_Minh`.

## Cấu hình network cần Antigravity kiểm tra

Đây là phần cần giá trị **thật** từ môi trường deploy; agent không tự điền:

| Mục | Cần kiểm tra |
| --- | --- |
| `DJANGO_ALLOWED_HOSTS` | Host/domain thật của service trên Render (Render web service mặc định `*.onrender.com` + domain tùy chỉnh nếu có). Settings từ chối `*`. |
| `CORS_ALLOWED_ORIGINS` | Origin thật mà Mini App chạy trong Zalo (xem qua Android/iOS Zalo thực tế, ví dụ dạng `https://h5.zdn.vn` hoặc origin do Zalo cấp). CORS chỉ áp cho `/api/.*`, `CORS_ALLOW_CREDENTIALS = False`. |
| `MYSQL_*` env | `MYSQL_HOST/PORT/DATABASE/USER/PASSWORD` từ MySQL provider; user runtime ít quyền (SEC-20), riêng account chạy migrate một lần. |
| `MYSQL_SSL_CA` | Nếu provider yêu cầu TLS: cung cấp CA cert và settings sẽ bật `ssl_mode=VERIFY_IDENTITY`. |
| `healthCheckPath` | render.yaml đặt `/api/v1/health/` — Render sẽ dò endpoint này. |
| HTTPS/proxy | `SECURE_PROXY_SSL_HEADER` tin header `X-Forwarded-Proto` — chỉ hợp lệ sau proxy TLS của Render; phải xác nhận không có đường truy cập HTTP trực tiếp bỏ qua proxy. |

Chi tiết checklist tích hợp: `antigravity-checklist.md`.
