# Report — B17 Vận hành / backup / hardening (chore/operations-backup-hardening)

- US: US-018 (backup/restore), US-019 (notification — nghiên cứu), US-051 (hồ sơ — chuẩn bị)
- Baseline SHA (B00): `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline`

## Đã có

- **backup.sh**: mysqldump --single-transaction; secrets qua env out-of-band
  (không CLI args/repo); kiểm tra dump tối thiểu; không tự chạy production.
- **verify_restore.sh**: rehearsal CHỈ vào DB cô lập (từ chối tên *prod*);
  sau restore yêu cầu replay deletion/revocation ledger trước khi phục vụ
  (WF-21 — raw restore không hồi sinh quyền thu hồi).
- **env_check.py**: validator read-only (DEBUG=False, secret ≥32 không
  default, CORS https, DB least-privilege, Zalo env) — không in secret;
  smoke test pass (exit 1 khi thiếu env — đúng thiết kế).
- **CI tests.yml**: permissions contents:read; không pull_request_target+secrets;
  chạy toàn bộ feature-lab harness + node tests; NOTE pin actions theo
  SHA trước khi guard production.
- **Runbook**: RPO/RTO/cadence/owner PENDING (DEC-12) ghi rõ; bounded purge
  principles (dry-run mặc định); rehearsal isolated.
- **US-019 doc**: nghiên cứu notification — feature gate OFF, không fake
  push, không chặn F05; adapter kế hoạch module_unavailable.
- **US-051 checklist**: inventory + release checklist; KHÔNG submit.

## Lệnh kiểm tra

```bash
python3 ops/env_check.py --env-file /nonexistent.env   # expect exit 1 + danh sách MISSING
bash -n ops/backup/backup.sh ops/backup/verify_restore.sh   # syntax check
```

Kết quả: env_check smoke PASS (exit 1 expected); bash -n PASS (không lỗi
cú pháp); backup/restore thật NOT_RUN (cần MySQL + operator — đúng phạm vi).

## Kết quả / Còn lại

- PASS: artifacts + env_check smoke + syntax.
- NOT_RUN: backup/restore thật (operator + MySQL), rehearsal cloud.
- PENDING duyệt: RPO/RTO/cadence/storage encryption (DEC-12); actions SHA pin.
- Còn lại: B18 nối ledger replay command thật; notification adapter khi
  US-019 đủ điều kiện; submit hồ sơ do Huy/Antigravity.
