# Hợp đồng nền tảng API

Đây là hợp đồng các endpoint đã triển khai cùng quy tắc đề xuất cho US-004. Chưa phải OpenAPI hoàn chỉnh cho 15 tính năng; các nhánh nghiệp vụ phải chốt schema cụ thể trước tích hợp.

## Endpoint hiện có

| Method | Path | Quyền | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/health/` | Public | 200 `{"status":"ok"}`; chỉ chứng minh process trả lời |
| GET | `/api/v1/ready/` | Public | 200 `{"status":"ok"}` khi SELECT 1 thành công; 503 `{"status":"unavailable"}` khi DB lỗi |

Response kiểm tra không chứa tên DB, password hoặc lỗi kết nối. Các endpoint trên không chứng minh schema migration hoặc tính năng nghiệp vụ đã chạy.

## Quy tắc chung

1. HTTPS; JSON; route version `/api/v1/`; UUID định danh tài khoản và đối tượng nội bộ. Zalo IDs giữ kiểu chuỗi, không chuyển sang Number ở JavaScript.
2. Mặc định APIView yêu cầu bearer JWT của Family Bridge và IsAuthenticated; từng API vẫn phải thêm quyền theo đối tượng. Không dùng cookie để xác thực Mini App.
3. Lỗi DRF chuẩn: `{"error":{"code":"...","details":{...}}}`. Không trả stack trace, prompt AI hoặc dữ liệu riêng của đối tượng không có quyền. Lỗi ngoài DRF chưa được chuẩn hóa trong khung này.
4. Khung hiện tại dùng phân trang chuẩn DRF (`count`, `next`, `previous`, `results`), mặc định 20 bản ghi; chưa có list nghiệp vụ. Với inbox/mood/journal tăng dần, US-004/US sở hữu phải chốt cursor envelope (`next`, `previous`, `results`, không COUNT toàn bộ mỗi trang), thứ tự ổn định và tối đa 50 trước triển khai. Đây là đề xuất DSA, chưa thay cơ chế runtime hiện tại. Client không tự chuyển next URL tùy ý kèm token.
5. Giờ lưu UTC với USE_TZ; trả ISO 8601. Hiển thị múi giờ Việt Nam. Mốc cooldown do server quyết định.
6. US-021 phải bổ sung khóa idempotency và unique constraint trước khi gửi thẻ/tin/tín hiệu. Hai lần gửi do mạng yếu phải trả cùng message; không tự retry POST ở client hiện tại.
7. Payload gửi tin chỉ có người nhận/conversation, loại công khai được allowlist, nội dung cuối và idempotency key. `text/card/signal` trong phác thảo ban đầu là tên nhóm, chưa là enum đã triển khai. US-004 chốt mapping: `text -> text`, `card -> emotion_card`, `signal -> listening_signal`; reply/quick_reply cần schema riêng tương ứng ERD. Không nhận `is_staff`, owner tùy ý hoặc câu gốc AI.
8. US-030 phải có thao tác lưu nháp và thao tác xác nhận gửi riêng; không gửi bằng sự kiện timer kết thúc, app resume hoặc cron.
9. US-012/023 kiểm tra quyền lại ở mỗi lần đọc/gửi, không coi token hợp lệ là quyền đọc mọi dữ liệu.
10. US-004 lập OpenAPI cho auth, connection, share grant, send và content trước các nhánh phụ thuộc; mọi thay đổi phá hợp đồng phải được rà soát chung.
