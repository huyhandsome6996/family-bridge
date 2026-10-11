# B16 scope — Quản trị sâu (US-014/020/024/025/041)

Authorization CHỈ qua named capabilities + scope + TTL (AdminCapabilityChecker
theo B00 protocol) — is_staff/superuser không có quyền gì nếu không có grant
(tested cả superuser). Final-admin guard: không tự cấp/tự thu hồi. Content
lifecycle draft→publish (immutable release)→retire + clone để sửa; stale
revision → 409. Settings typed: 3 bất biến an toàn (help enabled / pause
300 / no_auto_send) chặn server-side. Audit redacted by construction
(refs/outcome/reason — không body/token). Dashboard chỉ aggregate an toàn.
Mutation nhạy cảm đòi reason ≥10 ký tự (step-up MFA provider pending —
ghi gate). UI console trong Mini App hiện tab theo capability server xác nhận.

Phạm vi implementation: 6 capability primitives phủ lifecycle nội dung,
caps, settings, audit, dashboard. Full AF-01..06/CAP-22 catalog map lên
các primitives này ở B18 (ghi report). Chi tiết: report.md + test.md.
