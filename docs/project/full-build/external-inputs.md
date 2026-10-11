# Danh sách đầu vào bên ngoài Huy cần cung cấp (external-inputs)

Nguồn: PROMPT TỔNG §12.2. Giá trị bí mật KHÔNG bao giờ gửi qua chat/repo;
chỉ cấu hình vào env/secret store server khi có cơ chế an toàn. Sau khi code
xong, báo lại đúng danh sách này những giá trị còn thiếu.

| # | Thông tin | Huy lấy ở đâu | Dùng cho | Tên config/env đề xuất | Phân loại |
| --- | --- | --- | --- | --- | --- |
| 1 | Zalo App ID (ứng dụng cha) | https://developers.zalo.me/ → ứng dụng dự án | F01 backend verify đúng app | `ZALO_APP_ID` | public |
| 2 | Zalo App Secret (ứng dụng cha) | developers.zalo.me → khóa bí mật | Provider proof/verify server | `ZALO_APP_SECRET` | secret (chỉ server) |
| 3 | Zalo Mini App ID | https://miniapp.zaloplatforms.com/ → Mini App Center | Build/app config, pairing đúng app cha | config Mini App build | public |
| 4 | Quyền dùng tên/ảnh | Guide request-permission + SDK authorize hiện hành | F01 profile (tùy nhu cầu) | permission inventory | public |
| 5 | Quyền storage/QR/notification khi thật sự dùng | Mini App Center → Quyền Mini App | SDK tính năng tương ứng | permission inventory | public |
| 6 | URL backend HTTPS test + allowed origins | Render dashboard sau khi Antigravity deploy | Mini App gọi API | `VITE_API_BASE_URL`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | public |
| 7 | MySQL host/name/user/pass/CA | Nhà cung cấp MySQL do Huy/Antigravity chọn | Migration/runtime/CI staging | `MYSQL_*` | secret |
| 8 | AI provider/model/key/budget + data policy | Console provider được đơn vị chọn | F04 | `AI_PROVIDER_ID` (registry), key ở secret store | secret |
| 9 | Đầu mối trường/trợ giúp/staff/giờ/consent | Thầy/đơn vị xác nhận | F12/F13 + scheduling | nội dung duyệt qua admin | duyệt chuyên môn |
| 10 | Retention/research suppression/consent-tuổi/ownership | Thầy/đơn vị chốt DEC-12..23 | Production privacy/research gates | policy versioned qua admin | duyệt pháp lý |
| 11 | Export Stitch + logo nguồn (SVG/PNG) | Huy gửi kèm nguồn/màn tham chiếu | Nâng cấp giao diện | approved asset registry | duyệt |

## Ghi chú bắt buộc

- Access token người dùng KHÔNG phải API key tĩnh: frontend lấy credential
  lúc người dùng đăng nhập; chỉ cấu hình env secret phía server.
- App ID và Mini App ID là hai giá trị khác nhau — kiểm tra đúng ứng dụng cha.
- Khi có credential qua cơ chế an toàn: chỉ cấu hình env, chạy bước được giao,
  kiểm tra lại; không echo key, không ghi vào artifact/Trello/log.
- Feature nào thiếu input tương ứng sẽ ghi BLOCKED đúng phạm vi trong report
  và vẫn giữ nguyên trạng thái không phụ thuộc.
