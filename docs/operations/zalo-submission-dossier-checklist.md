# US-051 — Hồ sơ thử nghiệm & xét duyệt Zalo (chuẩn bị — KHÔNG submit)

## Inventory cần điền (Huy/Antigravity)

- [ ] App metadata: tên, mô tả, category, icon/logo nguồn đã duyệt
- [ ] Mini App ID + App ID ứng dụng cha (hai giá trị khác nhau)
- [ ] Quyền sử dụng: từng quyền + lý do + màn hình dùng (không xin quyền không dùng)
- [ ] Privacy: dữ liệu thu, retention (chờ DEC-12), contact
- [ ] Backend HTTPS URL + origins (sau deploy Render)
- [ ] Phiên bản test: luồng + device matrix (US-049)

## Release checklist kỹ thuật

- [ ] env_check.py PASS trên môi trường deploy
- [ ] Migration chạy trên MySQL thật + drift check
- [ ] Health/ready đúng hợp đồng
- [ ] Backup/restore rehearsal PASS (US-018) + ledger replay
- [ ] Sample content gate (US-047)

## KHÔNG làm trong nhiệm vụ này

- Submit hồ sơ (Antigravity/Huy thực hiện), publish, trial user thật.
