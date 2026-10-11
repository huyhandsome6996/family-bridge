# Runbook vận hành (B17) — KHÔNG tự chạy cloud/production

## Backup / Restore (US-018)

- `ops/backup/backup.sh` — mysqldump single-transaction; secrets qua env
  out-of-band; kiểm tra kích thước tối thiểu; exit non-zero khi lỗi.
- `ops/backup/verify_restore.sh` — rehearsal CHỈ vào DB cô lập (từ chối
  tên nhìn như production); sau restore PHẢI replay deletion/revocation
  ledger (F15/B18) trước khi phục vụ — raw restore không hồi sinh quyền
  đã thu hồi.
- **PENDING duyệt**: RPO/RTO mục tiêu, cadence, owner, storage mã hóa và
  key ownership (DEC-12 mở) — script không tự chạy cloud.

## Env hardening

- `ops/env_check.py` — kiểm tra presence/shape (DEBUG=False, secret
  strength, https CORS, least-privilege DB user, Zalo env) KHÔNG in giá
  trị secret. Chạy trong CI + trước deploy.

## CI least-privilege

- `.github/workflows/tests.yml`: `permissions: contents: read`; KHÔNG
  dùng `pull_request_target` với secrets; artifacts gắn SHA (nếu thêm).
- **Trước khi guard production**: pin actions theo full commit SHA
  (hiện là major tag + ghi chú).

## Bounded purge (task dọn dẹp)

- Nguyên tắc: mọi purge PHẢI có `--dry-run` mặc định, phạm vi chặn
  (bounded), status output; KHÔNG scheduler tự gửi nháp/tâm sự. Tooling
  chi tiết sẽ ghép với deletion hooks F15 ở B18.

## US-019 — notification ngoài app (nghiên cứu, conditionally disabled)

- Xem `docs/operations/zalo-notification-research.md`: chỉ nghiên cứu +
  adapter/feature gate; KHÔNG fake push; KHÔNG chặn hộp thư nội bộ.

## US-051 — hồ sơ kỹ thuật Zalo

- Xem `docs/operations/zalo-submission-dossier-checklist.md`: inventory
  quyền/nguồn + release checklist; KHÔNG tự submit.
