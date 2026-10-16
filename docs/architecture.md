# Kiến trúc kỹ thuật Family Bridge

Ngày 11/10/2026, tài liệu này được đưa trực tiếp vào main. Các đường dẫn/khung code được mô tả thuộc nhánh feat/us-003-kt01 trong PR #1; chưa merge mã nền tảng vào main. Thiết kế là chuẩn hướng tới, không bằng chứng main đã chạy các chức năng.

Dùng một backend Django REST Framework cung cấp API cho các frontend. Backend giữ dữ liệu và quyền truy cập; frontend hiển thị và gọi API, không tự quyết định quyền.

**Cập nhật 2026-10-16 (supersede "một frontend"):** hiện có HAI frontend độc lập dùng chung backend và package headless `packages/family_bridge_shared/`: Zalo Mini App (`zalo-mini-app/`) và web độc lập (`web/`, Render static service publish `web/dist`). Chi tiết ADR: `docs/handover/web-miniapp-separation/architecture.md`.

## Các thành phần

| Thành phần | Trách nhiệm |
| --- | --- |
| `backend/config/` | Thiết lập Django, biến môi trường, URL, WSGI/ASGI |
| `backend/accounts/` | Định danh UUID nội bộ; US-011 bổ sung binding với định danh Zalo đã xác minh |
| `backend/core/` | Kiểm tra dịch vụ/cơ sở dữ liệu, xử lý lỗi chung |
| `zalo-mini-app/src/api/` | HTTP JSON, bearer header, timeout; không tự retry thao tác ghi |
| `zalo-mini-app/src/features/` | Module UI của từng US, được tạo theo tiến độ |
| `docs/contracts/` | Quy tắc API và thiết kế được các nhánh dùng chung |

Đây là kiến trúc đề xuất và khung chạy được. Các module nghiệp vụ chưa được tạo. Giữ đường dẫn module ở gốc backend tương ứng thẻ Trello để giảm việc đổi quy ước trước khi nhóm chốt US-004.

## Đăng nhập và nhiều frontend

US-011 phải lấy credential thật qua SDK Zalo, gửi lên API HTTPS và xác minh với Zalo ở backend theo tài liệu đang áp dụng cho App ID. Chỉ sau xác minh mới ánh xạ `(provider, app_id, provider_user_id)` sang UUID nội bộ và cấp token của Family Bridge. Không tin `zalo_id`, số điện thoại hoặc role do client tự gửi. Quyền admin chỉ được cấp bởi quy trình quản trị, không bằng thao tác chọn vai trò của người dùng.

Django hiện có default JWT authentication và `IsAuthenticated`; chưa có endpoint cấp JWT hoặc login giả. Chốt cơ chế làm mới/thu hồi phiên ở US-004/011; bearer JWT ngắn hạn không thay thế kiểm tra quyền đối tượng. Frontend khác sau này dùng cùng API bằng credential adapter phù hợp, không buộc giả lập SDK Zalo. Không gắn quyền nghiệp vụ vào nguồn Origin.

CORS phải cho phép origin Mini App cụ thể (tài liệu Zalo nêu `https://h5.zdn.vn`) và OPTIONS preflight. HTTPS với chứng chỉ hợp lệ cần được thử trên điện thoại; `localhost` trên điện thoại không trỏ về máy lập trình. Quản lý API Domains theo công cụ Zalo hiện hành; không coi khai báo domain là thay thế CORS hoặc xác thực.

## MySQL và Render

Django chạy Render Web Service, MySQL chạy dịch vụ riêng: nhà cung cấp MySQL có lưu trữ bền vững, hoặc Render private Docker service gắn disk `/var/lib/mysql`. Render cung cấp managed Postgres; hướng dẫn MySQL là tự triển khai, không phải managed MySQL miễn phí.

Dùng MySQL 8 với InnoDB và utf8mb4, strict mode. Kết nối nội bộ nếu cùng Render region; nếu DB ngoài Render, dùng TLS theo CA của nhà cung cấp, tài khoản ứng dụng ít quyền và hạn chế nguồn truy cập. Sao lưu bằng công cụ DB, thử khôi phục định kỳ; không lấy disk snapshot làm cách khôi phục MySQL mặc định. Không lưu dữ liệu thật trong SQLite hoặc file cục bộ của Render web service.

`render.yaml` chỉ là cấu hình chuẩn bị; chưa áp dụng hoặc tạo dịch vụ tính phí. Docker build cài mysqlclient và các thư viện native. Migrate được chạy trước Gunicorn ở bản một dịch vụ; khi tăng số instance phải tách migration sang một bước release duy nhất.

## Ranh giới dữ liệu và AI

US-004 chốt model/hợp đồng theo từng domain: connections, messaging, drafts, moods, journals, content, support, surveys, privacy và ai_reframing. User model tối thiểu đã được tạo sớm để tránh đổi AUTH_USER_MODEL sau khi có nhiều migration.

- Lời mời có hạn dùng, chống đoán mã và dùng lại; có transaction khi hai bên xác nhận.
- Query và hành động phải kiểm tra chủ sở hữu, người nhận hoặc grant cụ thể; kiểm tra ở list/detail/export/update/delete.
- Chia sẻ chỉ áp dụng một mục hoặc một trang và một người nhận, có thể thu hồi. Không cấp quyền đọc cả sổ vì đã kết nối.
- Tin nhắn chứa snapshot nội dung đã duyệt; câu gốc AI không được đặt trong payload nhận tin.
- AI gọi từ server; key nhà cung cấp không nằm trong `VITE_*`. Hạn chế dữ liệu gửi đi, thời gian lưu và log; không ghi prompt/nhật ký/token vào log.
- Nháp lưu riêng; backend giữ mốc `cooldown_until` theo giờ server. Hết 300 giây vẫn phải có thao tác gửi mới của người dùng. Luồng gọi trợ giúp không đi qua endpoint chờ.
- Kết nối bị hủy phải chặn gửi mới và quyền chia sẻ. US-023 phải chốt rõ hành vi tin đã gửi; không hứa thu hồi ảnh chụp hoặc bản sao ngoài hệ thống.
- Xóa dữ liệu phải xác định phạm vi dữ liệu sống, dữ liệu đã gửi, dữ liệu nghiên cứu, log và backup, cùng hạn lưu giữ. Khi restore phải áp dụng lại các yêu cầu xóa trước khi đưa hệ thống phục vụ.
- Thầy quản trị nội dung không mặc định được đọc nhật ký/AI. Đặc quyền vận hành server vẫn tồn tại; không tuyên bố riêng tư tuyệt đối hoặc mã hóa đầu cuối khi chưa xây cơ chế đó.
- Báo cáo khảo sát chỉ tổng hợp, không gồm tên/Zalo ID/nội dung tâm sự; hạn chế nhóm quá nhỏ và tổ hợp có thể tái nhận diện. Ngưỡng được chốt với kế hoạch nghiên cứu, không tự coi bỏ tên là đã ẩn danh hoàn toàn.

MVP dùng REST và polling có khoảng nghỉ khi Mini App đang mở; dừng khi app bị pause. Không cần Celery/Redis/WebSocket để tạo hộp thư đầu tiên. Hết bộ đếm không có job tự gửi. Thông báo ngoài Mini App là tích hợp riêng sau US-019.

## Nguồn kỹ thuật kiểm tra ngày 10 tháng 10 năm 2026

- [Zalo Mini App Platform](https://docs.zaloplatforms.com/mini-app-platform)
- [Chuyển Web App sang Mini App, bearer header và hạn chế storage/cookie](https://docs.zaloplatforms.com/docs/MA/intro/getting-started/convert-web-app-to-mini-app)
- [Zalo lỗi CORS, HTTPS và môi trường thật](https://docs.zaloplatforms.com/docs/MA/intro/getting-started/frequently-solved-issues)
- [Django MySQL](https://docs.djangoproject.com/en/5.2/ref/databases/)
- [Render Django](https://render.com/docs/deploy-django)
- [Render MySQL và backup](https://render.com/docs/deploy-mysql)
- [Render Free limitations](https://render.com/docs/free)
