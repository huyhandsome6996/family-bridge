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

## Phần 2 — Kết nối hai phía (A tạo, B nhập) — CÓ KIỂM TRA ĐÚNG NGƯỜI

2.0 (A) và (B) CÀI TÊN GỌI trước khi kết nối: Kết nối → thẻ "Để hai bên
    kiểm tra đúng người" → nhập tên gọi (vd A: "Mẹ Nam", B: "Nam — lớp 9A")
    → "Lưu tên gọi" → thông báo "Tên gọi đã được cập nhật trên máy chủ".
    - Nhãn bắt buộc trên màn: "Tên tự khai báo — KHÔNG phải danh tính Zalo
      đã xác minh". App KHÔNG xin SĐT/GPS, KHÔNG ép quyền tên/avatar Zalo.
2.1 (A) Trang chủ → "Kết nối với người đồng hành" → "Tạo mã mời".
2.2 (A) Ghi nhận: mã 12 ký tự hiển thị ĐÚNG MỘT LẦN, có thời hạn (7 ngày),
    badge "Đã tạo mã mời — chưa có ai nhập mã". KHÔNG đóng trang vội — nếu
    đóng/mất mã phải tạo mã mới (mã cũ tự hủy).
    - Refresh bình thường: mã VẪN hiển thị (không mất mã hợp lệ).
2.3 (B) Cũng mở app (đã đăng nhập) → Kết nối → nhập mã của A → bấm
    "Kiểm tra mã" (KHÔNG còn nút nhập trực tiếp).
    - Kỳ vọng: hiện thẻ "Kiểm tra đúng người trước khi đồng ý" với TÊN A
      ("Mẹ Nam — tên tự khai báo, chưa xác minh Zalo") + quan hệ đề nghị.
2.4 (B) Đối chiếu: gọi/đọc tin cho A xác nhận mã + tên. Đúng người → bấm
    "Đồng ý kết nối" → "Bạn đã đồng ý kết nối" + badge "Chờ người tạo mã
    xác nhận". Sai người → "Nhập lại mã khác".
2.5 (B) Kiểm tra: lúc NÀY kết nối CHƯA kích hoạt (trang chủ B vẫn "Chưa kết nối")
    — không được kích hoạt ngay khi chỉ nhập mã.
2.6 (A) Bấm "Làm mới" → thẻ "Mã mời đã có người nhập" (mã KHÔNG hiển thị lại)
    + lời mời "Bạn tạo · Chờ xác nhận" với dòng "Người nhập mã: Nam — lớp 9A
    (tên tự khai báo, chưa xác minh Zalo)" → "Xác nhận kết nối" → DIALOG hỏi
    lại kèm tên người nhập mã → xác nhận → "Hai bên đã kết nối
    (Người đồng hành chính)".
2.7 (A) và (B) bấm "Làm mới"/về Trang chủ → thẻ kết nối hiện tên tự khai báo
    của người kia (không hiện UUID). KHÔNG hiển thị UUID thô.

## Phần 3 — Các nhánh lỗi bắt buộc

3.1 Mã sai: (B) nhập mã thừa/thiếu/sai (12 ký tự không I/1/O/0) →
    "Mã không đúng hoặc đã hết hạn. Kiểm tra lại mã được cấp."
3.2 Self-connect: (A) tự nhập mã của chính mình → "Đây là mã do chính bạn tạo —
    không thể tự kết nối với mình." (preview và claim cùng báo vậy).
3.3 Nhập 2 lần: (B) nhập lại đúng mã đã nhập → không lỗi (replay idempotent).
3.4 Hủy lời mời: tạo mã mới rồi "Hủy lời mời này" → mã cũ không còn nhập được
    (B nhập → báo mã không đúng/hết hạn); mã đã hủy KHÔNG còn hiển thị ở trang
    A như còn dùng — nút "Tạo mã mời" trở lại.
3.5 Từ chối: (B) sau khi đồng ý, bấm "Từ chối lời mời" → (A) làm mới thấy
    trạng thái kết thúc, không xác nhận được nữa; mã của A cũng ngừng hiển thị.
3.6 Thứ ba: tài khoản C (không liên quan) cố mở trực tiếp lời mời của A/B qua
    thao tác UI → chỉ thấy danh sách rỗng; không xác nhận/hủy được (API 404).
3.7 Rate limit: (B) nhập sai 30 lần trong 1 giờ → "Bạn đã thử quá nhiều lần."
    (có thể bỏ qua nếu tốn thời gian — backend đã có test).
3.8 Hủy kết nối: (A) "Hủy kết nối" → dialog destructive NÊU TÊN người kia
    ("Bạn sắp hủy kết nối với: Nam — lớp 9A (tên tự khai báo...)") → xác nhận →
    trạng thái về "Chưa kết nối" ở CẢ HAI; (B) mất quyền dựa trên kết nối.
3.9 Kết nối lại: lặp Phần 2 → thành công với generation tăng 2 (đọc dòng
    "thế hệ kết nối (generation): 2").

## Phần 3b — Gate đồng ý & phiên bản chính sách (bổ sung audit)

3b.1 Chưa đồng ý: (A) đăng nhập lần đầu, TẠI TRANG ĐỒNG Ý bấm back để thoát →
     vào "Kết nối" → "Tạo mã mời" phải bị chặn với thông báo yêu cầu chấp nhận
     Điều khoản (không được tạo được mã khi chưa đồng ý).
3b.2 Sau khi (A) chấp nhận Điều khoản (service), AI/Nghiên cứu để TÙY CHỌN
     (bỏ trống) → tạo mã vẫn thành công (AI/research không khóa tính năng).
3b.3 Badge chờ xác nhận: (B) đồng ý mã → badge "Chờ người tạo mã xác nhận" →
     (A) xác nhận → (B) bấm Làm mới → badge phải BIẾN MẤT (trạng thái thật là
     kết nối active); giữ lại bất kỳ dòng "chờ xác nhận" nào là LỖI.
3b.4 Lời mời hết hạn: để quá hạn (hoặc chỉnh expires) → dòng lời mời hiện
     "Đã hết hạn" và KHÔNG còn nút hủy/xác nhận.

## Phần 4 — Offline/session

4.1 Tắt mạng → mở app → mọi màn không được fake dữ liệu; trạng thái lỗi rõ.
4.2 Để phiên quá hạn (hoặc backend revoke) → thao tác tiếp theo dẫn về
    đăng nhập kèm banner "Phiên đã hết hạn."
4.3 Demo mode (?demo=1) KHÔNG được bật trong build thật; nếu bật phải có
    nhãn "Dữ liệu minh họa" và tách khỏi dữ liệu thật.
4.4 Đổi phiên khi thao tác đang chạy (audit A01/A10): (A) bấm "Tạo mã mời" →
    NGAY LỨC đó đăng xuất ở tab/phiên khác (hoặc để backend revoke) → khi
    response về, trang phải báo "kết quả CHƯA XÁC ĐỊNH" + hướng dẫn Làm mới —
    KHÔNG được hiện lỗi chung như "Không thể hoàn tất yêu cầu" và KHÔNG tự
    tạo lại mã. Sau Làm mới: nếu mã đã tạo phải hiện đúng trạng thái backend.
4.5 Đăng xuất khi mạng chập chờn: tắt mạng → Đăng xuất → app vẫn về màn đăng
    nhập (đã đăng xuất trên thiết bị) kèm nhãn máy chủ CHƯA xác nhận thu hồi;
    bật mạng lại → đăng nhập lại phải thành công bình thường; phiên mới
    KHÔNG bị phiên logout cũ xóa.
4.6 Mở lại app (silent login): vào app khi có phiên Zalo hợp lệ → trang chủ
    phải tự cập nhật thành trạng thái đã đăng nhập (không đứng ở "Chưa đăng
    nhập"); nếu đang ở trang đăng nhập thì không bị đè.
4.7 Tên gọi: (A) gõ tên mới trong lúc trang đang tải tên cũ → chữ đang gõ
    phải được GIỮ NGUYÊN (GET chậm không được ghi đè).

## Không được phép khi kiểm thử

- Không tuyên bố "được Zalo duyệt" bất kỳ màn nào.
- Không test getPhoneNumber/followOA (không thuộc F01).
- Không coi tên tự khai báo là danh tính Zalo đã xác minh — nhãn phải luôn
  hiện kèm tên.
- Không upload bản production trước khi Huy duyệt.
