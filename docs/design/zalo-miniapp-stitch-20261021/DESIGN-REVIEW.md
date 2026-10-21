# Rà soát toàn bộ export Stitch

## Phương pháp và kết luận

Đọc cấu trúc và text của đủ 87 HTML, xem contact sheet đủ 87 ảnh. Không thực thi HTML/CDN/script; chưa đo pixel toàn bộ ảnh bằng browser/device thật. Đây là rà soát thiết kế/khả năng tích hợp, không phải xác nhận API, a11y, TLS hay test thiết bị.

Gói bao phủ đủ M01–M24, có 83 frame gắn mã và bốn khám phá chưa gắn mã. Dùng nhóm Mxx làm nguồn chính; bốn khám phá chỉ tham khảo, không phải bốn route thêm. Có hai sheet xác nhận M16, phải đối chiếu và hợp nhất thành một behavior đúng contract, không xây hai biến thể chia sẻ mâu thuẫn.

## Những gì cần giữ

Phong cách giấy sáng/đất cam, chữ Be Vietnam Pro, bố cục dọc và sheet, phân biệt trạng thái, người dùng tự quyết định trước gửi. Các nhóm M06/M12 tách vai, M04 có chưa chọn/lỗi lưu, M10 có consent/gợi ý/pause/preview, M14 có revoke, M15 có trang chờ — đây là cơ sở tốt để triển khai component nhất quán.

## Những gì phải điều chỉnh trước runtime

| Vấn đề phát hiện | Ví dụ trong export | Cách tích hợp bắt buộc |
|---|---|---|
| Notes lập trình được vẽ thành UI | Nhiều M01–M24 có Design Spec/Developer/Handoff/route/API | Bỏ khỏi production; chỉ giữ trong hồ sơ dev. Không copy cả trang dài xuống app |
| Một ảnh nhét nhiều ca lỗi và QA control | M03, M08, M16, M20, M23 | Chuyển thành state thật, không menu kiểm thử production, không vẽ bàn phím giả |
| Host chrome bị giả lập | Nút back/menu/close/avatar, status header, bàn phím | Dùng chrome thật của Zalo, tránh hai header và trùng vùng menu; kiểm tra safe area thật |
| Token màu không nhất quán | YAML Stitch #fff8f6/#89301e khác prose #FFF4E8/#A84733 | Hợp nhất theo DESIGN.md chuẩn/brand repo; không chép đồng thời hai hệ token |
| External CDN trong HTML | Google Fonts, Material Symbols, Tailwind ở toàn bộ export; ảnh Googleusercontent | Chuyển sang CSS/JS/component/font local sẵn có; không script CDN hay ảnh remote giả |
| Chức năng đăng nhập/cài đặt bịa thêm | M03 ghi SĐT, liên kết Zalo, số lần thử; M20 schema flag/định danh trường/policy mật khẩu hardcode | Dùng capabilities/error/limits thật; không thêm auth path, mật khẩu mẫu, metadata trường khi chưa có nguồn |
| Tuyên bố bảo mật/provider không có bằng chứng | M08/M14/M16 mã hóa cục bộ/riêng tư tuyệt đối; M10 AI không dùng huấn luyện; M20 TLS/hash cụ thể | Dùng copy đúng ứng dụng, không chứng nhận hay công nghệ giả; disclosure Gemini giữ text hiện hành |
| Cache dữ liệu riêng và mô tả realtime không có | M08 offline-first; M10 IndexedDB; M11 sessionStorage; M13 socket purge <300ms; M16 local sandbox | Không triển khai theo notes; giữ cơ chế state in-memory/server drafts/permission recheck hiện hữu |
| Hành vi pause sai | M10 ghi khóa token mọi API và hủy khoảng nghỉ | Giữ pause bản nháp theo server, không mở gửi trước mốc; help và signal luôn mở ngay |
| Gửi lại mù quáng | M11 state mất response có Thử gửi lại; các dòng success mẫu | Dùng operation lookup/idempotency, không auto retry hoặc khẳng định thành công chưa được xác nhận |
| Snippet và nội dung riêng trong list | M08 khám phá, M14 list hiển thị cảm xúc/badge mã hóa | Chỉ metadata API thực sự trả và có quyền; không tự thêm snippet/body trước detail recheck |
| Lịch hẹn, hỗ trợ miễn phí/24h/số điện thoại từ mock | M02/M06/M10/M16/M22 | Bỏ mọi số/cam kết chưa được duyệt; help chính chỉ thông tin đang xác minh; không dựng lịch hẹn |
| Xóa dữ liệu bịa SLA/ân hạn/hậu quả | M21 ghi 7–14 ngày, 48h, thư tác giả vô danh, xác thực phiên Zalo | Dùng danh mục/trạng thái/cancel API đang có, không thêm timer/hứa xóa backup hoặc thay auth |
| Kết nối/trang chờ có nguy cơ làm vượt phạm vi | M18 có cả đề xuất và admin ACTIVE; M15/chùm khám phá có nội dung tương lai | Admin ACTIVE chỉ báo đã kết nối; tự nguyện giữ hai phía; diary chính giữ chờ |
| Assertion accessibility không được đo | HTML nói WCAG AA+, tương phản, 200%, <300ms | Chạy đo/test riêng khi triển khai, không coi chữ trong mockup là evidence |

Các tên, ngày, tài khoản, trường, số liệu, thư và mật khẩu ví dụ trong bản Stitch là mock. Không dùng như thông tin thật, không seed vào backend. Tệp nguồn giữ nguyên để đối chiếu; những chỉnh sửa trên áp dụng khi xây app và được mô tả trong báo cáo deviation của coding agent.

Không cần “thiết kế lại toàn bộ từ đầu”: dùng hình làm đích bố cục, thay nội dung/hành vi sai bằng contract hiện hành, gom component và giữ tương tác thật. Nếu một chi tiết thị giác không thể dùng nguyên vì privacy/API/host, ghi deviation cụ thể theo mã Mxx và ảnh đối chiếu.
