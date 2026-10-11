# Report — F05 Hộp thư và phản hồi nhanh (B05)

- Feature ID / nhánh / US: F05 / feat/f05-inbox-replies / US-021, US-028
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **MessageTransport duy nhất** (`services/transport.py`): send qua một bảng
  `Message` duy nhất với 6 kind allowlist; F03 (thẻ), F04 (body cuối), F10
  (tín hiệu) sẽ gọi port này — không tạo bảng/endpoint gửi thứ hai. Không
  gọi AI/Zalo HTTP trong transaction.
- **Idempotency + payload hash**: UNIQUE(sender, idempotency_key); replay
  cùng key/cùng hash trả về đúng message cũ SAU khi auth; cùng key khác
  payload → 409 duplicate_key_payload_mismatch; client tự tính hash theo
  rule canonical, sai → 400 yêu cầu re-preview (server không tự sửa).
- **Connection guard**: gửi đòi connection ACTIVE ở generation hiện hành
  qua ConnectionReader port (F01 wire ở B18; harness dùng double
  labgrants.TestConnection); generation gửi lúc gửi được ghi lại.
- **Reply integrity**: reply_to chỉ nhận thư đang gửi cho mình; reply ngữ
  cảnh (journal_reply/mood_reply) phải qua context validator đã đăng ký —
  chưa wire thì fail-closed 400, grant hết hiệu lực → 403.
- **WF-07**: listening_signal KHÔNG bao giờ bị cooldown chặn; cooldown 300s
  là việc của F06, gọi transport sau guard riêng của nó.
- **Inbox**: GET /api/v1/messages cursor (created_at+id), metadata tối
  thiểu (không body trong list), lọc actor ở queryset TRƯỚC pagination;
  detail participant-only, 404 chống enumerate; read receipt chỉ người
  nhận, một lần giữ mốc sớm nhất; "sent" ≠ "read" tách bạch ở cả API lẫn UI.
- **Quick replies**: GET /api/v1/messages/quick-replies trả template
  published qua provider port (lọc audience); gợi ý KHÔNG tự thành reply —
  người nhận phải sửa/xác nhận bấm gửi (FL-11).
- **Unknown outcome**: GET /api/v1/operations/{key} owner-only để client
  chủ động kiểm tra trước khi gửi lại (không đổi key gây trùng lặp).
- **Mobile**: inbox (list 20/trang, MAX_WINDOW 200, poll 30s CHỈ khi tab
  visible, backoff nhân đôi ≤120s, cleanup timer khi unmount, nút tải thêm),
  message-detail (mở body sau server recheck, đánh dấu đã đọc khi hiển thị
  thật, trả lời bằng mẫu hoặc lời riêng — luôn explicit send).
- **Harness carry-forward** (từ B00 cho mọi feature branch): urls.py mount
  prefix khi routes rỗng; labgrants thêm TestConnection (test-only, branch
  chưa có F01 vẫn test đầy đủ luồng gửi/nhận).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f05_inbox
node --test packages/family_bridge_mobile/f05_inbox/tests/f05.test.mjs
# Suite rộng (harness + labgrants + f05):
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f05_inbox python manage.py test harness labgrants family_bridge_features.f05_inbox
```

Kết quả: f05 27/27 backend PASS; harness+labgrants+f05 55/55 PASS
(SQLite); mobile node 2/2 PASS.

## DSA

- Inbox: index (recipient, created_at, id) và (sender, created_at, id);
  cursor keyset pagination O(page) không OFFSET; list trả metadata (~12
  trường cố định), body chỉ ở detail → payload bounded.
- Query count test chứng minh page 20 và page 50 cùng số truy vấn (không
  N+1); lọc quyền bằng WHERE trước pagination/count.
- Idempotency lookup: UNIQUE index (sender, idempotency_key) — O(log N).
- Client giữ tối đa 200 item trong window (shift khi vượt), poll cancel
  khi ẩn trang, không cache private body ra storage.

## Security/privacy

- SEC-03/04: participant-only; admin/superuser bị chặn ở list (rỗng),
  detail/read (404) — có test riêng; 404 thay 403 chống enumerate.
- SEC-05: reject_unknown_fields; body cap 64 KiB; Unicode giữ nguyên,
  không truncate âm thầm.
- SEC-07/FL-08: idempotency + payload hash + atomic guard; same key khác
  payload bị từ chối rõ ràng.
- DEC-13 (OPEN): sau unlink, người nhận đọc lại body fail-closed;
  người gửi giữ bản đã gửi của chính mình. Chính sách tạm, chờ Thầy
  quyết ở US-023/DEC-13 — đã ghi trong report và code docstring.
- Không log token/mã; receipt chỉ trả message id; operation lookup
  stranger → not_found không leak.

## Kết quả

- PASS: 27 backend f05 + 55/55 harness suite + 2 mobile (SQLite local).
- NOT_RUN: MySQL race send/revoke + EXPLAIN thật (gated `FB_TEST_DB=mysql`
  — không có MySQL trong môi trường; suite race báo NOT_RUN trung thực).
- BLOCKED: none trong phạm vi module; F01/F07/F08/F16 wiring thuộc B18.

## Còn lại / Input cần

- B18: wire ConnectionReader thật (F01), context validator thật (F15
  policy + F07/F08 grant providers), quick-reply provider thật (B16
  published content), đăng ký f05 urls vào backend foundation.
- B16: nội dung mẫu phản hồi nhanh do Thầy duyệt (US-007) trước khi dùng
  production; templates hiện tại là TEST-ONLY trong labgrants.
- DEC-13: chốt chính sách đọc body sau unlink.
