# Review rounds — tái hiện → sửa → bằng chứng (không mô phỏng hội thoại)

Mỗi vòng dưới đây là một vòng làm việc thật của 1 agent chính (xem
team-and-ownership.md): tái hiện bằng test → đọc nguyên nhân → vá → rerun cả
suite cũ để chắc không vỡ hành vi khác.

## Vòng 1 — Tái hiện trên baseline (571abcb, trước khi sửa)

`tests/.../test_f07_regressions.py` chạy trên code CHƯA sửa:
14 test → 10 FAIL/ERROR, 4 PASS. Kết quả đúng như nghi vấn bàn giao:
- Finding 1: `TypeError: get_own() got an unexpected keyword argument 'author_id'` (500)
- Finding 2: đọc `/mood/shared/{id}` khi thiếu reader → 200 + note (fail-open)
- Finding 3: reconnect generation mới → grant cũ vẫn 200
- Finding 4: re-share sau revoke trả `revoked: true` như thành công; sau
  reconnect binding giữ connection chết
- Finding 5: `/mood/shared` leak metadata sau unlink; không phân trang (3 > 2)
- Finding 6: `expected_revision` bị coi là unknown field (không có semantic)
- Finding 8: race → IntegrityError 500
2 test PASS là hành vi đúng sẵn (400 unknown field; revoked không tự hồi sinh).

## Vòng 2 — Vá backend + wiring

- Sửa services/mood.py, api.py, models.py (status), thêm apps.py +
  grant_provider.py + deletion.py + services/__init__.py facade.
- Lỗi phát hiện trong vòng: `register_grant_provider` fail do `_resolve` cần
  submodule là attribute của package → thêm facade import (không sửa F15).
- Rerun: 33/33 (19 cũ + 14 regression) PASS.

## Vòng 3 — Integration với thành phần thật

- test_f07_integration.py: wiring + admin_provisioned (invite NULL) + F15
  revoke chặn F07 + can_view + deletion hook + unlink/reconnect gen 2.
- Lỗi phát hiện: hook xóa báo tổng row cascade thay vì số entry → sửa report
  trung thực.
- Rerun: 42/42 PASS (2 MySQL-gated skip có lý do).

## Vòng 4 — Client: shared adapter + Mini App

- Sửa page_size mapping; thêm 8 method; mock adapter đủ; update contract tests
  (74→82) + 3 test mới bắt URL/body fetch thật → shared 37/37.
- Mini App: 2 trang mới + router + home/profile; QA suite phát hiện chuỗi
  over-claim ("Đã lưu/Đã chia sẻ") và token "auto-send" trong comment → đổi
  wording ("Máy chủ đã ghi nhận…") — đúng rule sẵn của repo.
- Test UI mới phát hiện BUG THẬT của chính trang mới: closure tham chiếu biến
  chưa khởi tạo → nút Lưu chết → sửa (editor parts trước, nút sau).
- Rerun: mini-app 306/306 + build OK; web consumer 227/227 + build OK (không
  sửa web).

## Vòng 5 — E2E HTTP thật (server Django local)

- 21 bước: lần chạy 1 = 18/21 (3 assertion trong SCRIPT E2E đọc nhầm field →
  sửa script, không phải API); lần chạy 2 = 20/21 (dirty state từ run trước →
  fixture thêm reset E2E-only); lần chạy cuối = 21/21 PASS.
- Bài học ghi lại: fixture E2E phải reset trạng thái của CHÍNH tài khoản
  synthetic để chạy lặp được.

## Vòng 6 — Browser thật (Vite + API local, 2 tài khoản)

- Phát hiện: sau khi lần đọc mới bị chặn (404 sau thu hồi), nội dung lần đọc
  TRƯỚC vẫn còn trên trang → sửa mood-shared gỡ section cũ trước mỗi lần mở;
  thêm regression test UI "mở lại sau thu hồi" (10/10).
- Kiểm chứng chéo thiết bị: PH đọc OK → HS revoke bằng API (thiết bị khác) →
  PH mở lại → "Không còn xem được" + nội dung cũ GỠ KHỎI MÀN (ảnh 07).
- Kiểm chứng phụ: reload trang → về login (session in-memory) — hành vi
  bảo mật đúng, không cố "giữ phiên" bằng storage.

## Các finding KHÔNG tái hiện / khác bàn giao

- "role preview selection cannot grant authority": server không nhận owner/role
  từ client ở bất kỳ path nào (test cross-user + admin 404) — không finding mới.
- Không phát hiện thêm lỗi authorization mới ngoài 8 điểm đã nêu trong phạm vi
  code đã đọc; các vùng ngoài phạm vi (F02, web, F15 internals) không review.
