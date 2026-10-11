# F12 scope — Liên hệ thầy cô và yêu cầu gặp riêng (US-038, US-046)

Danh bạ trường verified (auth); gọi qua SDK chỉ khi user bấm. Scheduling
CÓ ĐIỀU KIỆN: mọi endpoint (kể cả tạo request) gate staff directory —
unwired/rỗng → 503 scheduling_no_staff, trung thực trên UI. State machine
submitted→assigned→slot_proposed→scheduled→completed|cancelled; slot mới
supersede slot cũ; stale acceptance → 409; overlap cùng handler atomic
(select_for_update, capacity 1); submit KHÔNG có nghĩa là có lịch hẹn.
note chỉ requester + handler hiện tại có capability đọc (read-time check
— revoke mất quyền ngay). Queue assigned-only, không lộ scope trường.

Chi tiết: report.md + test.md. Nhánh mang harness carry-forward chuẩn.
