# Report — F14 Khảo sát tự nguyện và báo cáo nghiên cứu (B14)

- Feature ID / nhánh / US: F14 / feat/f14-surveys-safe-research / US-040, US-045
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Consent tách rời** (US-040): ResearchConsent per purpose; grant/
  withdraw tường minh (mở màn khảo sát KHÔNG tự ghi consent — test);
  skip/withdraw không ảnh hưởng tính năng khác (f14 độc lập, wording +
  cấu trúc); withdraw → submit bị chặn 403 và loại khỏi báo cáo NGAY
  (report tính live trên consent active).
- **Form typed versioned**: provider port (B16 — US-010 duyệt ở B18);
  question kinds allowlist scale_1_5/choice/number — form chứa text kind
  bị từ chối TOÀN BỘ (fail closed, test); response bind đúng revision,
  phase đúng form; 1 response/(participant, form, phase) — resubmit 409
  reason already_submitted; answers validated theo spec (range/choices/
  required/unknown q).
- **Raw denial**: KHÔNG endpoint export/raw (test cấu trúc); raw answers
  chỉ nằm trong backend; admin/superuser có đúng cùng aggregate view
  (test admin == user) — không bypass.
- **Aggregate report** (US-045): DEC-15 gate — policy unset → 403
  report_policy_unset; synthetic policy cho tests (SyntheticPolicy trong
  labgrants, rõ ràng TEST-ONLY); k-suppression (count < k → suppressed)
  + complementary suppression (một nhóm nhỏ → ẩn cả dimension vì nhóm
  còn lại sẽ lộ exact); report payload chỉ mean/distribution/count +
  policy_version + minimum_group_size — không answers, không participant
  (test assert).
- **Chống differencing**: throttle scope survey_report 20/hour (harness
  settings); report/response cùng scope.
- **Deletion hook** apply_user_deletion (F15/WF-21): xóa responses +
  consents.
- Mobile surveys.js: consent toggle rõ, form renderer typed (chips scale/
  choice, number input — KHÔNG textarea), wording tự nguyện; textContent;
  registry F14 routes ""; settings carry-forward + survey_report rate.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f14_surveys
node --test packages/family_bridge_mobile/f14_surveys/tests/f14.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f14_surveys python manage.py test harness labgrants family_bridge_features.f14_surveys
```

Kết quả: f14 17/17 backend PASS; suite rộng 39/39 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- UNIQUE (participant, form, phase); index (form_key, phase) cho report
  query; aggregation O(N) trên responses của 1 form (bounded theo cohort);
  không cache (withdrawal hiệu lực tức thì — trade-off ghi rõ).

## Security/privacy

- SEC-13: không raw export; admin không bypass (test); paired pre/post
  chỉ là nhãn phase — pseudonymous mapping kín CHƯA implement (chờ
  protocol duyệt, ghi ở dưới).
- DEC-15: policy unset → không live report (engine vẫn test được bằng
  synthetic policy — đúng yêu cầu).
- Consent version bump khi grant lại (không âm thầm).
- Không text tự do trong khảo sát.

## Kết quả

- PASS: 17 backend f14 + 39/39 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL withdrawal race mid-export (không DB).
- BLOCKED: paired pre/post pseudonymous mapping (chờ research protocol
  được duyệt — US-010); policy thật (DEC-15).

## Còn lại / Input cần

- B18: wire form provider thật (B16 lifecycle, US-010 duyệt); policy
  reader thật khi DEC-15 chốt; đăng ký deletion hook vào F15.
