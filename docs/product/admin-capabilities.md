# Giao diện admin và giới hạn quyền

Thiết kế chức năng quản trị trong Zalo Mini App theo backlog hiện tại, chưa phải UI đã xây. Django admin mặc định không được mở để bypass các quyền này. Vai trò học sinh/người chăm sóc không cấp quyền admin; backend quyết định capability và school scope, không tin cờ client/is_staff.

Mục lục: [vai trò](#vai-trò), [màn hình](#màn-hình-và-tác-vụ), [quy trình](#quy-trình-quản-trị), [giới hạn](#không-được-làm), [kiểm thử](#kiểm-thử-quyền).

## Vai trò

| Vai trò | Quyền |
| --- | --- |
| Biên tập nội dung | Soạn/chỉnh draft giáo trình, thẻ, phản hồi, bài học và hướng dẫn giấy; không tự publish bản chưa được duyệt |
| Người duyệt nội dung | Review/publish/retire nội dung trong scope; xem diff/revision, kiểm tra đúng 4 chủ đề |
| Quản lý danh bạ trường | Quản lý đầu mối trường đã đồng ý, số/giờ/verification và khả năng nhận hẹn; không xem note lịch hẹn mặc định |
| Thầy/cô/cán bộ tiếp nhận | Chấp nhận/đề xuất/hủy lịch đúng request được giao cho mình; xem nội dung học sinh chủ động gửi tới mình |
| Phụ trách nghiên cứu | Cấu hình khảo sát tự nguyện/đợt trước-sau; xem/export tổng hợp an toàn, không raw response/mapping |
| Quản lý quyền | Cấp/thu hồi capability theo scope, TTL và audit; không tự tạo kết nối hoặc đại diện xác nhận của gia đình |
| Vận hành kỹ thuật / xử lý quyền riêng tư | Theo dõi lỗi đã khử nội dung nhạy cảm, backup/restore, queue yêu cầu xóa đã xác minh theo runbook; đặc quyền server tách khỏi admin UI |

Một tài khoản có thể nhiều role nhưng mỗi tác vụ cần capability cụ thể. Scope toàn hệ thống chỉ cấp khi có trách nhiệm rõ; staff trường A không xem dữ liệu trường B. Revoked/expired role mất hiệu lực ngay ở server. Nhà nghiên cứu không kiêm quyền đọc raw qua một nút “super admin”.

## Màn hình và tác vụ

| Màn hình | Có thể làm | Giới hạn dữ liệu |
| --- | --- | --- |
| Tổng quan | Số lượt dùng/chương trình/hoạt động và tình trạng dịch vụ bằng chỉ số tổng hợp đã duyệt | Không danh sách mood học sinh, không xếp hạng gia đình, không drill-down tái nhận diện |
| Giáo trình 4 tuần | Quản lý tuần 1 “Tiếng lòng chưa nói”, tuần 2 “Bản sắc riêng”, tuần 3 riêng tư/niềm tin, tuần 4 cảm ơn/xin lỗi/thỏa ước | Không khóa tuần theo hoàn thành, không sửa âm thầm version người dùng đang tham gia |
| Hoạt động/bài học | Soạn hướng dẫn riêng/chung, trò chuyện/đi dạo/gọi điện, bài học 60 giây, hướng dẫn sổ giấy | Không ép lịch hoạt động, không xem ghi chú riêng hoặc đánh dấu done thay người dùng |
| Thẻ/phản hồi nhanh | Soạn thẻ online và gợi ý xưng hô/phản hồi; preview và duyệt | Không gửi thẻ thay người dùng hoặc đọc thư để “chấm chất lượng” |
| Danh bạ hỗ trợ | Thêm/sửa đầu mối đã đồng ý, giờ/timezone, kiểm chứng/ngày review, tạm ngừng mục hết hiệu lực | Số công khai đúng phạm vi đã đồng ý; không tự dựng số nóng hoặc tuyên bố hỗ trợ 24/7 |
| Tiếp nhận lịch hẹn | Staff xem request của mình, đề xuất giờ/chấp nhận/từ chối; thông báo thay đổi lịch đã duyệt | Không đọc journal/mood/AI hoặc xem mọi request cùng trường |
| Khảo sát/nghiên cứu | Quản lý câu hỏi có phiên bản, đợt trước/sau tự nguyện; đếm và thống kê tổng hợp | Không tên/Zalo ID/pseudonym/raw free text, không bịa p-value hoặc hiệu quả |
| Quyền quản trị | Phân công biên tập/duyệt/danh bạ/staff/research trong scope; thu hồi, xem audit | Không cấp quyền từ request body hoặc tự vượt school scope |
| Quyền riêng tư | Theo dõi yêu cầu xóa do chính actor đã xác minh gửi, tiến độ xử lý và thông báo kết quả | Không mở nội dung để xử lý xóa; quy trình nêu rõ dữ liệu sống, đã gửi, provider và backup |
| Vận hành | Lỗi/rate-limit/AI budget tổng hợp, cấu hình public content đã duyệt; ngắt AI khi sự cố | Không đổi pause khỏi 300 giây, không log prompt/token, không gọi AI/nhắn tự động |

Dashboard hoạt động/giao tiếp chỉ thu metadata tối thiểu có mục đích, consent và policy rõ; không vì “admin cần” mà thu thêm sự kiện riêng. Nhóm nhỏ phải suppression và chống suy từ tổng/diff; ngưỡng cụ thể chốt trong kế hoạch nghiên cứu. Export cũng tuân thủ cùng policy, không lách bằng CSV. Các role/màn hình là thiết kế, không thêm dashboard phân tích riêng tư ngoài 15 tính năng.

## Quy trình quản trị

1. Biên tập tạo draft, review thay đổi; người phụ trách chuyên môn duyệt trước publish.
2. Publish tạo revision bất biến; enrollment pin version. Lỗi nội dung xử lý retire và thông báo cần thiết, không tự thay lời gia đình đã gửi.
3. Danh bạ chỉ active khi consented, verified_at và thông tin tiếp nhận còn hiệu lực. Appointment chỉ bật khi có staff nhận vai trò và khả năng tiếp nhận thực tế.
4. Quyền nhạy cảm được xác thực lại theo cơ chế step-up đã chốt, ghi audit tối thiểu. Có thể tách người cấp/duyệt khi nhóm có đủ nhân sự; không dựng tài khoản giả để chứng minh phân tách.
5. Report tổng hợp chỉ chạy nếu consent và cohort scope hợp lệ; suppression áp dụng trước trả response/export.
6. Sự cố hoặc yêu cầu xóa đi qua runbook, không có màn hình xem toàn bộ dữ liệu riêng. Operator server vẫn có quyền kỹ thuật cần quản lý riêng; không tuyên bố bảo mật tuyệt đối/E2EE.

## Không được làm

- Đọc nhật ký riêng, mood chưa chia sẻ, original/suggestion AI, ghi chú run riêng hoặc hộp thư gia đình chỉ vì là admin/thầy.
- Xác nhận kết nối, thỏa ước, send, completion, consent hoặc survey thay người dùng.
- Tự chuyển tâm sự cho điểm tựa/thầy vì người thân chưa phản hồi.
- Đổi cooldown, bật auto-send hoặc trì hoãn đường trợ giúp.
- Tìm người dùng theo cảm xúc để can thiệp tự động hoặc báo cáo cấp lớp có thể nhận diện.
- Xuất danh sách raw người tham gia/câu trả lời hoặc nhập dữ liệu thật vào repo public.
- Bypass quyền bằng Django admin, private API, export, thông báo hoặc log.

Thầy được người học chọn làm điểm tựa có thể nhận lời gửi đúng tới mình với vai trò recipient; đó không phải quyền admin đọc các trao đổi khác.

## Kiểm thử quyền

Test ít nhất học sinh, người chăm sóc, editor, reviewer, staff A/B và researcher. Kiểm tra list/detail/export/update/delete, sửa role/school ID trong request, grant/role bị thu hồi và direct API khi UI giấu nút. Audit không chứa message body/journal/AI/token. Các endpoint chưa có phải ghi NOT_IMPLEMENTED, không coi test scaffold là đạt.

Liên kết: [scope](../project-scope.md), [luồng](four-week-flow.md), [ERD](../data/erd.md), [security](../security/security-rules.md).
