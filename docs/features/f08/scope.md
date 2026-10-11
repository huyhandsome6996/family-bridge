# F08 scope — Nhật ký riêng và nhật ký song hành (US-016, US-031)

Trang viết riêng owner-only (kể cả search/count); prompt theo chủ đề từ
published content (provider port); PATCH có expected_revision guard
(offline conflict → 409, không ghi đè mù). Share TỪNG TRANG + revision
hiện hành; sửa trang tự ẩn tới khi share lại. Song hành = phản hồi của
người nhận trên grant còn hiệu lực; reply KHÔNG mở đường đọc trang đã
revoke/sửa. Delete cascade sạch (không orphan). Không bắt scan/upload —
khuyến khích sổ giấy bằng wording.

Chi tiết: report.md + test.md. Nhánh mang harness carry-forward chuẩn.
