# Report — B16 Quản trị sâu (feat/admin-deep-management)

- Feature ID / nhánh / US: B16 / feat/admin-deep-management / US-014, US-020, US-024, US-025, US-041
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Authorization CHỈ qua named capabilities** (AdminCapabilityService
  implements B00 AdminCapabilityChecker protocol): is_staff/superuser
  KHÔNG có quyền gì nếu không có grant (test chứng minh cả superuser
  nhận 404); không-capability → 404 (admin surface vô hình, không enum).
- **Final-admin guard**: không thể tự grant/tự revoke (400
  cannot_grant_to_self, test); bootstrap admin đầu tiên bằng operator
  process out-of-band (documented, không public registration).
- **TTL + revocation**: grant có expires_at (1..365 ngày); hết hạn →
  mất quyền (test); revoke với reason → mất quyền ngay (test).
- **Content lifecycle** (US-020/024/041): draft → publish (immutable
  release, expected_revision guard → 409 stale) → retire (reason bắt
  buộc ≥10 ký tự); sửa published = clone draft mới (revision tăng) —
  published bất biến (test); publish cần capability RIÊNG
  (content.publish ≠ content.manage — test least privilege).
- **Settings typed** (US-025): 3 bất biến an toàn (help_enabled /
  pause_seconds=300 / no_auto_send) chặn server-side 400
  setting_is_immutable (test cả 3); setting thường cập nhật được; không
  nhập SQL/JS/URL tự ý (JSONField typed, key validate).
- **Audit redacted** (SEC-22): refs/outcome/reason-only — test assert
  fixed field set + không body leak; bounded 50.
- **Dashboard an toàn**: chỉ aggregate counts, không private body/ranking.
- **Mutation nhạy cảm đòi reason** (grant/revoke/retire/setting) — step-up
  MFA provider PENDING (ghi gate; hiện fail-closed khi thiếu reason).
- **UI console trong Mini App** (US-014): admin.js hiện tab THEO capability
  server xác nhận; settings bất biến render read-only; mọi quyết định
  quyền thuộc server (UI chỉ mirror); textContent.
- Registry B16 routes ""; harness carry-forward.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh admin_core
node --test packages/family_bridge_mobile/admin_core/tests/b16.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=admin_core python manage.py test harness labgrants family_bridge_features.admin_core
```

Kết quả: B16 13/13 backend PASS; suite rộng 35/35 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Grant lookup index (user, capability) + partial UNIQUE active grant;
  lifecycle transitions O(1) theo pk; audit append-only index
  (created_at); list bounded 50.

## Security/privacy

- SEC-04: capability-only authorization; role strings vô nghĩa (test);
  scope_type primitives (global/school) sẵn sàng cho school scoping B18.
- SEC-22: audit redacted; không token/body/mã trong trail.
- WF-13: 3 bất biến an toàn chặn server-side (test).
- Step-up: reason bắt buộc; MFA provider chờ input thật (external-inputs).
- KHÔNG có endpoint impersonation/đọc dữ liệu riêng tư — đúng phạm vi.

## Kết quả

- PASS: 13 backend B16 + 35/35 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL final-admin concurrent revoke race (không DB).
- BLOCKED (đúng phạm vi): school scoping thật + full CAP-22 catalog map
  + step-up MFA + staff assignment UI — cần B18 + input Thầy/đơn vị.

## Còn lại / Input cần

- B18: nối AdminCapabilityChecker vào mọi module cần (staff directory
  F12, content providers); school scope refs thật; mở rộng CAP catalog
  chi tiết (AF-01..06) trên primitives đã có; step-up provider (MFA)
  khi có.
