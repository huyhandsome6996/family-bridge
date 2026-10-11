cat > docs/operations/zalo-submission-dossier-checklist.md <<'EOF'
# US-051 — Hồ sơ thử nghiệm & xét duyệt Zalo (chuẩn bị — KHÔNG submit)

## Inventory cần điền (Huy/Antigravity)

- [ ] App metadata: tên, mô tả, category, icon/logo nguồn đã duyệt
- [ ] Mini App ID + App ID ứng dụng cha (hai giá trị khác nhau)
- [ ] Quyền sử dụng: danh sách từng quyền + lý do + màn hình dùng
      (userInfo? storage? — không xin quyền không dùng)
- [ ] Privacy: mô tả dữ liệu thu, retention (chờ DEC-12), contact
- [ ] Backend HTTPS URL + origins (sau deploy Render)
- [ ] Phiên bản test: danh sách luồng + device matrix (US-049)

## Release checklist kỹ thuật

- [ ] env_check.py PASS trên môi trường deploy
- [ ] Migration chạy trên MySQL thật + drift check
- [ ] Health/ready trả đúng hợp đồng
- [ ] Backup/restore rehearsal PASS (US-018) + ledger replay
- [ ] Sample content gate (US-047) — nội dung mẫu thay bằng nội dung duyệt

## KHÔNG làm trong nhiệm vụ này

- Submit hồ sơ (Antigravity/Huy thực hiện), publish, trial trên user thật.
EOF
chmod +x ops/backup/*.sh ops/env_check.py && python3 ops/env_check.py --env-file /nonexistent.env 2>&1 | head -4; echo "exit=$?"
__workspace_agent_exit_code=$?
printf "\n<<workspace_agent_exit_code:1791726021976:%s>>\n" "$__workspace_agent_exit_code"
