# F11 — Điểm tựa dự phòng (Backup Anchor) — Test Case Pack (chuẩn hóa)

## Mục đích & phạm vi

Đóng gói toàn bộ test cases F11, tập trung vào:
- **Logic luồng dữ liệu**: mời kết nối (F01), consent hai bên, gửi tin nhắn mới qua transport, không sao chép ngữ cảnh cũ.
- **Kiểm soát phân quyền (Authorization)**: chỉ chủ sở hữu kết nối gửi tin, supporter không được quyền admin, stranger/admin không enumerate.
- **Rủi ro bảo mật**: rò rỉ dữ liệu (F06 nháp, F07 tâm trạng, F08 nhật ký, thư cũ), leo thang đặc quyền, race condition trạng thái, DTO chỉ nhận `body`.

**Không bao gồm:** kiểm thử giao diện cơ bản (UI).

## Định dạng ID

- `TC-F11-POS-XX`: luồng chính (positive)
- `TC-F11-NEG-XX`: luồng lỗi / bảo mật (negative)
- `TC-F11-AUTH-XX`: kiểm soát phân quyền

---

## 1. Test cases luồng chính (Positive)

| ID | Kịch bản | Điều kiện tiền quyết | Bước thực hiện | Kết quả mong đợi |
|----|----------|---------------------|----------------|------------------|
| TC-F11-POS-01 | Học sinh gửi lời mời kết nối điểm tựa (luồng F01) | Tài khoản học sinh đã đăng nhập; chưa có kết nối điểm tựa nào đang hiệu lực. | 1. Học sinh chọn "Gửi lời mời điểm tựa".<br>2. Nhập thông tin người được mời.<br>3. Xác nhận gửi. | Hệ thống gửi lời mời qua F01; trạng thái = "pending"; học sinh nhận thông báo đã gửi. |
| TC-F11-POS-02 | Người được mời chấp nhận → kết nối active | Đã có lời mời trạng thái "pending". | 1. Người được mời đăng nhập.<br>2. Xem thông báo lời mời.<br>3. Chọn "Chấp nhận". | Trạng thái kết nối = "active"; TTL 90 ngày được đặt; cả hai bên thấy điểm tựa sẵn sàng. |
| TC-F11-POS-03 | Người được mời từ chối → không hiển thị "sẵn sàng" | Đã có lời mời trạng thái "pending". | 1. Người được mời chọn "Từ chối". | Trạng thái = "rejected"; hệ thống KHÔNG hiển thị điểm tựa là "sẵn sàng"; decline là một chiều (accept sau decline không hiệu lực). |
| TC-F11-POS-04 | Lời mời hết hiệu lực (TTL 90d) → không hiển thị "sẵn sàng" | Lời mời "pending" đã quá TTL. | 1. Học sinh truy cập danh sách điểm tựa.<br>2. Kiểm tra trạng thái. | Trạng thái hiển thị = "expired"; KHÔNG hiển thị là "sẵn sàng". |
| TC-F11-POS-05 | Học sinh chọn điểm tựa active, soạn tin nhắn mới, xem trước, xác nhận gửi | Đã có kết nối điểm tựa "active"; học sinh đã đăng nhập. | 1. Chọn điểm tựa đang hiệu lực.<br>2. Soạn nội dung tin nhắn mới hoàn toàn.<br>3. Xem trước (preview).<br>4. Nhấn "Xác nhận gửi". | Tin nhắn gửi thành công; trạng thái = "sent"; học sinh nhận thông báo xác nhận; điểm tựa nhận thông báo tin nhắn mới. |
| TC-F11-POS-06 | Tin nhắn là tạo mới hoàn toàn, KHÔNG tự đính kèm dữ liệu cũ | Đã có kết nối "active"; học sinh có thư gia đình, nhật ký, tâm trạng, dữ liệu AI cũ. | 1. Chọn điểm tựa và vào màn hình soạn tin nhắn F11.<br>2. Soạn nội dung mới.<br>3. Kiểm tra đính kèm tự động trước khi gửi. | Hệ thống KHÔNG tự động đính kèm thư gia đình, nhật ký cá nhân, tâm trạng hoặc dữ liệu AI cũ; chỉ gửi nội dung được soạn tay mới. |
| TC-F11-POS-07 | KHÔNG có cơ chế tự động chuyển tiếp nếu điểm tựa không phản hồi | Đã gửi tin nhắn F11 thành công; điểm tựa chưa trả lời. | 1. Đợi quá thời gian chờ.<br>2. Kiểm tra hệ thống có tự động gửi lại hay không. | Hệ thống KHÔNG tự động chuyển tiếp/đ gửi lại; không có job gửi tự động nào được tạo sau 300 giây. |
| TC-F11-POS-08 | Học sinh tự chọn điểm tựa active khác khi người đầu không trả lời | Đã có ít nhất 2 kết nối điểm tựa "active". | 1. Xem trạng thái từng role.<br>2. Chọn role active khác.<br>3. Soạn request mới. | Học sinh có thể chọn điểm tựa active khác và gửi yêu cầu mới; không có auto-forward. |
| TC-F11-POS-09 | Replay cùng idempotency key | Đã gửi tin nhắn với X-Idempotency-Key. | 1. Gửi lại cùng key và cùng body. | Cùng message, chỉ 1 send (idempotent, không duplicate). |
| TC-F11-POS-10 | F13 luôn mở khi chưa có điểm tựa | Học sinh chưa có kết nối điểm tựa nào. | 1. Truy cập màn hình điểm tựa. | Link F13 (trang tìm trợ giúp) luôn hiện; không bị ẩn. |

---

## 2. Test cases negative / bảo mật (Negative) — tập trung rò rỉ dữ liệu & leo thang quyền

### 2.1 Rò rỉ dữ liệu khi đính kèm nội dung tin nhắn (tối thiểu 3)

| ID | Kịch bản | Điều kiện tiền quyết | Bước thực hiện | Kết quả mong đợi |
|----|----------|---------------------|----------------|------------------|
| TC-F11-NEG-01 | Điểm tựa cố tình truy cập thư gia đình cũ của học sinh qua F11 | Điểm tựa đã chấp nhận kết nối; học sinh có ít nhất 1 thư gia đình cũ (F06/F08). | 1. Điểm tựa đăng nhập.<br>2. Thử truy cập endpoint/trang xem thư gia đình của học sinh qua ngữ cảnh F11.<br>3. Thử đính kèm thư cũ vào tin nhắn phản hồi F11. | Hệ thống từ chối truy cập (403 Forbidden); KHÔNG cho phép điểm tựa xem hoặc đính kèm thư gia đình cũ; viết log sự cố bảo mật. |
| TC-F11-NEG-02 | Điểm tựa tự động nhận nhật ký cá nhân của học sinh khi kết nối F11 | Đã có kết nối F11 "active"; học sinh có nhật ký cá nhân (F07/F08). | 1. Điểm tựa nhận tin nhắn F11 từ học sinh.<br>2. Kiểm tra hệ thống có tự động đính kèm/đưa nhật ký cùng tin nhắn hay không. | Hệ thống KHÔNG tự động đính kèm nhật ký cá nhân; tin nhắn chỉ chứa nội dung học sinh soạn mới; nhật ký vẫn riêng tư. |
| TC-F11-NEG-03 | Điểm tựa truy cập nội dung AI cũ (draft F06) của học sinh qua F11 | Đã có kết nối F11 "active"; học sinh có draft AI (F06) được lưu trước đó. | 1. Điểm tựa cố gắng truy cập hoặc yêu cầu hệ thống đưa nội dung AI cũ vào tin nhắn F11.<br>2. Thử điều chỉnh tham số API để kéo draft AI cùng tin nhắn. | Hệ thống từ chối; KHÔNG bao gồm dữ liệu AI cũ trong tin nhắn F11; chỉ cho phép nội dung mới được soạn bởi học sinh tại thời điểm gửi. |
| TC-F11-NEG-04 | DTO chỉ nhận trường `body`, từ chối mọi trường phụ | Đã có kết nối F11 "active"; học sinh đã đăng nhập. | 1. Gọi API contact với DTO chứa `body` + trường phụ `quoted_letter`, `journal_page`, `draft_id`, `original`. | API trả về 400; từ chối mọi trường phụ; KHÔNG sao chép ngữ cảnh cũ từ F06/F07/F08/thư gia đình. |

### 2.2 Leo thang đặc quyền (Privilege escalation)

| ID | Kịch bản | Điều kiện tiền quyết | Bước thực hiện | Kết quả mong đợi |
|----|----------|---------------------|----------------|------------------|
| TC-F11-NEG-05 | Tài khoản điểm tựa KHÔNG nhận quyền Admin hệ thống | Điểm tựa là tài khoản người dùng thường (không phải Admin). | 1. Điểm tựa đăng nhập và thực hiện các thao tác F11.<br>2. Kiểm tra xem tài khoản có thể truy cập chức năng Admin (quản lý user, cài đặt hệ thống) hay không. | Tài khoản điểm tựa KHÔNG nhận được quyền Admin; không thể truy cập endpoint/chức năng Admin; phân quyền strictly scoped to F11 connection. |
| TC-F11-NEG-06 | Người khác/học sinh không thể mượn tay accept/revoke role của điểm tựa | Đã có lời mời "pending" từ học sinh A cho điểm tựa B. | 1. Học sinh A (không phải B) đăng nhập, thử gọi endpoint respond (accept/decline) của B.<br>2. Người lạ (stranger) thử gọi cùng endpoint. | Hệ thống trả về 404/403; CHỈ supporter chính (B) mới có quyền accept/decline role của mình. |
| TC-F11-NEG-07 | Stranger hoặc admin không thể duyệt/enumerate danh sách điểm tựa | Tài khoản stranger hoặc admin đăng nhập. | 1. Gọi API GET danh sách supporters/commitments của học sinh khác. | Danh sách trả về rỗng (owner-scoped); stranger/admin không thể enumerate danh sách điểm tựa của học sinh khác. |
| TC-F11-NEG-08 | Từ chối một chiều sau khi decline | Đã có lời mời đã bị từ chối (rejected). | 1. Học sinh thử accept lại lời mời đã bị từ chối. | Hệ thống từ chối; decline là một chiều, accept sau decline không hiệu lực. |
| TC-F11-NEG-09 | Chặn liên lạc khi role expired/revoked hoặc connection bị hủy (unlink) | Đã có kết nối F11; sau đó role bị revoke/expired hoặc connection bị unlink. | 1. Học sinh thử gửi tin nhắn F11 (contact) khi role đã expired/revoked hoặc connection đã unlink.<br>2. Điểm tựa thử gửi tin nhắn qua cùng kết nối. | Hệ thống chặn liên lạc ngay với lý do trung thực (400 supporter_not_available hoặc 403 connection guard); không gửi tin nhắn. |

### 2.3 Race condition trạng thái

| ID | Kịch bản | Điều kiện tiền quyết | Bước thực hiện | Kết quả mong đợi |
|----|----------|---------------------|----------------|------------------|
| TC-F11-NEG-10 | Học sinh gửi tin nhắn đúng lúc điểm tựa vừa bị hủy kết nối | Đã có kết nối F11 "active"; tin nhắn đang được soạn/xác nhận. | 1. Trong khi học sinh nhấn "Xác nhận gửi", quản trị viên/hệ thống hủy hiệu lực kết nối F11.<br>2. Kiểm tra kết quả gửi tin nhắn. | Hệ thống kiểm tra trạng thái kết nối atomic ngay trước khi persisted tin nhắn; nếu kết nối đã bị hủy, từ chối gửi và thông báo "kết nối không còn hiệu lực"; không gửi tin nhắn đến điểm tựa đã bị hủy. |

---

## 3. Test cases kiểm soát phân quyền (Authorization)

| ID | Kịch bản | Điều kiện tiền quyết | Bước thực hiện | Kết quả mong đợi |
|----|----------|---------------------|----------------|------------------|
| TC-F11-AUTH-01 | Chỉ học sinh chủ sở hữu kết nối mới có thể gửi tin nhắn F11 | Đã có kết nối F11 giữa học sinh A và điểm tựa B. | 1. Học sinh A đăng nhập, gửi tin nhắn F11.<br>2. Điểm tựa B đăng nhập, thử gửi tin nhắn F11 ngược lại qua cùng kết nối. | Chỉ học sinh A được gửi; điểm tựa B chỉ có thể phản hồi, không khởi tạo tin nhắn mới qua tính năng F11. |
| TC-F11-AUTH-02 | Người thân / giáo viên không thể xem tin nhắn F11 theo mặc định | Đã có tin nhắn F11 giữa học sinh và điểm tựa; có tài khoản người thân hoặc giáo viên liên kết với học sinh. | 1. Tài khoản người thân/giáo viên đăng nhập.<br>2. Thử truy cập chi tiết tin nhắn F11 của học sinh. | Hệ thống từ chối truy cập (403); tin nhắn F11 không hiển thị cho người thân/giáo viên theo mặc định; grants áp dụng từng mục/người nhận. |
| TC-F11-AUTH-03 | Phân quyền sau khi hủy/Thu hồi kết nối F11 | Đã có kết nối F11 hiệu lực; sau đó kết nối bị hủy/thu hồi. | 1. Hủy kết nối F11.<br>2. Điểm tựa thử truy cập lịch sử tin nhắn F11 cũ hoặc gửi tin nhắn mới. | Sau khi hủy, điểm tựa KHÔNG thể gửi tin nhắn mới; truy cập tin nhắn cũ bị từ chối hoặc bị hạn chế theo chính sách revoke grant. |
| TC-F11-AUTH-04 | Revoke role bởi đúng người | Đã có kết nối F11 "active". | 1. Học sinh hoặc điểm tựa (bất kỳ bên nào) gọi endpoint revoke. | Trả về 200; trạng thái chuyển thành "revoked"; liên lạc bị chặn ngay. |
| TC-F11-AUTH-05 | Revoke role bởi stranger | Đã có kết nối F11 "active"; tài khoản stranger đăng nhập. | 1. Stranger gọi endpoint revoke trên kết nối của người khác. | Trả về 404 (không có quyền); không thể revoke kết nối của người khác. |

---

## 4. Test cases mobile (node)

| ID | Kịch bản | Kết quả mong đợi |
|----|----------|------------------|
| TC-F11-MOB-01 | API wrappers hit contract paths với idempotency key + DTO chỉ `body` | Wrapper đúng path; DTO assertion chỉ `body` (không field khác). |
| TC-F11-MOB-02 | Page module exports createPage | Mobile supporters.js exports createPage; registry F11 routes "". |
| TC-F11-MOB-03 | Wording và help link trong source | textContent có "chờ người đó tự đồng ý"/"không đính kèm thư"; help link `#/help` hiện; nút Hủy, dừng đồng hành, commitments list presenti trong source (textContent, không innerHTML). |

---

## 5. Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
|---|-------|----------|---------|
| 1 | Học sinh | Mời mẹ làm điểm tựa | Mời đi đúng 1 người đã kết nối; trạng thái pending |
| 2 | Mẹ | Nhận lời / từ chối | Chỉ mẹ tự bấm; học sinh không thể thay |
| 3 | Học sinh | Nhắn điểm tựa active | Chỉ lời vừa viết được gửi; không kèm ngữ cảnh cũ |
| 4 | Học sinh | Người đầu không trả lời | Tự chọn điểm tựa active khác, soạn request mới |
| 5 | Học sinh | Chưa có điểm tựa | Link F13 luôn hiện |
| 6 | Mẹ | Rút lui / hết TTL | Contact bị chặn ngay với lý do trung thực |
| 7 | Stranger | List supporters của học sinh khác | Rỗng |

---

## 6. Integration readiness (Bước 3 — sau khi Backend bàn giao API)

- Sử dụng toàn bộ test cases ở mục 1, 2, 3 để bắn thử trực tiếp trên API.
- Báo cáo kết quả Pass/Fail chi tiết.
- Nếu bất kỳ test case bảo mật nào (TC-F11-NEG-01 → -10, TC-F11-AUTH-01 → -05) Fail → yêu cầu Backend sửa lỗi ngay trong vòng lặp.
- Chỉ phê duyệt hoàn thành task khi tỷ lệ Pass đạt 100%.
- NOT_RUN: MySQL race invite/accept (không DB trong môi trường hiện tại).

---

## Ghi chú rủi ro & khuyến nghị

| Rủi ro | Mức độ | Test case liên quan | Khuyến nghị |
|--------|--------|---------------------|--------------|
| Rò rỉ dữ liệu (thư cũ, nhật ký F08, tâm trạng F07, draft F06) | Cao | TC-F11-NEG-01, -02, -03, -04 | Enforce object-level authorization tại backend; DTO whitelist chỉ `body`; không auto-attach dữ liệu lịch sử. |
| Leo thang đặc quyền (điểm tựa nhận Admin) | Trung bình | TC-F11-NEG-05 | Scope token/role nghiêm ngặt cho điểm tựa; review quyền sau mỗi lần chấp nhận kết nối. |
| Stranger/admin enumerate danh sách điểm tựa | Trung bình | TC-F11-NEG-07 | List owner-scoped; detail participant-only; stranger/admin list rỗng. |
| Race condition (hủy kết nối lúc gửi tin) | Trung bình | TC-F11-NEG-10 | Kiểm tra trạng thái kết nối atomic ngay trước khi persisted tin nhắn; dùng database uniqueness/transaction. |
| Người không quyền gửi tin nhắn | Trung bình | TC-F11-NEG-06, TC-F11-AUTH-01 | Default-deny API; kiểm tra object ownership (chủ sở hữu kết nối) trước mỗi thao tác gửi. |
| Decline một chiều không được override | Thấp | TC-F11-NEG-08 | Accept sau decline trả về lỗi; trạng thái rejected không thể quay lại active qua accept. |
