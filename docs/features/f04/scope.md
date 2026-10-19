# F04 scope — AI hỗ trợ diễn đạt (US-029, US-033)

Cả học sinh và người chăm sóc chủ động nhờ AI viết lại lời bộc phát thành
lời rõ cảm xúc/nhu cầu. AI chỉ chạy backend; provider là registry server
allowlist (Gemini qua `GEMINI_API_KEY`, host allowlist
`generativelanguage.googleapis.com`); payload tối thiểu = đúng câu user
chọn. Bản gốc + gợi ý là dữ liệu riêng của tác giả. Accept KHÔNG gửi —
gửi cuối đi qua preview-recipient-confirm chung (F05/F06). AI off/lỗi →
viết tay bình thường.

Chi tiết đầy đủ: report.md + test.md kèm theo.

Nhánh mang theo harness carry-forward (labgrants + settings/urls +
packages __init__.py) + throttle scope `ai_refine` 30/hour (DEC-17).

## Luồng 2 client (web + Zalo Mini App)

Cùng một origin Django Render, cùng `packages/family_bridge_shared` cho
HTTP/DTO/session headless (shared không DOM/storage/SDK):

1. Soạn thảo → chọn chủ động dùng AI (KHÔNG auto-generate khi load/type/
   resume/timer).
2. Consent sheet disclosure trước lần dùng AI đầu (purpose `ai_processing`,
   policy hiện hành) — gate consent là việc của MÁY CHỦ trước provider call.
3. `POST /api/v1/ai/refine` với `X-Idempotency-Key` + body
   `{original_text, purpose: "refine_expression", input_revision?}`;
   `inputRevision` là counter keystroke của composer (optional, legacy hợp lệ).
4. Response 201 = `AiSuggestion.view()` + echo `input_revision`; text duy
   nhất là `suggested_text` (KHÔNG `refined_text`); render textContent,
   không innerHTML; suggestion chỉnh sửa được trước khi dùng.
5. Stale guard: revision trong response lệch revision hiện tại → gợi ý
   STALE, không được apply đè text mới; người dùng sửa/từ chối/thử lại.
6. Accept/discard qua `/api/v1/ai/suggestions/{id}/accept|discard` — chỉ
   quyết định AI, không tạo Message/outbox/job/send.
7. Lưu nháp F06 → chọn người nhận → preview → confirm-send F05 (hành động
   cuối của người dùng; pause 300s chỉ khi ĐÃ chọn).
8. Người nhận ở client kia đọc Message final (F05); không bao giờ thấy
   original/suggestion/context.

## Boundary F04 vs phụ thuộc

- **F06 (nháp/pause)**: giữ nháp, revision, pause 300s server. Edit F06:
  `kind` OPTIONAL (bất biến sau create), chỉ validate field có mặt.
  Không chọn pause → preview/send hợp lệ không bị ép chờ; đã chọn pause →
  không auto-send t=300.
- **F05 (hộp thư)**: recipient chỉ nhận final approved body; Message
  DTO/detail/list/search/export không có original/suggestion/context.
  Refine/accept KHÔNG làm tăng Message/outbox/operation count.
- **F15 (riêng tư)**: F04 đăng ký deletion hook category `"ai"` qua
  `register_deletion_hook` (AppConfig.ready, pattern F16); xóa scoped đúng
  user, idempotent; revoke consent `ai_processing` chặn refine ngay.

## Ngoài scope

- Tư vấn 1-1, đặt lịch với chuyên gia (F12), phòng thiết bị.
- AI chẩn đoán/trị liệu; promise/hứa hẹn thay người dùng; auto-send bất kỳ
  lúc nào; đọc lịch sử/nhật ký/dữ liệu người khác để làm ngữ cảnh.
- Frontend gọi provider trực tiếp; key/URL provider phía client.
