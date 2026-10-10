# Bằng chứng kiểm tra nền tảng

Ngày 10/10/2026. Đây là kiểm tra khung kỹ thuật, không phải nghiệm thu 15 tính năng nghiệp vụ.

| Kiểm tra | Kết quả |
| --- | --- |
| Đồ thị 52 US Trello | Không thiếu tiền nhiệm, không chu trình, đúng tầng; kế tiếp trực tiếp khớp |
| Django check và migration drift | Không lỗi; không có migration chưa tạo |
| Backend tests trên SQLite | 6 test đạt: health, readiness, DB lỗi không lộ nội dung, API mặc định yêu cầu auth, CORS, không có login giả |
| API client tests | 5 test đạt: thiếu cấu hình, HTTPS, bearer header, không lộ body lỗi/không retry POST, timeout |
| HTTP thực tế giữa client và Django local | `/health/` và `/ready/` trả OK; client gọi backend thật thành công |
| Mini App production build | Đạt với Vite 8; kiểm tra app-config và các file CSS/JS được tham chiếu |
| Production configuration | Từ chối thiếu secret và từ chối SQLite trong production |
| MySQL | Đã cấu hình CI migration/test với MySQL 8.4; chưa chạy MySQL tại workspace do không có DB server/native toolchain |
| Docker/Render/Zalo thật | Chưa triển khai hoặc kiểm thử; cần bằng chứng trước Done US-003 |

## Thư viện frontend

Template ban đầu báo 53 dependency advisories (11 high, 42 moderate). Cập nhật build Vite/React plugin và bỏ tooling CSS không dùng giảm còn **8 advisories** (4 high, 4 moderate), theo `npm audit` tại thời điểm kiểm tra. Các mục còn lại nằm trong cây phụ thuộc zmp-sdk/zmp-ui: Babel CLI/chokidar/braces, Sentry và React Router. Đây là cảnh báo dependency, chưa phải bằng chứng khai thác được trong bundle hoặc ứng dụng này.

Không dùng audit fix force để hạ SDK về bản cũ hoặc áp major override chưa được Zalo UI xác nhận. Cần đánh giá reachability/bản vá tương thích SDK/UI trước phát hành; không coi PR nền tảng là bản production đã đạt audit bảo mật. Phần tạo app-config được viết trong cấu hình Vite để dùng build hiện có qua CLI Zalo; cần xác minh nạp asset trên điện thoại thật.

GitHub Actions được cấu hình cho backend SQLite, MySQL và Mini App. Kết quả local không thay thế trạng thái workflow remote; xem tab Actions/PR để biết trạng thái chạy thực tế.
