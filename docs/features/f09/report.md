# Report — F09 Hoạt động kết nối và bài học ngắn (B09)

- Feature ID / nhánh / US: F09 / feat/f09-activities-micro-lessons / US-037
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Catalog published-only** qua PublishedContentReader port (B16 nội dung
  thật ở B18; F02 refs qua version refs — không nhân bản program/enrollment
  logic): kind activity | micro_lesson; audience filter (student/caregiver/
  joint/neutral); ≤50; retired/draft ẩn (test).
- **Bài học 60 giây** cho người chăm sóc (kind micro_lesson): text/card nhẹ
  — mobile node test chặn video/autoplay (US-037 mục 2).
- **Progress riêng tư từng participant** (done/skipped, update_or_create
  UNIQUE(participant, content_key)): stranger list rỗng; mark đòi content
  còn published đúng revision pin — retired chặn ngay 404 (pinned
  retirement honored).
- **Invite 2 chiều** (SharedActivityInvite): mời đúng 1 người đã kết nối
  (ConnectionReader); partial UNIQUE open-invite; INVITEE-only respond
  (inviter tick hộ → 404, test ownership); mỗi người tự ghi response
  riêng (my-response) — invitee phải accept trước; inviter cancel khi
  pending; decline/cancel trạng thái trung thực.
- **Không tự động gì**: không endpoint reminder/schedule (test cấu trúc
  urls); không autoplay/ép hoạt động; bỏ qua/quay lại tự nhiên.
- Mobile activities.js: chips kind, catalog + tick riêng, mời làm cùng,
  invites 2 chiều với hành động đúng vai; textContent; registry F09
  routes ""; harness carry-forward chuẩn.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f09_activities
node --test packages/family_bridge_mobile/f09_activities/tests/f09.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f09_activities python manage.py test harness labgrants family_bridge_features.f09_activities
```

Kết quả: f09 13/13 backend PASS; suite rộng 35/35 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- UNIQUE(participant, content_key) update_or_create O(log N); partial
  UNIQUE open-invite; list index (participant/inviter/invitee,
  updated_at) bounded 50; catalog lọc in-memory trên provider bounded.

## Security/privacy

- SEC-03: published-only 2 lớp; retire chặn progress/invite.
- SEC-04: progress/invites owner-scoped; respond invitee-only; stranger rỗng.
- SEC-05: bounds + unknown fields reject; status allowlist.
- Tự nguyện: không reminder, không streak, không xếp hạng.

## Kết quả

- PASS: 13 backend f09 + 35/35 harness suite + 3 mobile (SQLite local).
- NOT_RUN: none đáng kể (không có race ngoại lệ; MySQL race invite có thể
  thêm ở B18 nếu cần).
- BLOCKED: none trong phạm vi module; content thật (US-009 duyệt) +
  ConnectionReader thật (F01) + content reader thật (B16) wire ở B18.

## Còn lại / Input cần

- B18: wire PublishedContentReader thật (B16 content, US-009 duyệt);
  ConnectionReader thật; nối F02 program refs qua version refs; nối
  activities page vào navigation.
