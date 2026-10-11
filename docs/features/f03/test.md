# F03 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- Catalog published-only (provider port, defensive re-check: thiếu key/sai
  status → coi như không có — fail closed với provider lỗi).
- Preview chính xác (card, version, recipient); version lệch → 409
  preview_stale; card retired/draft → 404 card_not_available.
- Gửi explicit qua MessageTransport port (F05); hash payload do SERVER tính
  từ composed body (note nếu có, else body thẻ) — replay cùng key khác
  card/note → 409 duplicate_key_payload_mismatch.
- Snapshot write-once tại lúc gửi (không update path); admin sửa/retire
  template sau không đổi thẻ đã gửi.
- Người nhận xem thẻ + gợi ý phản hồi published theo group/audience/xưng hô;
  gợi ý KHÔNG tự thành reply — chỉ điền vào ô soạn, phải bấm gửi (FL-11).
- Mobile: cards.js (browse/filter/chọn/note/recipient/preview/confirm,
  double-submit guard), card-detail.js (render textContent — không bao giờ
  innerHTML dữ liệu mạng; gợi ý → composer → explicit send).

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Catalog: draft/retired không bao giờ hiện | ẩn | PASS |
| Filter group + group rỗng | đúng | PASS |
| Window giới hạn (limit=2 → truncated=true) | bounded | PASS |
| Preview bind chính xác card+version+recipient | đúng | PASS |
| Preview sai version | 409 preview_stale | PASS |
| Preview card không tồn tại/draft | 404 | PASS |
| Preview không có connection | 404 | PASS |
| Preview mass assignment (is_staff) | 400 | PASS |
| Send kèm note → composed body = note | đúng | PASS |
| Send không note → composed body = card body | đúng | PASS |
| Double-submit cùng key | cùng message, 1 snapshot | PASS |
| Cùng key khác card | 409 duplicate_key_payload_mismatch | PASS |
| Gửi thẻ retired | 404 | PASS |
| Thẻ bị retire giữa preview và send | 404 (không gửi lọt) | PASS |
| Version đổi giữa preview và send | 409 preview_stale | PASS |
| Thiếu X-Idempotency-Key | 400 | PASS |
| Unknown fields | 400 | PASS |
| Note > 1000 ký tự | 400 (không truncate) | PASS |
| Transport chưa wire | 503 module_unavailable (fail closed) | PASS |
| Người nhận xem snapshot | 200 đúng nội dung | PASS |
| Snapshot bất biến sau khi provider sửa/retire | giữ nguyên bản lúc gửi | PASS |
| Stranger + admin đọc snapshot | 404 | PASS |
| Unlink: người nhận mất thẻ, người gửi giữ | DEC-13 mirror | PASS |
| Gợi ý theo group/audience | đúng | PASS |
| Gợi ý không tự gửi (transport count không đổi) | FL-11 | PASS |
| Gợi ý: sender 403, stranger 404 | đúng | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers đúng path + idempotency key; pages export factories;
card/suggestion text render qua textContent (không innerHTML động).

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Duyệt catalog, chọn thẻ | Chỉ thấy thẻ published; nhóm lọc đúng |
| 2 | Học sinh | Thêm lời riêng + xem trước | Preview đúng thẻ + người nhận; chưa gửi |
| 3 | Học sinh | Bấm xác nhận | Thẻ đến Hộp thư người nhận; nhận được message id |
| 4 | Người nhận | Mở thẻ từ hộp thư | Thẻ đúng nội dung lúc gửi; gợi ý trả lời phù hợp xưng hô |
| 5 | Người nhận | Chọn gợi ý | Gợi ý chỉ điền vào ô soạn; phải bấm gửi mới đi |
| 6 | Admin | Sửa/retire thẻ template | Thẻ đã gửi giữ nguyên snapshot cũ |
| 7 | Sau unlink | Người nhận mở lại thẻ | Bị chặn (fail-closed); người gửi vẫn thấy |
