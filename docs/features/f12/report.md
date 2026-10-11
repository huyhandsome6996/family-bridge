# Report — F12 Liên hệ thầy cô và yêu cầu gặp riêng (B12)

- Feature ID / nhánh / US: F12 / feat/f12-school-support-appointments / US-038, US-046
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Danh bạ trường (US-038)**: GET /appointments/directory (auth) qua
  DirectoryReader port — verified-only defensively re-filtered (giống
  F13), review_due hết hạn ẩn số; gọi qua SDK openPhone chỉ khi user bấm
  (mobile source-assert); off-hours không hứa trực 24/7.
- **Scheduling CÓ ĐIỆU KIỆN (US-046)**: staff directory gate — unwired
  HOẶC rỗng → 503 module_unavailable reason scheduling_no_staff cho MỌI
  endpoint scheduling (kể cả tạo request, không dồn request mồ côi);
  production chỉ bật khi có staff/operator thật; tests dùng synthetic
  staff (TEST-ONLY rõ ràng).
- **State machine đầy đủ**: submitted → assigned (claim bởi operator có
  capability) → slot_proposed (slot UTC 30') → scheduled (requester accept)
  → completed; cancel idempotent; decline → assigned (đề xuất lại).
- **Không báo có lịch khi mới submit**: response propose ghi rõ note
  "chưa có lịch hẹn nào cho tới khi học sinh xác nhận"; UI wording giống.
- **Stale acceptance**: slot mới supersede slot cũ (status superseded);
  accept slot cũ → 409 preview_stale "newer_proposal_exists" (test).
- **Overlap atomic**: propose dùng select_for_update + query overlapping
  accepted slot cùng handler (capacity 1) → 409 slot_unavailable
  (MySQL race thật: NOT_RUN không DB).
- **Notes assigned-only**: note chỉ requester + handler HIỆN TẠI có
  capability (read-time check) — revoke staff mất quyền đọc ngay (test);
  school-scope không tự mở toàn bộ request (claim/queue không-capability
  → 404, test).
- **Mobile appointments.js**: directory + call, request form, state
  timeline tiếng Việt trung thực, accept/decline slot, trạng thái
  scheduling tắt là first-class; textContent; registry F12 routes "".
- Harness: carry-forward chuẩn + f12_fixtures (TestStaffDirectory với
  revoke + TestSchoolDirectory).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f12_appointments
node --test packages/family_bridge_mobile/f12_appointments/tests/f12.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f12_appointments python manage.py test harness labgrants family_bridge_features.f12_appointments
```

Kết quả: f12 14/14 backend PASS; suite rộng 36/36 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Slot index (handler_id, start_at) cho overlap query; propose bọc
  select_for_update trên slot set (atomic; capacity 1); request index
  (requester, updated_at)/(handler_id, status) cho list/queue bounded 20.

## Security/privacy

- SEC-03/04: note assigned-only read-time; admin không capability → 404
  (không bypass); queue không lộ scope trường; stranger 404.
- Gate trung thực: không staff = không hứa; directory không lộ số giả.
- Slot UTC chuẩn; đổi giờ phải qua propose mới + accept mới (revision).

## Kết quả

- PASS: 14 backend f12 + 36/36 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL double-book race thật (không DB — logic select_for_update
  có sẵn, sẽ chạy khi có MySQL gate); device call thật (Antigravity).
- BLOCKED: none trong phạm vi module; staff directory thật (B16 capability
  + staff thật của đơn vị) và school directory thật (US-006 xác minh) wire ở B18.

## Còn lại / Input cần

- B18: wire staff directory thật (B16 capability assignments) + school
  directory thật; nối appointments page vào navigation; assignment thay
  handler bởi quản lý có quyền (B16 mở rộng) — v1 dùng self-claim.
