# F05 scope — Hộp thư và phản hồi nhanh (US-021, US-028)

Một message service/transport duy nhất cho text, emotion_card, journal_reply,
mood_reply, listening_signal, quick_reply. Không feature nào được tạo bảng
Message thứ hai — F03/F04/F10 gửi QUA MessageTransport port của nhánh này.

Chi tiết đầy đủ: report.md + test.md kèm theo.

Nhánh này mang theo 2 fix harness cần dùng chung cho mọi feature branch
(từ baseline B00): (1) harness/urls.py mount prefix khi routes rỗng,
(2) harness/settings.py mở rộng dependency có điều kiện + labgrants
(test-only) bổ sung TestConnection cho branch chưa có F01. Nội dung trùng
nhau khi merge B18.
