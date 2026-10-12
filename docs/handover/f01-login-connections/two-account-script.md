# Kịch bản kiểm thử F01 trên 2 tài khoản Zalo (dành cho Antigravity)

Chuẩn bị (một lần):
- Backend đã deploy (Render) với `ZALO_APP_ID` + `ZALO_APP_SECRET` đã cấu hình;
  `GET https://family-bridge-backend.onrender.com/api/v1/health/` trả 200 `{"status":"ok"}`.
- Build Mini App với `APP_ID=3411096375330044972` +
  `VITE_API_BASE_URL=https://family-bridge-backend.onrender.com`, upload bản DEV
  lên Zalo Mini App console (ID 3411096375330044972), xác minh ứng dụng cha
  3813524408107862261 đã liên kết đúng Mini App.
- 2 thiết bị (hoặc 2 tài khoản Zalo trên 1 thiết bị): tài khoản A (ví dụ phụ
  huynh) và B (ví dụ học sinh) — A, B chưa từng kết nối với nhau trước đó.

Quy ước ghi kết quả: PASS / FAIL + mã lỗi hiển thị + screenshot.

## Phần 1 — Đăng nhập (chạy riêng cho A và B)

1.1 Mở Mini App Family Bridge trong Zalo (không phải trình duyệt) → Welcome.
1.2 "Bắt đầu" → Cách dùng → "Tiếp tục" → màn Đăng nhập: đọc dòng giải thích
    (chỉ nhận mã định danh, không xin SĐT).
1.3 Bấm "Đăng nhập bằng Zalo" → hiện "Đang đăng nhập…" → chuyển sang màn
    Đồng ý (trường hợp thành công).
    - FAIL nếu: treo "Đang đăng nhập…" quá 15s mà không có thông báo lỗi.
1.4 Chấp nhận "Điều khoản sử dụng" (bắt buộc), để 2 mục tùy chọn unchecked →
    "Xác nhận và tiếp tục" → màn Chọn vai trò.
1.5 Chọn vai trò → Trang chủ hiện "Chưa kết nối với người đồng hành" +
    nút "Kết nối với người đồng hành".
1.6 Đăng nhập lại (đóng và mở lại Mini App): hệ thống đăng nhập lại im lặng
    — vào thẳng trạng thái đã đăng nhập (không bắt đăng nhập lại thủ công).
1.7 Cá nhân → Đăng xuất → xác nhận → về màn Đăng nhập với banner
    "Bạn đã đăng xuất." → API sau đó phải 401 (thử "Quản lý kết nối" sẽ dẫn
    về đăng nhập).

## Phần 2 — Kết nối hai phía (A tạo, B nhập)

2.1 (A) Trang chủ → "Kết nối với người đồng hành" → "Tạo mã mời".
2.2 (A) Ghi nhận: mã 12 ký tự hiển thị ĐÚNG MỘT LẦN, có thời hạn (7 ngày),
    badge "Đã tạo mã mời — chưa có ai nhập mã". KHÔNG đóng trang vội — nếu
    đóng/mất mã phải tạo mã mới (mã cũ tự hủy).
2.3 (B) Cũng mở app (đã đăng nhập) → Kết nối → nhập mã của A vào ô
    "Nhập mã mời nhận được" (bảng chữ không có I/1/O/0 — gõ thường cũng được,
    hệ thống tự in hoa) → "Nhập mã mời".
    - Kỳ vọng: "Nhập mã thành công" + badge "Chờ người tạo mã xác nhận".
2.4 (B) Kiểm tra: lúc NÀY kết nối CHƯA kích hoạt (trang chủ B vẫn "Chưa kết nối")
    — không được kích hoạt ngay khi chỉ nhập mã.
2.5 (A) Bấm "Làm mới" → lời mời hiện "Bạn tạo · Chờ xác nhận" → bấm
    "Xác nhận kết nối" → thông báo "Hai bên đã kết nối (Người đồng hành chính)".
2.6 (A) và (B) bấm "Làm mới"/về Trang chủ → cả hai thấy "Đang đồng hành"
    (không hiện tên/UUID của nhau — chỉ nhãn quan hệ + generation).

## Phần 3 — Các nhánh lỗi bắt buộc

3.1 Mã sai: (B) nhập mã thừa/thiếu/sai (12 ký tự không I/1/O/0) →
    "Mã không đúng hoặc đã hết hạn. Kiểm tra lại mã được cấp."
3.2 Self-connect: (A) tự nhập mã của chính mình → "Không thể tự kết nối với chính mình."
3.3 Nhập 2 lần: (B) nhập lại đúng mã đã nhập → không lỗi (replay idempotent).
3.4 Hủy lời mời: tạo mã mới rồi "Hủy lời mời này" → mã cũ không còn nhập được
    (B nhập → báo mã không đúng/hết hạn).
3.5 Từ chối: (B) sau khi nhập mã, bấm "Từ chối lời mời" → (A) làm mới thấy
    trạng thái kết thúc, không xác nhận được nữa.
3.6 Thứ ba: tài khoản C (không liên quan) cố mở trực tiếp lời mời của A/B qua
    thao tác UI → chỉ thấy danh sách rỗng; không xác nhận/hủy được (API 404).
3.7 Rate limit: (B) nhập sai 30 lần trong 1 giờ → "Bạn đã thử quá nhiều lần."
    (có thể bỏ qua nếu tốn thời gian — backend đã có test).
3.8 Hủy kết nối: (A) "Hủy kết nối" → dialog destructive → xác nhận →
    trạng thái về "Chưa kết nối" ở CẢ HAI; (B) mất quyền dựa trên kết nối.
3.9 Kết nối lại: lặp Phần 2 → thành công với generation tăng 2 (đọc dòng
    "thế hệ kết nối (generation): 2").

## Phần 4 — Offline/session

4.1 Tắt mạng → mở app → mọi màn không được fake dữ liệu; trạng thái lỗi rõ.
4.2 Để phiên quá hạn (hoặc backend revoke) → thao tác tiếp theo dẫn về
    đăng nhập kèm banner "Phiên đã hết hạn."
4.3 Demo mode (?demo=1) KHÔNG được bật trong build thật; nếu bật phải có
    nhãn "Dữ liệu minh họa" và tách khỏi dữ liệu thật.

## Không được phép khi kiểm thử

- Không tuyên bố "được Zalo duyệt" bất kỳ màn nào.
- Không test getPhoneNumber/followOA (không thuộc F01).
- Không upload bản production trước khi Huy duyệt.
