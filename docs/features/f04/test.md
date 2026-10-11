# F04 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- POST /ai/refine: X-Idempotency-Key bắt buộc; replay cùng key → CÙNG
  suggestion, KHÔNG gọi provider lần 2; cùng key khác text → 409.
- Payload tới provider tối thiểu: chỉ (text, purpose) — service assert
  bằng test; không bao giờ gửi lịch sử/nhật ký/dữ liệu người khác.
- Provider failure mapping trung thực: outage/timeout/quota → 503 với
  reason riêng; output malformed/oversized → 503 provider_output_invalid;
  không có row nào được tạo khi provider fail.
- Output là text KHÔNG tin cậy: bounded ≤ 4000, lưu như data, render
  textContent; không execute, không tool call, không auto-send.
- accept/discard: author-only, một chiều (accepted → không discard lại),
  idempotent; KHÔNG tạo message.
- /ai/status: {ai_enabled} trung thực; AI off → refine 503
  ai_unavailable_or_off; manual flow không bị ảnh hưởng (không gì phụ thuộc AI).
- Mobile refine.js: notice "Chỉ câu bạn nhập được gửi tới AI"; suggest →
  editable textarea (author quyết lời cuối) → accept → ctx.onAcceptText
  (chuỗi preview-recipient-confirm); AI lỗi → hiện notice manual, composer
  vẫn dùng được.

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Refine tạo suggestion author-private | 201, metadata revision đầy đủ | PASS |
| Replay cùng key | cùng suggestion, provider chỉ gọi 1 lần | PASS |
| Cùng key khác text | 409 duplicate_key_payload_mismatch | PASS |
| Provider nhận đúng 1 câu đã chọn | calls[0] = {text, purpose, at} | PASS |
| AI off (chưa wire) | 503 ai_unavailable_or_off | PASS |
| Outage / timeout / quota | 503 với reason riêng, 0 row | PASS |
| Output malformed / oversized | 503 provider_output_invalid | PASS |
| Prompt injection | lưu như text trơ; không tool/action | PASS |
| purpose ngoài allowlist | 400 | PASS |
| text > 4000 | 400 | PASS |
| Unknown fields (history) | 400 | PASS |
| Thiếu X-Idempotency-Key | 400 | PASS |
| Unauthenticated | 401 | PASS |
| Caregiver/admin/stranger đọc suggestion | 404 | PASS |
| List author-only | đúng | PASS |
| accept/discard author-only, một chiều, idempotent | đúng | PASS |
| Accept không gửi gì | 0 message | PASS |
| /ai/status on/off | {ai_enabled} đúng | PASS |

Mobile (node): wrappers đúng path + idempotency key; page factory;
suggestion render textContent; notice payload tối thiểu có trong source.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Nhập lời khó nói → nhờ AI | Notice rõ chỉ 1 câu được gửi; gợi ý hiện |
| 2 | Học sinh | Sửa gợi ý → Dùng lời này | Lời cuối là của user; bước gửi tiếp theo vẫn preview + confirm |
| 3 | Học sinh | Bỏ gợi ý | Lời đang viết không mất |
| 4 | Mất mạng/AI lỗi | Bấm nhờ AI | Thông báo trung thực; viết tay vẫn gửi được |
| 5 | Người đồng hành | Thử đọc suggestions của học sinh | 404 — dữ liệu riêng |
| 6 | Admin | Thử mọi endpoint | 404, không có đường đọc original/suggestion |
