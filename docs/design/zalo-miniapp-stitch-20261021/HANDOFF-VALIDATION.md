# Xác minh gói bàn giao — 21/10/2026

Baseline: `015514c18e1293416f26c4dec7fb2340d1381f2f`. Chỉ thêm thư mục gói tài liệu; không đổi runtime, web, backend, CI hoặc deployment. Không triển khai UI hoặc push main trong bước chuẩn bị hồ sơ này.

| Kiểm tra thực tế | Kết quả |
|---|---|
| ZIP và trích xuất an toàn, giới hạn 500 entry/100 MiB | PASS; archive có 264 entry gồm directory, 175 tệp nội dung |
| Hash ZIP gốc và 175 tệp trích xuất | PASS; toàn bộ bytes trùng nguồn, mapping tên Windows giữ trong manifest |
| Trang và frame | PASS; 24 mã M01–M24, 83 frame gắn mã, 4 khám phá = 87 HTML + 87 PNG + 1 Markdown |
| Kiểm kê toàn bộ HTML dạng tĩnh và xem 4 contact sheet bao phủ 87 PNG | Đã thực hiện; không execute HTML/CDN hoặc tải resource remote |
| `python docs/design/zalo-miniapp-stitch-20261021/verify_bundle.py --handoff-only` | PASS; mapping module Mini App, 24 prompt, liên kết và secret pattern scan hữu hạn |
| `git diff --cached --check` | PASS; nguồn export giữ nguyên whitespace bằng attribute riêng của thư mục archive; tài liệu viết mới vẫn được kiểm tra |
| `python scripts/check_agent_docs.py` trên checkout Windows hiện tại | FAIL do checksum Taste SKILL.md/LICENSE bị CRLF, không do gói mới |
| Cùng checker trên snapshot baseline + gói bàn giao, hai tệp Taste đọc đúng blob HEAD | PASS; SHA-256 của blob khớp upstream.json; không sửa skill, checksum manifest hoặc rule của repo |
| Runtime tests, build mới, Gemini thật, MySQL và Zalo Android/iOS | NOT_RUN/N/A cho nhiệm vụ gom tài liệu; coding agent làm theo VERIFICATION.md khi đổi code |

Các secret pattern phổ biến được scan trong Markdown/HTML/JSON mà không in giá trị khớp. Đây là kiểm tra có giới hạn, không phải chứng nhận không có mọi dạng dữ liệu nhạy cảm. Không đưa file tài khoản lớp, token, .env hay ảnh Environment của các nhiệm vụ trước vào nhánh.

Phân tích tài nguyên: kiểm kê/hash tuyến tính theo byte tập tệp hữu hạn; không truy vấn API/DB hoặc thay cache/polling của ứng dụng. Không claim hiệu năng hay bảo mật runtime từ checker tài liệu. Code HTML xuất từ Stitch là reference không đáng tin để chạy trực tiếp; các note sai đã được ghi trong DESIGN-REVIEW.md.
