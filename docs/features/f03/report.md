# Report — F03 Bộ thẻ cảm xúc online (B03)

- Feature ID / nhánh / US: F03 / feat/f03-emotion-cards / US-027
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Catalog published-only** qua CardProvider port (B16 lifecycle nối ở B18;
  harness dùng double TEST-ONLY `labgrants.f03_fixtures.TestCardProvider`).
  Service defensively re-check shape/status — provider lỗi không thể lọt
  draft/retired. Filter group, window ≤ 50 (không dump toàn bộ).
- **Preview chính xác** (POST /cards/preview): bind (card, version,
  recipient); version lệch → 409 preview_stale; card không published → 404;
  không connection → 404. Preview chưa bao giờ gửi.
- **Gửi explicit qua MessageTransport port (F05)** — đúng nguyên tắc
  "không tạo bảng Message hoặc endpoint gửi thứ hai". Hash payload do
  SERVER tính từ composed body (author note nếu có, else body thẻ), nên
  replay cùng key với card/note khác bị transport từ chối 409. Connection
  + generation + idempotency guard nằm ở transport, không duplicate ở F03.
- **Snapshot write-once** (EmotionCardSnapshot, UNIQUE message_id):
  admin sửa/retire template sau không đổi thẻ đã gửi; get_or_create nên
  replay cùng key trả đúng snapshot cũ. Không có AI original đi kèm.
- **Gợi ý phản hồi** recipient-only theo group/audience (xưng hô "con/bố mẹ");
  gợi ý chỉ là text hiển thị — không tự thành reply (FL-11); phản hồi đi
  qua F05 messages endpoint với explicit confirm.
- **Participant-only authorization** tự chứa trên snapshot (sender_id/
  recipient_id ghi lúc gửi) — không đọc bảng feature khác; DEC-13 mirror:
  sau unlink người nhận mất thẻ, người gửi giữ bản đã gửi.
- **Mobile vanilla JS**: cards.js (chips filter, chọn thẻ, note textarea
  maxlength, recipient select, preview, confirm với double-submit guard,
  state stale/retired/empty/error trung thực), card-detail.js (render
  textContent — không innerHTML dữ liệu mạng; gợi ý → composer → explicit
  send qua inboxApi). Cleanup qua destroy().
- Registry: F03 routes "" (urls tự mang prefix `cards/`) đồng bộ pattern
  F05/F15; harness carry-forward giữ nguyên như B05.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f03_cards
node --test packages/family_bridge_mobile/f03_cards/tests/f03.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f03_cards python manage.py test harness labgrants family_bridge_features.f03_cards
```

Kết quả: f03 27/27 backend PASS; harness+labgrants+f03 55/55 PASS
(SQLite); mobile node 3/3 PASS.

## DSA

- Catalog: lọc in-memory trên provider (published content nhỏ, bounded
  window 50); không truy vấn chéo bảng; index snapshot (recipient_id,
  created_at) + (sender_id, created_at) cho tra cứu phía người nhận.
- Snapshot lookup theo UNIQUE message_id — O(log N).
- Payload: card view fixed-field; body thẻ là published template text
  (≤ vài trăm ký tự); author note ≤ 1000; suggestion ≤ 20 items, text ≤ 500.

## Security/privacy

- SEC-03: catalog chỉ published; draft/retired bị chặn 2 lớp (provider
  contract + defensive re-check).
- SEC-04: stranger/admin đọc snapshot/gợi ý → 404 (participant-only),
  có test riêng; is_staff mass assignment bị 400.
- SEC-05: reject_unknown_fields; bounds_backend (note 1000, card_id 64,
  suggestion text 500); không truncate âm thầm.
- FL-08/11: idempotency + explicit send; gợi ý không tự gửi; preview không gửi.
- Snapshot không chứa token/mã; lỗi không leak sự tồn tại (404 vs 403
  phân biệt participant).

## Kết quả

- PASS: 27 backend f03 + 55/55 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL race (không DB); race send/retire đồng thời thật thuộc
  B18 với MySQL gate.
- BLOCKED: none trong phạm vi module; wiring B16 content + F05 transport
  + F01 connection ở B18 (registry đăng ký tường minh, fail-closed 503
  khi quên wire — có test).

## Còn lại / Input cần

- B18: wire transport thật (f05 MessageTransportService), CardProvider
  thật (B16 published content sau khi Thầy duyệt US-007), ConnectionReader
  thật (F01), đăng ký f03 urls vào backend foundation.
- B16: nhóm/group card + lời gợi ý phản hồi là nội dung duyệt (US-007);
  fixtures hiện tại chỉ là dữ liệu TEST-ONLY, không dùng production.
