# Kịch bản hai tài khoản Zalo — Antigravity xác minh F15

Mục đích: kiểm tra luồng quyền riêng tư end-to-end trên Mini App thật với hai
tài khoản Zalo thật (A = học sinh/chủ dữ liệu, B = người chăm sóc; actor C =
người thứ ba nếu sẵn, hoặc harness riêng). Chạy trên DB thử nghiệm cô lập.

Ghi kết quả từng bước: full head SHA (backend + frontend), DB, OS, phiên bản
Zalo, PASS/FAIL/SKIP + lý do. Không gửi token/OTP/nội dung riêng vào chat.

## Chuẩn bị

1. Backend triển khai từ head nhánh F15 ở môi trường THỬ NGHIỆM (không
   production), `VITE_API_BASE_URL` trỏ tới backend thử nghiệm.
2. Build Mini App từ cùng head (`npm run build`), nạp lên Zalo nhà sviluppo.
3. Bật logging phía server ở mức INFO (không log token/body — SEC-22).
4. Tạo kết nối A–B bằng luồng mời F01 (tạo mã ở A, nhập mã ở B).

## Kịch bản

| # | Actor | Bước | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | A, B | Đăng nhập hai phía qua F01 | Cả hai có phiên; A mở Hồ sơ → “Quản lý chia sẻ & đồng ý” → trang /privacy mở |
| 2 | A | Tạo mục tâm trạng X, nhật ký Y; chia sẻ X cho B (không chia sẻ Y) | Trang /privacy của A hiện X “đang chia sẻ”, KHÔNG hiện Y |
| 3 | B | Mở danh sách được chia sẻ (mood/journal) | B đọc được X; Y không xuất hiện bất kỳ đâu |
| 4 | C | Đoán/thử đọc X qua API (không grant) | 404/403 — không leak existence |
| 5 | A | Thu hồi X trên /privacy (confirm) | List cập nhật “đã thu hồi”; B đọc lại X → bị chặn ngay |
| 6 | A | Chụp màn hình X trước khi thu hồi (bản sao ngoài app) | Thực tế vẫn xem được — app phải nói rõ điều này, không hứa thu hồi bản sao |
| 7 | A | Hủy kết nối với B (endpoint F01) | Grants A→B chết; /privacy của A không còn kết nối active |
| 8 | B | Thử đọc lại các mục cũ | Bị chặn (404) |
| 9 | A, B | Kết nối lại (generation mới) | Grant cũ KHÔNG hồi sinh; A phải sửa mục rồi chia sẻ lại mới đọc được |
| 10 | A | Rút đồng ý “Nghiên cứu” trên /privacy | Thông báo thành công; khảo sát F14 chặn submission; help F13 vẫn mở |
| 11 | A | Gửi yêu cầu xóa (chọn mood + journal) | Receipt hiện MỘT lần; list hiện “requested” + nút hủy |
| 12 | A | Mất mạng ngay khi gửi yêu cầu → mở lại app | “Chưa xác định kết quả” → đọc lại bằng GET → trạng thái thật hiện ra |
| 13 | A | Hủy yêu cầu trước khi xử lý | Thành công; trạng thái “cancelled” |
| 14 | Handler (qua harness có capability) | verify → process yêu cầu mới | verified → processing → completed/failed trung thực; sai capability → 404; chưa cấu hình authorizer → 503 |
| 15 | A | Logout/đổi actor → mở lại /privacy | Không còn dữ liệu riêng của actor cũ (state dọn sạch) |
| 16 | A | Mở F13 trợ giúp khi chưa login/lỗi phiên | Vẫn truy cập được |

## Ràng buộc an toàn khi chạy

- Không chạy step 14 trên dữ liệu thật; chỉ DB thử nghiệm với dữ liệu synthetic.
- Không gửi tin nhắn Zalo/SMS/email cho người thật trong quá trình thử.
- Nếu một bước FAIL: dừng, ghi lại SHA + log sạch (không body), báo về cho
  lead trước khi thử tiếp.
