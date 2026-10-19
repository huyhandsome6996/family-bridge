# HUY-TEST-F07 — tự kiểm tra 10 phút (dữ liệu synthetic, local)

> **Cập nhật 19/10/2026 (vòng sửa R01–R07):** giờ có CẢ web độc lập và Mini App cùng gọi một backend thật — xem mục "Luồng web mới" và "Checklist chéo 2 client" cuối file. Chạy E2E chéo tự động: `node scripts/f07_cross_client_e2e.mjs` (xem header script cho biến môi trường).

Yêu cầu: checkout nhánh `tinh-nang/f07-tam-trang-va-chia-se-us015-us026`,
Python 3.12/3.13 + Django, Node 22. KHÔNG cần secret; mật khẩu fixture ghi
trong script (chỉ hợp lệ trên máy bạn).

```bash
# 1) Nền
cd backend
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py migrate

# 2) Fixture synthetic: HSZE2E01 (học sinh), PHZE2E01 (mẹ), HSZE2E99 (người lạ)
#    + connection admin_provisioned (invite NULL). Chạy lại = reset mood E2E.
DJANGO_ENV=development DB_ENGINE=sqlite python ../scripts/f07_local_fixtures.py

# 3) Server API thật (cửa sổ 1)
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py runserver 127.0.0.1:8000

# 4) E2E 21 bước tự động (cửa sổ 2) — mong đợi 21/21 PASS
python3 scripts/f07_local_e2e.py --base http://127.0.0.1:8000

# 5) Mini App thật (cửa sổ 2)
cd zalo-mini-app
VITE_API_BASE_URL=http://127.0.0.1:8000 VITE_MANUAL_LOGIN_TEST=1 npm run start
```

## Luồng chính trên trình duyệt (http://localhost:3000)

1. **Học sinh (HSZE2E01 / mật khẩu fixture):**
   - Đăng nhập form thật → đồng ý điều khoản (bắt buộc) → Trang chủ.
   - Vào **Cá nhân → Tâm trạng của mình** (hoặc link cuối thẻ "Cảm xúc lúc này").
   - Chọn cảm xúc + ghi chú → Lưu → thấy "Máy chủ đã ghi nhận… chỉ mình bạn".
   - Bấm **Chia sẻ mục này** (trong Lịch sử) → sheet hiện ĐẦY ĐỦ ghi chú +
     revision → chọn "Mẹ Lan (E2E)" → **Xác nhận chia sẻ**.
   - Mở lại sheet → badge "Đang chia sẻ" + nút Thu hồi.
2. **Đăng xuất → người chăm sóc (PHZE2E01 / mật khẩu fixture):**
   - **Cá nhân → Được chia sẻ với bạn** → Mở nội dung → đọc được ghi chú.
3. **Chặn đọc sau thu hồi (2 thiết bị/tab):**
   - Tab PH để mở; dùng cửa sổ khác đăng nhập HS → Thu hồi quyền.
   - Tab PH bấm **Mở nội dung** lại → "Không còn xem được", nội dung cũ biến
     khỏi trang.
4. **Trường hợp từ chối:** đăng nhập HSZE2E99 (người lạ) → không thấy gì của
   Lan; tự share cho người khác không có kết nối → thông báo lỗi rõ.

## Điểm cần nhận biết (trung thực)

- Reload trang → phải đăng nhập lại (phiên in-memory, chủ đích bảo mật).
- SQLite local không chứng minh MySQL; trình duyệt không thay Zalo device.
- Trên production Render hiện tại CHƯA có các thay đổi này (chưa deploy).

---

## Luồng web mới (19/10/2026 — F07 web parity)

```bash
# Web dev thật (cửa sổ 3)
cd web
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5179
```

1. **Học sinh trên WEB** (http://127.0.0.1:5179, HSZE2E01):
   - Đăng nhập form thật (không Zalo SDK) → Trang chủ.
   - Trang chủ khi CHƯA kết nối vẫn hiện thẻ "Cảm xúc lúc này" (ghi riêng tư
     không cần kết nối) + link "Xem lịch sử, sửa và chia sẻ từng mục →".
   - **Cá nhân → Tâm trạng của mình** (route `#/mood`) hoặc gõ `#/mood`:
     chọn cảm xúc + ghi chú → Lưu → "Máy chủ đã ghi nhận… chỉ mình bạn".
   - Lịch sử: **Sửa mục này** (tạo revision mới, KHÔNG tự chia sẻ lại),
     **Chia sẻ mục này** → sheet preview đủ ghi chú + revision → chọn người
     nhận → **Xác nhận chia sẻ**; mở lại sheet xem badge trạng thái thật
     (Đang chia sẻ / Bản cũ — cần chia sẻ lại / Đã thu hồi / Kết nối đã kết
     thúc) và **Thu hồi quyền này**.
   - Ghi ngày trùng trên trang chủ → thông báo dẫn link sửa đúng mục (không
     còn câu "sẽ chỉnh sửa ở bản đầy đủ").
2. **Người chăm sóc trên WEB** (PHZE2E01): **Cá nhân → Được chia sẻ với bạn**
   (`#/mood-shared`) → Mở nội dung → đọc ghi chú; sau thu hồi/sửa thì lần mở
   sau bị chặn, nội dung cũ rời màn.
3. **Chữ lớn (R06):** phóng to chữ trình duyệt (Ctrl/Cmd +) hoặc 200% — chips
   cảm xúc tự xuống dòng, không tràn ngang ở cửa sổ hẹp.

## Checklist chéo 2 client (10 phút, cùng backend thật)

| Bước | Thao tác | Kỳ vọng |
| --- | --- | --- |
| 1 | HS login Mini App (3000) + HS login Web (5179) | cả hai vào được `#/mood` từ Cá nhân |
| 2 | HS ghi cảm xúc + note ở Mini App | Web `/mood` Lịch sử thấy cùng mục, cùng revision |
| 3 | HS sửa ở Web | Mini App (vào lại `/mood`) thấy bản hiện hành, revision tăng |
| 4 | HS share mục ở Mini App cho "Mẹ Lan (E2E)" | PH login Web → Được chia sẻ với bạn → đọc đúng note + revision |
| 5 | HS share lại (sau khi sửa) từ Web | PH trên Mini App đọc được bản mới |
| 6 | HS sửa lần nữa ở một bên | Bản PH đang xem ngừng đọc được ở bên kia (list ẩn mục) |
| 7 | HS Thu hồi ở Web → PH mở Mini App; rồi share lại + Thu hồi ở Mini App → PH mở Web | Lần đọc sau bị chặn cả hai chiều |
| 8 | PH Đăng xuất bằng nút thật trên cả hai | Không còn note/preview nào trên màn hình đăng nhập |
| 9 | HSZE2E99 (người lạ) login Web | `#/mood-shared` trống, không thấy gì của HS |

## Mật khẩu + E2E tự động

- Mật khẩu fixture: `E2e-local-2026!` (chỉ local, ghi trong `scripts/f07_local_fixtures.py`).
- E2E chéo UI: `PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... F07_API_BASE=http://127.0.0.1:8000 F07_MINI_BASE=http://127.0.0.1:3000 F07_WEB_BASE=http://127.0.0.1:5179 F07_SYNTHETIC_PASSWORD=E2e-local-2026! node scripts/f07_cross_client_e2e.mjs` — mong đợi 20/20 PASS.
- Mini App dev mặc định cổng 3000; nếu dùng 3019 thì đổi `F07_MINI_BASE` tương ứng.
