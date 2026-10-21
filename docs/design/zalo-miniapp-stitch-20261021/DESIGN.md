# Design System: Family Bridge — Zalo Mini App

Thiết kế lại toàn bộ bề mặt Mini App trên điện thoại. Tệp này là đặc tả thiết kế cho Stitch, chưa phải giao diện đã triển khai. Quy tắc Family Bridge về nhận diện, quyền riêng tư, đồng ý và trợ giúp ưu tiên hơn các mẹo thẩm mỹ chung.

## 1. Visual Theme & Atmosphere

Ấm, sáng, gọn, tin cậy; hợp với học sinh THPT lẫn người chăm sóc. Cảm giác một công cụ giao tiếp cá nhân được thiết kế cho điện thoại, với chữ dễ đọc và vùng viết rộng. Không khí thân thiện nhưng không trẻ con, không khám bệnh, không dashboard quản lý gia đình. Mật độ 4/10, biến tấu bố cục 3/10, chuyển động 1/10. Chỉ tạo nhấn mạnh khi giúp người dùng quyết định; mỗi màn có một hành động chính.

## 2. Color Palette & Roles

| Token | Màu | Vai trò |
|---|---|---|
| Warm Canvas | #FFF4E8 | Nền sáng ấm có sẵn trong nhận diện; dùng tiết chế để màn không vàng đặc |
| Paper Surface | #FFFFFF | Vùng đọc, viết, sheet và danh sách |
| Terracotta Brand | #C65B43 | Nhận diện, icon và điểm nhấn thương hiệu |
| Accessible Action | #A84733 | Nút chính/focus; chữ #FFF4E8, cặp solid khoảng 5,36:1 |
| Warm Gold | #E4AB56 | Điểm nhỏ nhấn nhận diện; không chữ trắng nhỏ trên vàng |
| Cocoa Text | #713D32 | Chữ chính trên nền sáng; cặp với canvas khoảng 8,01:1 |
| Slate Secondary | #475569 | Mô tả phụ vẫn đủ đọc |
| Control Border | #64748B | Ranh giới control và trạng thái focus rõ |
| Success | #166534 / #F0FDF4 | Kết quả đã được máy chủ xác nhận, có nhãn |
| Warning | #92400E / #FFFBEB | Cần xem lại nội dung/trạng thái, có nhãn |
| Error | #B91C1C / #FEF2F2 | Lỗi hoặc thu hồi/xóa có xác nhận |

Màu chức năng không dùng để đánh giá cảm xúc tốt/xấu. Không gradient tím/xanh neon, nền tối xen kẽ, glassmorphism hay shadow phát sáng. Giữ hai màu nhận diện đã chốt; quy tắc “chỉ một accent” của mẹo thiết kế chung không được thay palette này. Tỷ lệ solid chỉ là tham chiếu, vẫn đo lại trạng thái thực/overlay/chữ trên asset.

## 3. Typography Rules

Be Vietnam Pro đang có trong ứng dụng, fallback font hệ thống hỗ trợ tiếng Việt; không yêu cầu thêm font. Body/input 16px, label 14–16px, tiêu đề 20–24px, metadata 12–14px chỉ cho thông tin phụ. Dùng weight 400/500/600, line-height body 1,5–1,6, heading 1,25–1,35. Không cắt dấu Việt, chữ in hoa dày đặc hay tracking quá chặt. Consent/hướng dẫn chính không thu nhỏ để vừa. Tên và label dài được xuống dòng. Chữ lớn 200% phải tiếp tục dùng được.

## 4. Component Stylings

Nút cao mục tiêu 48px, vùng chạm tối thiểu 44×44px; bo 8–12px, không pill khổng lồ cho mọi tác vụ. Nút primary đất cam đậm, nút secondary outline/nhẹ, hành động hủy đủ rõ. Khoảng giữa đích chạm ít nhất 8px. Input có nhãn phía trên, không dùng placeholder thay nhãn; lỗi ở ngay dưới. Textarea là diện tích chính của màn viết. Sheet bo góc trên khoảng 16px, cuộn được nội dung dài, có tên/đóng/quay lại rõ; không nhét cả bước đọc consent vào sheet thấp không thể đọc hết.

Dùng hàng danh sách và khoảng trống để nhóm thông tin; card chỉ khi cần phân biệt nội dung, bo khoảng 12px, bóng nhẹ hoặc không bóng. Icon nét đồng bộ 20–24px, luôn có label tiếng Việt; không emoji ngẫu nhiên hoặc ảnh stock gia đình. Dùng asset logo được duyệt nếu có, giữ đúng tỷ lệ, không tự vẽ lại rồi gọi là logo chính thức. Loading dùng skeleton nhẹ đúng kích thước; empty/error/disabled/success có lời và hành động phù hợp. Thành công chỉ sau phản hồi máy chủ. Hủy/thu hồi/xóa dùng dialog ghi phạm vi thật.

## 5. Layout Principles

Thiết kế chính frame 390×844 CSS px; kiểm tra 320, 360, 430px; chiều cao nội dung được cuộn, không thu toàn trang dài cho vừa 844px. Padding ngang 16px, màn rất hẹp 12px; thang khoảng cách 4/8/12/16/24/32px. Một cột; không sidebar, nav desktop, header quảng cáo, hai panel thư, hero chiếm nửa màn hoặc hàng ba card ngang. Không khung điện thoại dày quanh nội dung trong bản bàn giao.

Chừa vùng host Zalo trên cùng và safe area dưới theo ngữ cảnh; thiết kế phải chỉ rõ vùng nội dung ứng dụng so với chrome của host, không tạo hai thanh tiêu đề/back/close trùng nhau. Đây là yêu cầu kiểm tra thiết kế, không tự áp số inset cố định cho mọi máy. Tab dưới chỉ ở các trang cấp một: Trang chủ, Đồng hành, Hộp thư, Nhật ký, Cá nhân. Giữ năm tab hiện có để không tự đổi kiến trúc điều hướng; label rõ, không icon-only. Trang con có quay lại; ưu tiên không chiếm vùng viết bằng tab dưới. Bàn phím mở phải cuộn tới input/lỗi/nút; thanh cố định không che nội dung, không cộng safe area hai lần. Không cuộn ngang toàn trang.

## 6. Motion & Interaction

Ưu tiên đứng yên; feedback 100–200ms chỉ khi có ích, transform/opacity, tôn trọng reduced motion. Không shimmer vô hạn trang trí, pulse thở, parallax, autoplay, confetti cho chia sẻ tâm sự hoặc animation trì hoãn trợ giúp. Back/đóng sheet không làm mất bản nháp. Người dùng phải phân biệt Lưu riêng, Dùng gợi ý, Xem trước và Gửi; không tác vụ nào tự thay cho tác vụ khác.

## 7. Anti-Patterns & Product Boundaries

Không giả lập bản web thu nhỏ, bảng nhiều cột, văn bản bé, nút icon không label, ảnh cảm xúc sáo mòn, neon/blur, huy hiệu/streak, phần trăm cải thiện tâm lý hoặc chẩn đoán. Không thiết kế tính năng chưa có như reset mật khẩu email, QR mời tự sinh, time picker tín hiệu, upload ảnh hoặc bộ nhật ký hoàn chỉnh ở route đang chờ.

Nhật ký/mood/AI riêng tư mặc định. Kết nối không cấp quyền đọc tất cả. Chia sẻ phải chọn từng mục và đúng người, đọc toàn bộ nội dung cuối, chủ động xác nhận. AI chỉ khi người dùng yêu cầu và đồng ý, có thông báo dữ liệu tới Gemini; dùng gợi ý không đồng nghĩa gửi. Khoảng dừng tùy chọn cố định 300 giây theo máy chủ; hết giờ vẫn nháp, không tự gửi khi timeout/resume/AI/retry. Trợ giúp và tín hiệu lắng nghe không bị pause trì hoãn. Chương trình/khảo sát tự nguyện. Cặp admin cấp đã ACTIVE không bắt xác nhận lại; lời mời tự nguyện giữ hai phía xác nhận. Không nhân danh người dùng ghi đồng ý.

Mockup chỉ dùng câu giả lập trung tính, không dùng tài khoản, mật khẩu, key, nhật ký, danh sách lớp hay tên thật. Mock dữ liệu phải được ghi là minh họa trong chú thích bàn giao; không nhét nhãn kỹ thuật lên mọi màn production. Không hứa E2EE, riêng tư tuyệt đối, hotline hoặc trực 24/7 chưa được xác minh. Đầu mối chưa xác minh không có nút gọi giả.
