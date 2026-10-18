# HUY-TEST-F07 — tự kiểm tra 10 phút (dữ liệu synthetic, local)

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
