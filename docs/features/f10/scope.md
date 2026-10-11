# F10 scope — Nút "Con cần được lắng nghe" (US-032)

Signal là message thường (kind listening_signal) gửi qua MessageTransport
port — explicit + idempotent; KHÔNG đồng nhất emergency; KHÔNG bao giờ bị
cooldown chặn (WF-07 — F05 miễn cooldown cho kind này, F06 không liên quan).
3 nhu cầu allowlist; 1 người nhận được chọn tường minh; preview trước gửi.
Không broadcast; chọn "hẹn giờ" KHÔNG tự tạo school appointment (F12 riêng).
Không phản hồi → trạng thái trung thực + đường tự liên hệ điểm tựa khác/
F13; không auto-escalate/auto-forward. F13 luôn mở kể cả khi gửi thất bại.

Chi tiết: report.md + test.md. Nhánh mang harness carry-forward chuẩn.
