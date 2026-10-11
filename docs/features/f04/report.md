# Report — F04 AI hỗ trợ diễn đạt (B04)

- Feature ID / nhánh / US: F04 / feat/f04-ai-expression / US-029, US-033
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **AiExpressService**: refine (idempotent theo author+key; replay KHÔNG
  gọi provider lần 2; same key khác text → 409), decide (accept/discard
  author-only, một chiều), list/get author-only, status trung thực.
- **Payload tối thiểu cho provider**: chỉ (text, purpose) — test assert
  chính xác tập tham số; không bao giờ gửi lịch sử/nhật ký/dữ liệu người khác.
- **Provider registry allowlist**: provider đăng ký tường minh qua port;
  không URL/key nhập tùy ý; keys thuộc provider impl (B18) ở env/secret.
  Chưa wire = AI off → 503 module_unavailable (US-033 manual flow an toàn).
- **Failure mapping trung thực**: outage/timeout/quota → 503 reason riêng
  (fb_provider_reason convention); output malformed/oversized → 503
  provider_output_invalid; provider fail → 0 row tạo (không suggestion rác).
- **Output là text không tin cậy**: bound ≤ 4000, lưu như data, render
  textContent client-side; prompt-injection test chứng minh không tool/
  action/leak; KHÔNG có đường send nào trong f04 — gửi cuối luôn qua
  preview-recipient-confirm (F05 messages), send DTO chỉ có final body.
- **Author privacy**: original + suggestion là dữ liệu riêng của tác giả;
  caregiver/staff/System Administrator đều 404; không log câu; metadata
  provider_id/model_revision/prompt_revision versioned cho audit.
- **Mobile refine.js**: notice minh bạch trước khi gọi; suggest → editable
  textarea; accept → onAcceptText handing off; discard giữ draft; AI lỗi →
  manual notice, composer không bị chặn.
- Harness: carry-forward chuẩn + throttle scope `ai_refine` 30/hour.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f04_ai
node --test packages/family_bridge_mobile/f04_ai/tests/f04.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f04_ai python manage.py test harness labgrants family_bridge_features.f04_ai
```

Kết quả: f04 18/18 backend PASS; suite rộng 46/46 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Suggestion lookup: UNIQUE (author, idempotency_key) + index (author,
  created_at, id); list giới hạn 20 mới nhất (bounded); text bounds 4000.
- Provider call nằm NGOÀI transaction (refine transaction chỉ bọc DB
  write sau khi provider trả); timeout 15s do service truyền vào port.

## Security/privacy

- SEC-01/05: purpose allowlist; bounds; unknown fields reject; 401/404 đúng.
- SEC-04: author-only mọi endpoint; admin/stranger 404 (test riêng).
- SEC-22: không log câu; metadata revision tối thiểu; error details không
  chứa original/suggested (sanitize guard của core).
- US-033: AI off/lỗi/quota → manual flow luôn hoạt động; help không bị chặn.
- KHÔNG tuyên bố "an toàn tuyệt đối" — chất lượng output phụ thuộc prompt/
  model được duyệt (US-008) và phải review thêm; ở đây chỉ chứng minh hợp
  đồng xử lý dữ liệu + fail-safe.

## Kết quả

- PASS: 18 backend f04 + 46/46 harness suite + 3 mobile (SQLite local).
- NOT_RUN: quota race MySQL (không DB); provider HTTP thật (cần key + US-008).
- BLOCKED: none trong phạm vi module; provider thật + kill switch runtime
  thuộc B18 (registry allowlist + env).

## Còn lại / Input cần

- B18: wire provider thật vào registry allowlist (provider id/model/
  prompt revision theo hồ sơ US-008); kill switch runtime đọc từ product
  settings (B16); nối refine page vào composer dùng chung F06 (pause) —
  hiện onAcceptText chỉ handoff text, chưa ghép màn.
- US-008: Thầy/đơn vị duyệt cách AI giúp diễn đạt trước khi bật production.
