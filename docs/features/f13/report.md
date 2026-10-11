# Report — F13 Trang tìm trợ giúp độc lập (B13)

- Feature ID / nhánh / US: F13 / feat/f13-help-directory / US-039
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **PUBLIC allowlist endpoint** (GET /api/v1/help/directory, AllowAny):
  thiết kế cố ý — trang trợ giúp phải mở cả khi auth/session/backend lỗi
  (WF-06/SEC-24). Đúng 1 endpoint, không telemetry/history/purpose.
- **Verified-only filter 2 lớp**: provider contract trả verified; service
  re-filter (verified flag, retired status, review_due) — provider lỗi
  không thể lộ số chưa xác minh; review_due parse defensively (malformed =
  hết hạn).
- **Hết hạn xác minh**: ẨN số điện thoại, giữ entry với trạng thái
  verification_expired — không giữ số stale, không bịa số (test).
- **Fallback đã xác minh kèm build** (provenance + review_due + version):
  dùng khi provider fail; fallback hết hạn → guidance-only (không có field
  phone trong response — test); provenance ghi rõ KHÔNG phải danh bạ
  production, cần xác minh lại (external-inputs.md).
- **open_now theo timezone đầu mối** (server clock, deterministic test
  với UTC↔UTC+7 biên 8-17).
- **Mobile help.js**: tap-to-call qua SDK openPhone CHỈ trong click
  listener; openPhone resolve ≠ nghe máy (wording trung thực); states
  loading/empty/offline/ ngoài giờ/hết hạn; không gate nào; textContent.
- Registry F13 routes ""; harness carry-forward; không cần migration
  (read-only port consumer).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f13_help
node --test packages/family_bridge_mobile/f13_help/tests/f13.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f13_help python manage.py test harness labgrants family_bridge_features.f13_help
```

Kết quả: f13 7/7 backend PASS; suite rộng 29/29 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Không model; provider list bounded bởi provider (≤ 50 defensive slice
  không cần — double trả 5); sort theo tên; O(N) với N nhỏ.

## Security/privacy

- SEC-24/WF-06: public allowlist 1 endpoint duy nhất; verified fields only.
- Không lưu lịch sử gọi/purpose; không telemetry thêm (test cấu trúc urls).
- Không gate (cooldown/AI/khảo sát) — test cấu trúc + wording.
- Fallback provenance trung thực, không fake "đã duyệt".

## Kết quả

- PASS: 7 backend f13 + 29/29 harness suite + 3 mobile (SQLite local).
- NOT_RUN: device call thật (Antigravity/Zalo Android-iOS).
- BLOCKED: none trong phạm vi module; DirectoryReader thật (B12/B16
  content sau khi Thầy xác minh US-006) wire ở B18.

## Còn lại / Input cần

- B18: wire DirectoryReader thật; giữ help link từ mọi màn (nav B18);
  số liệu đầu mối thật do Thầy/đơn vị xác minh (US-006) trước production.
