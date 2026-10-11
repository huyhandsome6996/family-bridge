# F04 scope — AI hỗ trợ diễn đạt (US-029, US-033)

Cả học sinh và người chăm sóc chủ động nhờ AI viết lại lời bộc phát thành
lời rõ cảm xúc/nhu cầu. AI chỉ chạy backend; provider là registry server
allowlist; payload tối thiểu = đúng câu user chọn. Bản gốc + gợi ý là dữ
liệu riêng của tác giả. Accept KHÔNG gửi — gửi cuối đi qua
preview-recipient-confirm chung (F05/F06). AI off/lỗi → viết tay bình thường.

Chi tiết đầy đủ: report.md + test.md kèm theo.

Nhánh mang theo harness carry-forward (labgrants + settings/urls +
packages __init__.py) + throttle scope `ai_refine` 30/hour (DEC-17).
