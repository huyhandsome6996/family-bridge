# F01 — Checklist nghiệm thu thủ công (chờ Huy/reviewer)

| # | Actor | Thao tác | Kết quả kỳ vọng | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Khách (chưa login) | Mở app lần đầu | Onboarding tiếng Việt, mục consent KHÔNG preselect; link "Tìm trợ giúp" bấm được ngay | MANUAL_REVIEW (cần preview/device) |
| 2 | Học sinh | Đăng nhập bằng Zalo (thật) | Session được cấp; không xin số điện thoại; zalo id không hiện dưới dạng number | NOT_RUN (cần Zalo thật — US-049) |
| 3 | Học sinh | Từ chối nghiên cứu + AI | App vẫn dùng được; help mở; consent ghi đúng declined | MANUAL_REVIEW |
| 4 | Học sinh | Tạo mã mời | Mã hiện MỘT lần, 12 ký tự; không còn ở màn hình sau refresh | MANUAL_REVIEW |
| 5 | Người chăm sóc | Nhập mã đúng | "Đã xác nhận phía bạn. Chờ người tạo lời mời xác nhận." | MANUAL_REVIEW |
| 6 | Học sinh | Xác nhận lời mời | Kết nối active; cả hai thấy nhau ở danh sách | MANUAL_REVIEW |
| 7 | Người chăm sóc | Nhập mã sai 30 lần | Bị chặn 429 với thông báo chờ, không lộ mã nào là đúng | MANUAL_REVIEW |
| 8 | Học sinh | Hủy kết nối | Xác nhận riêng; sau hủy danh sách rỗng; thông báo quyền thu hồi không hồi sinh | MANUAL_REVIEW |
| 9 | Người lạ | Đoán URL invite của người khác | 404, không lộ thông tin | PASS (logic test stranger) — device check MANUAL_REVIEW |
| 10 | Hệ thống | Đổi giờ thiết bị lùi 1 ngày khi đang chờ confirm | Mã hết hạn vẫn hết hạn theo giờ server | PASS (logic) — device MANUAL_REVIEW |

Ghi chú: cột PASS chỉ là bằng chứng logic tự động; nghiệm thu thật cần UI chạy
trên Zalo Android/iOS (US-049) và Huy/Thầy xác nhận.
