# F03 scope — Bộ thẻ cảm xúc online (US-027)

Thẻ từ published content (provider port; B16 lifecycle nối ở B18). Chọn thẻ
→ lời cuối tùy chọn → người nhận kết nối active → preview chính xác
(card + version + recipient) → bấm xác nhận mới gửi. Gửi QUA MessageTransport
port (owner F05) — KHÔNG bảng Message thứ hai, KHÔNG endpoint gửi thứ hai.

Chi tiết đầy đủ: report.md + test.md kèm theo.

Nhánh mang theo harness carry-forward như B05 (labgrants + TestConnection
test-only). Card catalog/test doubles đặt ở labgrants (nhãn TEST-ONLY rõ).
