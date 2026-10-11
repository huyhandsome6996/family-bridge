# Report — F06 Nháp và tạm dừng 5 phút (B06)

- Feature ID / nhánh / US: F06 / feat/f06-drafts-five-minute-pause / US-030, US-034
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Draft author-only** (Draft + DraftPreview): kind text/emotion_card;
  bounds backend; unknown fields reject — field linkage AI
  (suggestion_id/original_text) bị chặn, draft chỉ chứa nội dung cuối tác
  giả chọn (không trộn AI original vào shared payload).
- **Pause 300 giây server-decided** (DEC-03, WF-13): server ghi
  started_at/deadline; re-pause KHÔNG reset/gia hạn (test sau 60s vẫn
  deadline gốc); edit bump revision nhưng cố ý không đổi deadline; không
  có endpoint cấu hình — số 300 bất biến trong scope này; admin không có
  đường đọc draft (404, có test).
- **Hết chờ KHÔNG tạo gì**: không message, không job, không cron —
  test advance 301s chứng minh 0 sender call, status paused, list bình thường.
- **Preview** chỉ khi now ≥ deadline (299 → 409 cooldown_active với
  remaining_seconds; 300/301 → 200); bind (revision, recipient, payload
  hash); preview mới supersede preview cũ; không tự gửi.
- **Confirm-send = lần xác nhận cuối**: thứ tự guard trung thực —
  sent → preview missing → used → revision lệch → recipient lệch →
  deadline → sender port (connection guard nằm ở production path); một
  preview dùng một lần; failure để draft nguyên vẹn.
- **Per-kind sender port**: kind text → F05 MessageTransport, kind
  emotion_card → F03 CardSendService (B18 wiring; harness dùng
  FakeKindSender TEST-ONLY theo đúng hợp đồng connection guard);
  chưa wire → 503 sender_not_wired fail-closed (có test).
- **Deletion hook** `apply_user_deletion` (F15/WF-21 wiring ở B18): xóa
  sạch drafts+previews theo user — có test.
- **Mobile drafts.js**: countdown từ (deadline, server_time) + monotonic
  elapsed (performance.now) — đổi giờ thiết bị không rút ngắn (pure
  function + 4 node tests gồm 299/300/301 và wall-clock independence);
  timer cleanup khi unmount; notice trung thực mọi trạng thái
  (cooldown/stale/revoked/offline).
- Registry F06 routes "" (urls mang prefix drafts/).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f06_drafts
node --test packages/family_bridge_mobile/f06_drafts/tests/f06.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f06_drafts python manage.py test harness labgrants family_bridge_features.f06_drafts
```

Kết quả: f06 21/21 backend PASS; suite rộng 49/49 PASS (SQLite); mobile
node 4/4 PASS.

## DSA

- Draft index (author, updated_at, id) cho list bounded 20; preview index
  (draft, created_at); confirm dùng select_for_update trên preview chống
  double-confirm race (MySQL race suite: NOT_RUN không DB).
- Clock inject qua registry (ControlledClock tests; SystemClock production);
  mọi quyết định thời gian dùng clock, không dùng datetime.now rải rác.

## Security/privacy

- SEC-04: author-only; cross-user/caregiver/admin 404 — ownership check
  TRƯỚC validation để không leak thông tin; admin không có nút đổi 300s
  (không endpoint).
- SEC-05: unknown fields reject; body ≤ 4000 không truncate; title ≤ 200.
- DEC-03/WF-13: 300s server-side; client không thể tự rút ngắn (node test).
- WF-07: help/listening không đi qua F06 — cooldown không chặn đường trợ giúp.
- US-034 (title cũ "Thầy chỉnh khoảng chờ"): supersedes — ghi trong
  trello-update-queue.md, không tự sửa thẻ Trello.

## Kết quả

- PASS: 21 backend f06 + 49/49 harness suite + 4 mobile (SQLite local).
- NOT_RUN: MySQL race confirm đồng thời (không DB).
- BLOCKED: none trong phạm vi module; sender thật + pause state vào UI
  soạn thảo chung thuộc B18.

## Còn lại / Input cần

- B18: wire sender text→f05 transport + emotion_card→f03 CardSendService;
  đăng ký apply_user_deletion vào F15 deletion hooks; ghép drafts page
  vào composer dùng chung (F04 handoff + F03 card picker).
