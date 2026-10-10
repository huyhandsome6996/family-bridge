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


## Bộ hướng dẫn agent, DSA, luồng và bảo mật (10/10/2026)

- Hai skill family-bridge-dsa và family-bridge-security: quick_validate.py đạt.
- python scripts/check_agent_docs.py đạt; ba negative cases (rule wiring mất, link hỏng, VERIFIED không evidence) được thử trên bản sao tạm và phát hiện đúng.
- Mermaid 11.12.1 parse thành công 9 sơ đồ (5 ERD, 3 flow/state chương trình, 1 trust boundary). Đây là syntax check, không render QA hoặc model/migration validation.
- Forward-test chỉ đọc: dùng hai skill thiết kế inbox/export, không thay code hoặc gọi dịch vụ. Đã làm rõ cursor vs pagination nền tảng, reconnect generation, cohort school/program scope và form/participation mapping.
- Register baseline: 21 NOT_IMPLEMENTED, 8 PARTIAL, 1 NOT_APPLICABLE_WITH_REASON; không có control VERIFIED. Retention, unlink history, provider handling, suppression/report release và các quyết định nghiên cứu vẫn cần nghiệm thu ở US liên quan.
- CI bổ sung agent-docs; workflow run mới phải kiểm tra sau push. Kiểm tra cấu trúc không chứng nhận privacy/security, và không thay MySQL/device/production tests.
- Không có business code mới, không migration, deploy Render, scan production hoặc thử exploit hệ thống bên thứ ba trong tác vụ tài liệu này.
