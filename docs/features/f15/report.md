# Report — F15 Quyền riêng tư / thu hồi / hủy kết nối / xóa dữ liệu (B15)

- Feature ID / nhánh / US: F15 / feat/f15-privacy-revocation-deletion / US-012, US-017, US-023
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Access policy deny-by-default** (`services/registry.py:can_view_item`):
  provider grant phải đăng ký tường minh; kiểm tra (item, recipient,
  approved_revision) CHÍNH XÁC + connection active generation hiện hành qua
  ConnectionReader; không đăng ký = deny; sai revision/recipient/revoked =
  deny. API trả 404 chống enumerate.
- **Grant provider + deletion hook registry** (allowlist dotted-path, không
  eval/upload; validate protocol). F07/F08/F05/F04... đăng ký ở tích hợp B18.
- **Deletion workflow** (`services/deletion.py`): requested → verified →
  processing → completed | failed_needs_action (truthful: một hook fail =
  cả request failed, không "đã xóa hết"); cancel chỉ khi requested;
  receipt mã một-lần (hash at rest); idempotent khi còn request mở.
- **Ledger append-only** (DeletionLedgerEvent) mọi transition: requested/
  cancelled/applied/failed/grant_revoked/consent_withdrawn; payload không
  chứa body; restore replay (`replay_ledger_for_restore`) re-apply revoke
  + deletion idempotent — "backup restore không hồi sinh quyền đã thu hồi".
- **PrivacyCase** metadata cho handler (B16 assign); không mở body.
- **API**: privacy/overview, grants/{type}/{id}/revoke, deletion-requests
  (+detail owner-only KHÔNG admin bypass — cả is_staff/superuser nhận 404),
  cancel, consents/{purpose}/withdraw (fail-closed 503 khi chưa wire port).
- **Mobile**: trang quyền riêng tư (list shared + thu hồi từng mục, yêu cầu
  xóa với receipt một-lần, wording trung thực).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f15_privacy
node --test "packages/family_bridge_mobile/f15_privacy/tests/*.test.mjs"
```

Kết quả: backend 23/23 PASS (SQLite); mobile 3/3 PASS.

## DSA

- can_view: O(log N) qua index (owner, item_type) + filter revoked_at.
- Ledger append-only BigAuto seq + index (target_user, occurred_at, seq);
  replay quét toàn bộ event của 1 user (bounded theo user, không full table).
- Deletion scope JSON ≤ 10 categories allowlist; payload ledger ≤ 8 KiB.

## Security/privacy

- SEC-03/08 (deny-by-default + stale revision + generation check), SEC-04
  (admin không bypass owner ACL — test chứng minh superuser nhận 404),
  SEC-05 (unknown fields reject), SEC-21 (ledger + replay + truthful status),
  SEC-22 (payload tối thiểu, không body/token), WF-04 (grant từng item),
  WF-21 (restore replay).
- Race revoke-vs-read: thiết kế select_for_update ở provider revoke (test
  MySQL-gated sẽ bổ sung khi có DB — NOT_RUN).

## Kết quả

- PASS: 23 backend + 3 mobile (SQLite local).
- NOT_RUN: MySQL race, restore drill thật (thuộc B17 runbook với operator).
- BLOCKED: consent store thật (F01 port wiring ở B18), retention thật (DEC-12).

## Còn lại / Input cần

- F07/F08 đăng ký grant provider của chúng (MoodShare/JournalShare) khi
  các nhánh đó có code; B16 gán handler PrivacyCase; DEC-12 chốt retention
  trước khi nhận dữ liệu thật.
