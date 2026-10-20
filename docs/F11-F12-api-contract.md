# F11 / F12 — API contract cho đợt sửa Render (Giai đoạn 2)

Nhánh `tinh-nang/f11-f12-render-fix`. Chỉ phần THAY ĐỔI so với `main@73bf129`; mọi endpoint
khác của F11/F12 giữ nguyên (đường dẫn, method, payload). Envelope lỗi chung không đổi:
`{"error": {"code": "<code>", "details": {...}}}`.

## C-1. Admin: cấp CAP-09 / CAP-10 (admin_core)

`POST /api/v1/admin/capabilities/grant` — không đổi shape, chỉ mở rộng danh sách hợp lệ.

- `KNOWN_CAPABILITIES` thêm `appointment.assign` (CAP-09) và `appointment.handle` (CAP-10).
- Người gọi vẫn phải có `caps.grant` thật (không bypass bằng `is_staff`/superuser).
- `scope_type` ∈ {`global`, `school`}; `school` BẮT BUỘC `scope_ref` không rỗng = `class_ref`
  chính xác (cùng ngữ nghĩa CAP-23 `classroom.provision`). Sai → 400 `input_invalid`.
- Grant đã có (revoke, TTL `expires_at`, audit) giữ nguyên hành vi.

## C-2. F12: thực thi school scope

Quy tắc khớp grant (áp dụng ở mọi chỗ dùng staff directory):
grant hợp lệ = `capability ∈ {appointment.handle, appointment.assign}` AND `revoked_at IS NULL`
AND (`expires_at IS NULL` OR `expires_at > now`) AND
(`scope_type = "global"` OR (`scope_type = "school"` AND `scope_ref = <school_ref của request>`
và `school_ref` không rỗng)).

- `AppointmentRequest.school_ref` (mới, `CharField(max_length=64, blank=True, default="", db_index=True)`):
  gán lúc tạo từ `class_ref` của người yêu cầu (server-side, KHÔNG nhận từ client).
  Migration thuộc app `f12_appointments`. Request cũ có `school_ref=""` → chỉ staff `global` thấy.
- Interface staff directory (registry F12):
  `list_handlers(school_ref) -> list[str]`, `has_capability(user_id, school_ref) -> bool`,
  `school_of(user_id) -> str` (`""` nếu không có lớp). Production impl ở `backend/core/wiring.py`.
- `POST /appointments/requests`: 503 `module_unavailable` `{"reason":"scheduling_no_staff"}` khi
  KHÔNG có handler hợp lệ cho `school_ref` của người yêu cầu (thay vì "toàn hệ thống").
- `GET /appointments/requests` (list của chính mình): giữ gate hiện tại nhưng theo trường của người gọi.
- `GET /appointments/queue`: chỉ trả request `submitted` chưa giao mà handler có grant khớp
  `school_ref`; request đã giao cho chính handler. Không có grant khớp nào → 404 `request_not_found`
  (giữ "no scope leak"). Ghi chú bị che (`include_note=False`) cho tới khi claim — không đổi.
- `claim` / `slots` / `complete` / `get` (phía staff): kiểm tra `has_capability(handler, request.school_ref)`
  MỖI lần (revoke có hiệu lực ngay). Không khớp → 404 `request_not_found`.
- Bounds giữ nguyên: list/queue ≤ 20 dòng, note ≤ `MAX_TEXT_CHARS` (4000), slot 30 phút.

## C-3. Web F12 (`web/src/pages/appointments/index.js`)

- Nhận diện gate: `err.code === "module_unavailable" && err.details?.reason === "scheduling_no_staff"`
  → hiển thị thẻ "Hiện chưa có nhân sự tiếp nhận lịch hẹn." và VÔ HIỆU HÓA form đặt lịch
  (cả khi tải trang và khi submit).
- Directory lỗi (mạng/timeout/5xx) → trạng thái lỗi + "Thử lại", KHÔNG hiển thị danh sách rỗng giả.
- Queue: 404 `request_not_found` (người không phải staff) → coi như không có hàng đợi (im lặng);
  lỗi khác → trạng thái lỗi.
- Copy: không dùng "Đã gửi" (`tests/qa-web-invariants.test.mjs`).

## C-4. F11

Không đổi contract trong đợt này. Chờ E2E production (D-14) trước khi quyết định sửa.

## Kiểm chứng tối thiểu

- Backend: feature-lab `admin_core`, `f12_appointments`, `f11_supporters` xanh với `FB_FEATURES` tương ứng;
  test mới: cấp CAP-10 school/global, school thiếu `scope_ref` → 400, staff trường A không thấy/claim
  request trường B, revoke → mất quyền ngay, request cũ `school_ref=""` chỉ global thấy.
- Web: `cd web && node --test tests/*.test.mjs` + `npm run build` xanh; test mới cho 503 gate và lỗi directory.
- `python scripts/check_agent_docs.py`, `node scripts/check_import_boundaries.mjs`.
