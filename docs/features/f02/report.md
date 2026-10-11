# Report — F02 Chương trình đồng hành 4 tuần (B02)

- Feature ID / nhánh / US: F02 / feat/f02-four-week-program / US-036, US-044
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Tự nguyện + version pin**: enroll pin revision; re-publish tạo
  revision MỚI trong khi các revision đã publish vẫn tra cứu được
  (fixture trung thực với contract immutability) — enrollment KHÔNG bị
  migrate thầm; re-enroll là hành động tường minh (test pin giữ nguyên +
  catalog ra revision mới + re-pin sau khi chọn).
- **Cả 4 tuần đều xem được** (US-036 mục 1): weeks trả locked=false cho
  mọi tuần; suggested_week chỉ mang tính thông tin (first incomplete);
  opt-out → 404 trung thực (không có enrollment), rejoin tự nguyện.
- **Progress riêng tư** (WeekProgress UNIQUE participant+activity):
  done/skipped/reset (reset xóa sạch); activity phải thuộc chương trình
  đã pin (400 nếu ngoài); stranger không xem được gì (404).
- **Thỏa ước bất biến theo revision** (US-036 mục 8): AgreementAcceptance
  UNIQUE (participant, program, agreement_revision) — idempotent; MỖI
  người tự accept (không có endpoint ký hộ — gửi participant_id → 400
  unknown field); template sửa → agreement revision mới → phải accept
  lại (test old-binding + fresh-required); hai acceptance cùng revision
  là hai row độc lập của hai người.
- **Sổ giấy**: guide text tùy chọn ghi nhận, không bắt upload (test
  wording + không có upload endpoint).
- **Không nhân bản F09**: joint_activity_keys tham chiếu qua key; invite
  2 chiều dùng F09 (wiring B18 ghi trong report); WeekProgress chỉ ghi
  nhận cá nhân.
- Mobile program.js: enroll/opt-out/agreement/weeks với wording tự nguyện
  rõ ràng; textContent; registry F02 routes ""; harness carry-forward +
  content double giữ lịch sử revision.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f02_program
node --test packages/family_bridge_mobile/f02_program/tests/f02.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f02_program python manage.py test harness labgrants family_bridge_features.f02_program
```

Kết quả: f02 12/12 backend PASS; suite rộng 34/34 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- UNIQUE(participant, program) enrollment; UNIQUE(participant, program,
  activity) progress; UNIQUE(participant, program, agreement_revision)
  acceptance — mọi lookup O(log N); weeks view gom 1 query progress +
  provider catalog (bounded).

## Security/privacy

- SEC-03: published-only; revision pin trung thực (không silent migrate).
- SEC-04: progress/agreement per-participant; không có family-wide reads
  (stranger 404); không ai ký hộ (structure test).
- Tự nguyện: opt-out không phạt; không streak/ranking; gợi ý không khóa.
- Nội dung 4 tuần là TEST-ONLY synthetic — production cần Thầy duyệt
  (US-009) qua B16 lifecycle.

## Kết quả

- PASS: 12 backend f02 + 34/34 harness suite + 3 mobile (SQLite local).
- NOT_RUN: none đáng kể.
- BLOCKED: none trong phạm vi module; program content thật (US-009) +
  F09 invites wiring ở B18.

## Còn lại / Input cần

- B18: wire program provider thật (B16 lifecycle); nối joint activities
  qua F09 invites; nối program page vào navigation; agreement template
  chính thức chờ Thầy duyệt.
