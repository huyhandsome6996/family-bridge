# F06 scope — Nháp và tạm dừng 5 phút (US-030, US-034)

Owner-only drafts + pause 300 giây do SERVER quyết định (DEC-03). Hết chờ
chỉ mở khả năng xem lại/xác nhận — không cron/queue tự gửi. Gửi cần lần
xác nhận cuối đúng (preview, revision, recipient); gửi đi qua per-kind
sender port (text→F05, emotion_card→F03 ở B18) — F06 không có bảng message.
Help/listening KHÔNG đi qua F06 nên không bao giờ bị cooldown chặn (WF-07).
Admin không có đường đọc draft; 300 là số cố định, không có endpoint cấu hình.

Chi tiết đầy đủ: report.md + test.md kèm theo. Nhánh mang theo harness
carry-forward chuẩn (labgrants + settings/urls + packages __init__.py).
