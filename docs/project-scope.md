# Phạm vi Family Bridge

Bản chốt ngày 10/10/2026 từ yêu cầu trực tiếp của Huy là chuẩn triển khai. Hai DOCX tham khảo và tài liệu cũ có nội dung khác phải được đối chiếu trước khi dùng. Các chức năng dưới đây là yêu cầu, chưa phải chức năng đã có trong mã nguồn.

## Mười lăm nhóm tính năng

| Mã | Yêu cầu | US Trello |
| --- | --- | --- |
| F01 | Đăng nhập bằng Zalo; kết nối học sinh với cha mẹ/người chăm sóc bằng mã mời, hai bên xác nhận | 011, 013 |
| F02 | Gợi ý 4 tuần với hoạt động riêng và chung; tự nguyện, chọn từng hoạt động | 036, 044 |
| F03 | Bộ thẻ cảm xúc online; chọn thẻ, người nhận, xem trước và xác nhận; người nhận có gợi ý phản hồi | 027, 028 |
| F04 | AI giúp cả hai bên diễn đạt rõ cảm xúc và nhu cầu, giữ đúng ý; xem, sửa, duyệt trước khi gửi; không gửi câu gốc | 029, 033 |
| F05 | Hộp thư và phản hồi nhanh trong Mini App; có thể trả lời bằng lời riêng hoặc mẫu | 021, 028 |
| F06 | Lưu nháp và tạm dừng 5 phút; mở lại vẫn đúng trạng thái; hết giờ không tự gửi; trợ giúp không bị chặn | 030, 034 |
| F07 | Ghi nhận cảm xúc hằng ngày, ghi chú, lịch sử cá nhân; chủ động chia sẻ từng mục | 015, 026 |
| F08 | Nhật ký riêng; nhật ký song hành theo chủ đề, chia sẻ từng trang và phản hồi; có hướng dẫn sổ giấy | 016, 031, 044 |
| F09 | Trò chuyện 5 phút, bữa ăn không điện thoại, đi dạo/gọi điện khi ở xa; bài học khoảng 60 giây cho người chăm sóc | 037 |
| F10 | Nút “Con cần được lắng nghe”; chọn người đã kết nối và nhu cầu trò chuyện/ở bên/hẹn trao đổi | 032 |
| F11 | Thêm người thân/giáo viên/cán bộ tham vấn đồng ý làm điểm tựa; học sinh tự chọn liên hệ khác; không tự chuyển tâm sự | 022, 035 |
| F12 | Danh bạ thầy/cô đồng ý tiếp nhận và mở màn hình gọi; yêu cầu gặp riêng/lịch hẹn chỉ bật khi có đầu mối dùng hệ thống | 038, 046 |
| F13 | Trang tìm trợ giúp riêng, đầu mối/số điện thoại/giờ hoạt động đã xác minh; người dùng chủ động gọi | 039 |
| F14 | Khảo sát trước/sau tự nguyện cho học sinh và người đồng hành; nghiên cứu dùng tổng hợp bỏ nhận diện | 040, 045 |
| F15 | Quản lý người kết nối, từng nội dung chia sẻ, hủy kết nối và yêu cầu xóa; nhật ký riêng/AI không mặc định mở cho người thân/giáo viên | 012, 017, 023 |

## Bốn chủ đề

1. Nhận diện cảm xúc và “Tiếng lòng chưa nói”: nhận biết cảm xúc, chia sẻ điều buồn hoặc khó mở lời.
2. Giảm so sánh và “Bản sắc riêng của con”: ghi nhận cố gắng, luyện lắng nghe, dành thời gian cho nhau.
3. Ranh giới riêng tư và niềm tin: thống nhất tôn trọng không gian cá nhân, điện thoại và thông tin riêng.
4. Cảm ơn, xin lỗi và “Thỏa ước gia đình mới”: xác nhận việc cụ thể tiếp tục thực hiện sau chương trình.

Luồng chi tiết ở [chương trình 4 tuần](product/four-week-flow.md), dữ liệu ở [ERD](data/erd.md) và quyền quản trị ở [admin](product/admin-capabilities.md). Đây là thiết kế chưa triển khai.

Không khóa tuần sau nếu chưa làm tuần trước. Không bắt buộc tham gia hoạt động hay khảo sát để sử dụng công cụ giao tiếp.

## Những quyết định được áp dụng

- Frontend học sinh, người chăm sóc và quản trị nội dung nằm trong Mini App theo backlog hiện tại; không xây web hoặc React Native trong đợt này.
- Hộp thư nằm trong hệ thống Family Bridge. Thông báo ngoài Mini App là phần nghiên cứu điều kiện Zalo ở US-019; không giả định có quyền gửi tin cá nhân tự động.
- Khoảng tạm dừng mặc định và phạm vi đợt đầu là **300 giây**. Khả năng admin đổi thời gian ở US-034 là phần mở rộng của backlog; chưa triển khai khi chưa có quyết định mới.
- Nút cần được lắng nghe và trang tìm trợ giúp là hai luồng khác nhau. Không dùng bộ đếm để trì hoãn liên hệ hỗ trợ.
- Dữ liệu tâm trạng và nhật ký là cá nhân. Kết nối chỉ cho phép tương tác, không cấp quyền đọc mọi dữ liệu.
- Nội dung AI chỉ được chuyển tới nhà cung cấp AI khi người viết chủ động dùng tính năng, với thông báo xử lý dữ liệu phù hợp; không có nghĩa “riêng tư” là không có bên xử lý kỹ thuật.
- Dữ liệu mẫu và số liệu minh họa không được ghi thành kết quả nghiên cứu đã thu thập. Các tỷ lệ, p-value và hiệu ứng trong DOCX cần dữ liệu thật và kiểm chứng trước khi sử dụng làm kết luận.

## Điều kiện thử nghiệm

Có xác thực Zalo phía server; kiểm tra quyền từng đối tượng; nội dung và danh bạ được duyệt; sao lưu/khôi phục MySQL; quy trình yêu cầu xóa; thử các luồng bằng nhiều tài khoản trên Zalo Android/iOS; đồng ý tham gia và quy trình hỗ trợ đã được thầy thống nhất. Hoàn thành code không đồng nghĩa Zalo đã xét duyệt.
