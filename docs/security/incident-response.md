# Runbook credential và sự cố

Phạm vi: người phụ trách vận hành đã được phân công. Không công khai dữ liệu người học hoặc chi tiết lỗ hổng đang hoạt động trong GitHub issue. Đây là quy trình đề xuất; chưa có hệ thống production để diễn tập.

## Khi secret/PAT xuất hiện trong chat, repo hoặc log

1. Không dùng thử, in lại, lưu trong repo hoặc chuyển cho công cụ khác. Che giá trị trong báo cáo.
2. Chủ credential revoke/rotate tại provider, kể cả đã xóa tin nhắn/file. Không yêu cầu gửi credential mới qua chat.
3. Rà quyền, thời gian và access/audit metadata đã khử dữ liệu; không tải hàng loạt nội dung riêng để điều tra.
4. Thay runtime/CI secret bằng secret store, invalidate phiên hoặc key liên quan nếu cần; không đổi mọi secret vô cớ.
5. Nếu đã commit: rotate trước, đánh giá lịch sử/forks/cache; cleanup history là tác vụ có thể phá nhánh nên phải có kế hoạch riêng. Không hứa xóa lịch sử là thu hồi credential.
6. Ghi sự cố tối thiểu, owner, remediation và evidence; không lưu secret cũ trong ticket.

## Sự cố lộ dữ liệu, chiếm quyền hoặc abuse

- Triage: xác định feature, actor scope, thời điểm và tác động; evidence metadata tối thiểu, có kiểm soát truy cập.
- Contain: revoke session/capability/credential liên quan, disable endpoint hoặc AI có nguy cơ; giữ trang trợ giúp/danh bạ công khai an toàn.
- Correct: vá lỗi, migration cần thiết, negative tests, review provider/dependencies; không chỉ chặn một UUID/IP.
- Recover: dùng bản sạch xác định nguồn, restore cách ly, áp dụng deletion/revocation ledger, kiểm tra quyền/contacts trước mở phục vụ.
- Communicate: người phụ trách quyết định thông báo phù hợp người bị ảnh hưởng và quy trình trường/pháp lý áp dụng; agent không tự gửi email/tin nhắn.
- Learn: phân tích nguyên nhân, cập nhật rule/test, theo dõi risk owner và thời hạn; không ghi nội dung tâm sự vào postmortem.

## Danh sách phải chốt trước pilot

Owner vận hành và dự phòng; kênh báo sự cố riêng; quyền revoke/deploy; backup location/key/retention; cách kiểm tra ledger sau restore; đầu mối trường; provider AI contact/data policy; rollback artifact và thời gian phục hồi mục tiêu. Chưa chốt thì ghi OPEN, không điền số điện thoại/người phụ trách giả.
