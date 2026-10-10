# Đánh giá Trello Family Bridge

Rà soát ngày 10/10/2026, bảng [Family Bridge](https://trello.com/b/UHuo0vGw), đối chiếu 15 tính năng Huy vừa chốt và hai DOCX đính kèm. Kết luận: **đủ làm backlog để bắt đầu phát triển; chưa có bằng chứng để coi ứng dụng sẵn sàng thử nghiệm với gia đình.** Báo cáo này không sửa thẻ hoặc tick checklist trên Trello.

## Những gì đã xác minh

- Đọc đủ 52 thẻ US và checklist thực tế của tất cả 52 thẻ; 10 mã Epic E00–E09, 121 checklist đại diện Task, 268 check item. Không có item hoàn thành.
- Có 48 thẻ ở Danh sách cần làm và 4 thẻ ở Sẵn sàng thực hiện (US-001, 003, 005, 006); các cột đang làm, chờ kiểm tra, hoàn thành trống.
- Mỗi thẻ có User Story, mã Epic/US, tiền nhiệm, nhánh đề xuất, phạm vi file, nghiệm thu và phụ trách trong mô tả.
- Đồ thị tiền nhiệm tích hợp có đủ 52 nút, không chu trình, không liên kết thiếu, không sai tầng W0–W11; danh sách kế tiếp trực tiếp khớp đồ thị. W là tầng phụ thuộc, không phải số tuần.
- Đủ cả 15 nhóm tính năng; ánh xạ cụ thể ở [phạm vi](../project-scope.md). Điều kiện sử dụng nội dung thật tách khỏi điều kiện merge code, hỗ trợ làm mock đúng phạm vi.
- Hộp thư không chờ màn hình chọn thẻ; quyền riêng tư đặt sớm; thông báo ngoài app và lịch hẹn có đầu mối thật không chặn bản lõi.

Đây là kết quả về cấu trúc công việc và nội dung yêu cầu, không chứng minh 52 US đã được triển khai hoặc mọi trường hợp nghiệp vụ đã được test. Repo trước PR chỉ có template Mini App Hello world và thư mục backend trống.

## Điểm cần chỉnh trước khi nhận từng US

| Mức | Vị trí | Điều chỉnh cụ thể |
| --- | --- | --- |
| Chốt phạm vi | US-034 | Giữ 300 giây cho đợt đầu theo yêu cầu mới; tách quyền admin đổi thời gian thành mở rộng sau quyết định mới. Không để coding agent tự chọn 15 phút hoặc khoảng khác. |
| Đồng bộ nguồn | US-003, 004, tài liệu repo | Chốt Django/DRF, MySQL, React Zalo Mini App và Render; frontend khác chỉ là khả năng dùng API về sau. Hai DOCX còn 15 phút, chuyển qua số điện thoại, localStorage và các tuyên bố riêng tư/hiệu quả tuyệt đối, không dùng làm đặc tả code hiện hành. |
| Chính xác trạng thái | 17 thẻ có T03 | Mô tả Done vẫn nói “cả hai Task đạt” dù có 3 Task. Đổi thành “tất cả Task của US đạt” và ghi bằng chứng nghiệm thu. |
| Nhận việc | Toàn bảng | Huy/Thầy đang là chữ trong mô tả; chưa có Trello member được gán trên thẻ. Khi nhận việc, gán đúng tài khoản và chia Task thật sự; không coi mọi US cùng tầng đều sửa file độc lập. |
| Hợp đồng | US-004 | Cần OpenAPI/schema auth, lời mời, grants, gửi tin, lỗi, phân trang, idempotency, timestamp; cụ thể hóa owner của migration/routes/settings. Bản mô tả US hiện chưa thay thế hợp đồng này. |
| Định danh | US-011, 013 | Backend xác minh credential Zalo; không nhận user_id/role tùy ý từ client. Mã mời có hạn dùng, chống đoán, chống dùng lại và xác nhận đồng thời. |
| Gửi tin | US-021, 030, 033 | Unique idempotency key; không tự retry gửi; mốc 300 giây theo server; AI lỗi vẫn giữ nháp; mọi luồng gửi cần thao tác duyệt mới. |
| Riêng tư | US-012, 017, 023, 026, 031 | Chốt quyền theo từng mục, tin đã gửi sau unlink, lịch xóa/retention/backup và xử lý yêu cầu xóa khi restore. Kiểm tra list/detail/export, không chỉ menu UI. |
| Trợ giúp | US-038, 039 | Thiết kế đường vào trợ giúp khi login/API lỗi và khi đang chờ nháp. Nội dung xác minh có giờ hoạt động và cơ chế cập nhật. Không giả lập gọi thành công hoặc người trực. |
| Nghiên cứu | US-010, 040, 045 | Chốt phiên bản/cách tính và đồng ý tham gia. Không coi bỏ tên là đã hết nguy cơ nhận diện; kiểm soát nhóm nhỏ. Không dùng số liệu DOCX làm kết quả thật nếu chưa có dữ liệu chứng minh. |
| Triển khai | US-003, 018, 049, 051 | Bổ sung hosting MySQL durable, CORS/HTTPS, migration, backup/restore, secrets, môi trường development/testing/live và bằng chứng Android/iOS Zalo thật. |

Các điểm trên không đòi hỏi viết lại toàn bộ bảng; chúng là phần làm rõ phạm vi/Task khi bắt đầu nền tảng. Không mở đồng thời tất cả 52 nhánh ngay từ main hiện tại.

## Thứ tự nhận việc

1. Bắt đầu US-003 (khung kỹ thuật), US-005 (nguyên tắc nội dung/riêng tư), US-006 (đầu mối hỗ trợ) và US-001 (quy trình bảng). Nội dung và kỹ thuật có thể tiến hành đồng thời.
2. Chốt US-004 và US-018. Sau US-004: US-011 đăng nhập thật rồi US-012 phân quyền nền.
3. Sau US-012: có thể làm riêng US-013 kết nối, US-014 quản trị, US-015 tâm trạng riêng, US-016 nhật ký riêng, US-017 xóa dữ liệu. Mỗi nhánh cần tiền nhiệm của mình được merge và tránh đụng file chung.
4. Sau US-013: hộp thư US-021, điểm tựa US-022 và thu hồi US-023. Sau US-021: AI US-029, tạm dừng US-030 và tín hiệu US-032; bộ thẻ/phản hồi còn cần nội dung US-020.
5. Trước mời gia đình: US-047 duyệt nội dung, US-048 quyền riêng tư, US-049 Zalo thật, US-018 khôi phục và US-050 nghiệm thu. Điều kiện Zalo phân phối bản thử nghiệm/công khai cần được kiểm tra riêng.

US-003 trong PR nền tảng mới có bằng chứng backend/client test và build local; chưa có Render, MySQL thật hay điện thoại Zalo. Vì vậy chưa chuyển US-003 sang Done. US-004 mới có quy tắc API đề xuất; schema nghiệp vụ chưa hoàn chỉnh.
