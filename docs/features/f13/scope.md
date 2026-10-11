# F13 scope — Trang tìm trợ giúp độc lập (US-039)

PUBLIC allowlist endpoint duy nhất của app (không auth — theo thiết kế
WF-06/SEC-24): verified contacts + fallback đã xác minh kèm provenance/
review_due; hết hạn xác minh → ẨN số + trạng thái trung thực, không bịa số.
Fallback hết hạn → guidance-only. open_now tính theo timezone của đầu mối
(server clock). Không lưu lịch sử gọi/purpose; không gate (cooldown/AI/
khảo sát/chương trình). Gọi chỉ khi user bấm (SDK openPhone); openPhone
resolve ≠ cuộc gọi được nghe máy. UI light, textContent.

Chi tiết: report.md + test.md. Nhánh mang harness carry-forward chuẩn.
