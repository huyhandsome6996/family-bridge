# Family Bridge - Phạm Vi Dự Án (Project Scope)

> **Lưu ý quan trọng**: Đây là tài liệu xác định phạm vi ban đầu phục vụ giai đoạn khởi tạo workspace. Toàn bộ các tính năng được liệt kê dưới đây mới ở mức định hướng và thiết kế, **chưa được triển khai lập trình trong mã nguồn**.

---

## 1. Trục chính của dự án
Family Bridge được định hướng là nền tảng đồng hành hỗ trợ cha mẹ và con cái cải thiện kết nối, thấu hiểu và giao tiếp lành mạnh thông qua **chương trình đồng hành 4 tuần**:
- **Tuần 1 - Khởi đầu kết nối & Lắng nghe**: Thiết lập không gian chia sẻ an toàn, nhận diện cảm xúc cá nhân.
- **Tuần 2 - Thấu hiểu & Góc nhìn**: Đặt mình vào vị trí của đối phương, nhận biết rào cản và khoảng cách thế hệ.
- **Tuần 3 - Giao tiếp thấu cảm & Chữa lành**: Học cách diễn đạt cảm xúc chân thành, giảm xung đột và phòng thủ.
- **Tuần 4 - Gắn kết bền vững**: Duy trì thói quen đồng hành, tổng kết hành trình và cam kết dài hạn.

---

## 2. Các nhóm chức năng dự kiến

### 2.1. Ghép nối gia đình (Family Pairing)
- Cho phép tạo mã kết nối hoặc quét QR để liên kết tài khoản giữa cha mẹ và con cái một cách an toàn và tự nguyện.
- Hỗ trợ mô hình nhóm gia đình hạt nhân, đảm bảo quyền riêng tư của từng thành viên.

### 2.2. Nhật ký & Tâm trạng riêng tư (Private Journal & Mood Tracking)
- Không gian riêng tư để mỗi người (cha mẹ hoặc con cái) tự ghi lại cảm xúc, suy nghĩ trong ngày mà không bị người khác tự ý đọc.
- Giúp người dùng giải tỏa cảm xúc trước khi chuyển hóa thành lời nói.

### 2.3. AI gợi ý diễn đạt (AI-Assisted Empathetic Communication)
- Hỗ trợ người viết diễn đạt lại suy nghĩ theo hướng tích cực, xây dựng và giảm tính công kích/phòng thủ.
- **Nguyên tắc cốt lõi**: AI chỉ đóng vai trò gợi ý. Người dùng luôn là người kiểm duyệt, chỉnh sửa và chủ động quyết định trước khi gửi bất kỳ nội dung nào.

### 2.4. Nhắn tin đồng hành (Companion Messaging)
- Kênh trò chuyện trực tiếp giữa cha mẹ và con với các tính năng hỗ trợ giao tiếp thấu cảm.
- Gợi ý chủ đề mở lời khi cảm thấy bế tắc hoặc khó mở lời trực tiếp.

### 2.5. Hoạt động kết nối định kỳ (Connection Activities & Challenges)
- Các câu hỏi gợi mở (prompt questions) và thử thách nhỏ hàng ngày/hàng tuần phù hợp theo lộ trình 4 tuần.
- Khuyến khích tương tác ngoài đời thực giữa cha mẹ và con.

### 2.6. Đánh giá trước và sau chương trình (Pre/Post Assessment)
- Bảng khảo sát ngắn gọn đo lường mức độ gắn kết, thấu hiểu và chất lượng giao tiếp trước khi bắt đầu và sau khi hoàn thành 4 tuần.
- Đưa ra phản hồi trực quan về sự cải thiện trong mối quan hệ.

---

## 3. Kiến trúc kỹ thuật định hướng
- **Backend chung**: Django / Django REST Framework (cung cấp API trung tâm, xác thực, cơ sở dữ liệu và tích hợp AI).
- **Đa nền tảng người dùng**:
  - **Zalo Mini App**: Kênh tiếp cận thuận tiện, dễ dùng cho phụ huynh trên ứng dụng Zalo quen thuộc.
  - **Web Application**: Giao diện trình duyệt cho máy tính và thiết bị di động.
  - **Mobile App**: Ứng dụng di động độc lập cho trải nghiệm sâu hơn và thông báo đẩy.