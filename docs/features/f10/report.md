# Report — F10 Nút "Con cần được lắng nghe" (B10)

- Feature ID / nhánh / US: F10 / feat/f10-listening-signal / US-032
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Signal = message thường** qua MessageTransport port (kind
  listening_signal): một đường gửi duy nhất, explicit + idempotent;
  KHÔNG đồng nhất emergency; WF-07 đảm bảo ở F05 (kind này được miễn
  cooldown — F06 không liên quan, test ở B05 suite).
- **3 nhu cầu allowlist** (muon_tro_chuyen / muon_duoc_o_ben /
  muon_hen_gio) với label + canonical body server-side (copy DEC-17
  provisional, chờ Thầy duyệt US-005); send DTO chỉ (need, recipient) —
  test assert tập field, không draft/AI original kèm theo.
- **Preview → explicit send**: preview bind (need, recipient) + body
  canonical; gửi qua transport với connection guard (403 khi không có
  connection); replay cùng key → cùng message.
- **Không broadcast**: mỗi lần gửi đúng 1 recipient được chọn; không có
  endpoint gửi cho "mọi người thân/admin" (test chứng minh 2 lần gửi =
  2 recipients tường minh).
- **Ack recipient-only** (transport.mark_read): idempotent; ack không tự
  tạo reply; trả lời/đề nghị giờ là message thường do người nhận soạn —
  chọn "hẹn giờ" KHÔNG tự tạo school appointment (F12 tách rời).
- **Không phản hồi = trạng thái thụ động trung thực**: không job, không
  auto-escalate/forward (test); view trả read state thật; mobile hiển thị
  "không ai bảo đảm trả lời ngay" + đường tự liên hệ điểm tựa khác + F13
  (help link luôn hiển thị, cả khi gửi lỗi/chưa kết nối — node test).
- **Participant-only view**: stranger/admin 404; sender/recipient đọc được.
- Mobile signal.js: chips radiogroup nhu cầu, chọn recipient, preview,
  confirm guard, trạng thái sau gửi + help link; textContent mọi nơi.
- Registry F10 routes ""; harness carry-forward; transport double
  f10-specific (recipient-checked mark_read + find_message_for_viewer).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f10_signal
node --test packages/family_bridge_mobile/f10_signal/tests/f10.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f10_signal python manage.py test harness labgrants family_bridge_features.f10_signal
```

Kết quả: f10 15/15 backend PASS; suite rộng 37/37 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Không có model riêng (signal là Message của F05) — không nhân bảng;
  lookup qua transport port O(log N); payload DTO 2 field; mobile UI light.

## Security/privacy

- SEC-03/04: participant-only view; stranger/admin 404; ack recipient-only.
- SEC-05: allowlist need; unknown fields reject; DTO tối thiểu.
- WF-07: help bypass pause — signal không bao giờ bị cooldown chặn;
  help route luôn mở từ UI mọi trạng thái.
- Không hứa trả lời ngay; không auto-escalate/forward; "hẹn giờ" không
  đụng F12.

## Kết quả

- PASS: 15 backend f10 + 37/37 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL race send/ack (không DB).
- BLOCKED: none trong phạm vi module; transport thật (F05) + recipient
  lookup adapter + ConnectionReader thật (F01) wire ở B18; copy chính thức
  chờ US-005.

## Còn lại / Input cần

- B18: wire transport thật + adapter find_message_for_viewer trên F05
  Message (parses need hoặc thêm cột meta); ConnectionReader thật; nối
  signal page vào navigation (5 khu chính — Hộp thư/Home).
- US-005: duyệt wording 3 nhu cầu trước production.
