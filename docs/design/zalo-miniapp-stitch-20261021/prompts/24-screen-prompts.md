# Family Bridge — 24 prompt thiết kế lại Zalo Mini App bằng Stitch

Ngày kiểm kê: 21/10/2026. Phạm vi: Mini App được mở sau khi quét QR Testing Version 5, app ID 3411096375330044972. Ảnh QR là màn phân phối bản thử nghiệm của Zalo, không phải một trang Family Bridge cần thiết kế lại.

## Cách dùng

1. Nạp tệp `DESIGN.md` đi kèm vào dự án Stitch để cố định nhận diện và component. Nội dung cốt lõi cũng được nhắc trong từng prompt nên có thể dùng riêng.
2. Mỗi lần sao chép nguyên khối `text` của một mục M01–M24. Đó là 24 prompt theo 24 bề mặt trang, không tính sheet/dialog là trang độc lập. M06 và M12 có hai biến thể vai trò trong cùng prompt; các màn nhiều trạng thái sẽ tạo nhiều frame hơn số prompt.
3. Nên tạo Trang chủ M06 và Soạn thư M10 trước để chốt chữ, nhịp bố cục và component; dùng cùng dự án/bộ component khi tạo các trang còn lại. Chọn một phương án thị giác nhất quán, không đổi palette mỗi lần.
4. Khi bàn giao, lấy cả frame chính, frame trạng thái và ghi chú hành vi. Nội dung điều khoản/AI dài phải đọc đủ, không để Stitch rút gọn vì thẩm mỹ. Tệp này chưa thay mã giao diện hoặc deploy bản mới.

## Cách đếm và độ tin cậy

Đối chiếu trực tiếp `zalo-mini-app/src/app/router.js` và các module `src/pages/` trong worktree đã dùng để đóng gói Version 5. Có **24 đường dẫn hiệu lực → 23 module trang riêng biệt**, vì `/` và `/welcome` cùng một trang. Thêm fallback `not-found` thành **24 màn = 24 prompt**. Khai báo `/privacy` bị lặp trong object router chỉ là một trang, không tính hai lần. Không đếm `legacy-zalo-login.js`, `credential-form.js`, API helper, component, sheet hoặc dialog thành trang mới.

Router hiện có `/messages/:id` trong Mini App; tài liệu parity cũ ghi web-only đã lệch mã, nên vẫn có prompt chi tiết thư. `/diary` hiện chỉ là trang chờ. `/privacy-items` lại có ghi chép/chia sẻ từng trang; hai nơi này chưa phải một module nhật ký hoàn chỉnh. `/help` chưa có số liên hệ xác minh. Trang chọn vai trò chỉ phục vụ xem trước/luồng phụ, vai trò thật do máy chủ xác định. Không đưa trang quản trị web vào danh sách Mini App.

Bản thiết kế đề xuất tái bố trí trải nghiệm điện thoại và các sheet, không có nghĩa tính năng, điều hướng mới hoặc quy tắc chưa có đã được triển khai. Kiểm kê bằng mã nguồn; chưa xem trực tiếp toàn bộ trang trên thiết bị Zalo Android/iOS. Không kết luận lỗi hiển thị cụ thể từ riêng ảnh QR.

## Danh mục trang

| Mã | Trang | Đường dẫn | Ghi chú hiện trạng |
|---|---|---|---|
| M01 | Chào mừng | `/ và /welcome` | Có giao diện; hai đường dẫn cùng một trang. |
| M02 | Cách dùng | `/how-to-use` | Có giao diện; lời hướng dẫn cần phản ánh hai cơ chế ghép nối. |
| M03 | Đăng nhập bằng mã tài khoản | `/login` | Có đăng nhập mã lớp; Zalo chỉ xuất hiện nếu máy chủ cho phép. |
| M04 | Đồng ý và quyền riêng tư | `/consent` | Có ghi nhận đồng ý theo từng mục đích. |
| M05 | Chọn vai trò xem trước | `/role-select` | Trang xem trước/luồng phụ; không cấp vai trò tài khoản thật. |
| M06 | Trang chủ — học sinh và người chăm sóc | `/home` | Một trang, hai bố cục theo vai trò thật. |
| M07 | Đồng hành bốn tuần | `/companion` | Có chương trình, hoạt động, lời mời và thỏa ước. |
| M08 | Hộp thư | `/mailbox` | Có danh sách, bộ lọc và vùng đọc chi tiết hiện tại. |
| M09 | Đọc thư và phản hồi | `/messages/:id` | Router Mini App hiện đăng ký trang chi tiết này, dù tài liệu parity cũ ghi web-only. |
| M10 | Soạn thư cảm xúc, AI và tạm dừng | `/compose` | Có soạn/lưu nháp, AI, pause server 300 giây, preview/xác nhận. |
| M11 | Thư viện thẻ cảm xúc | `/cards` | Có thư viện theo nhóm từ dữ liệu, xem trước và gửi thẻ. |
| M12 | Tín hiệu cần được lắng nghe | `/signal` | Có gửi tín hiệu cho học sinh và tiếp nhận cho người chăm sóc. |
| M13 | Tâm trạng của mình | `/mood` | Có ghi nhận, sửa, tổng hợp, lịch sử và chia sẻ từng mục. |
| M14 | Cảm xúc được chia sẻ với bạn | `/mood-shared` | Có danh sách và mở chi tiết với kiểm tra quyền hiện tại. |
| M15 | Nhật ký — trang chờ hiện tại | `/diary` | CHỈ trang thông báo; chưa có trình soạn/list nhật ký đầy đủ ở route này. |
| M16 | Ghi chép riêng và chia sẻ từng mục | `/privacy-items` | Có lưu ghi chép, trang của tôi, nhận chia sẻ và xác nhận từng trang. |
| M17 | Người đồng hành và lời mời | `/connect` | Có kết nối hoạt động, mã mời, nhận mã và xác nhận tự nguyện hai phía. |
| M18 | Đề xuất ghép nối tự nguyện | `/proposal` | Route đề xuất vẫn tồn tại; không dùng thay cho cặp admin đã ACTIVE. |
| M19 | Cá nhân | `/profile` | Có thông tin phiên, lối tới kết nối, cảm xúc, cài đặt, riêng tư và trợ giúp. |
| M20 | Cài đặt tài khoản | `/settings` | Có đổi tên, mật khẩu, mã đăng nhập tùy khả năng máy chủ và đăng xuất. |
| M21 | Riêng tư, đồng ý và xóa dữ liệu | `/privacy` | Có tổng quan chia sẻ, thu hồi, đồng ý và yêu cầu xóa. |
| M22 | Tìm trợ giúp | `/help` | Trang công khai; danh bạ hiện chỉ có thông tin đang xác minh. |
| M23 | Kiểm tra kết nối máy chủ | `/connection-check` | Có kết quả kết nối và chế độ mô phỏng riêng. |
| M24 | Không tìm thấy trang | `(đường dẫn không khớp)` | Fallback của router; không có route riêng. |

## Prompt theo từng trang

### M01 — Chào mừng

Đối chiếu: `zalo-mini-app/src/pages/welcome/index.js`. Route: `/ và /welcome`. Có giao diện; hai đường dẫn cùng một trang.

```text
M01 — CHÀO MỪNG

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới.

Mục tiêu: người mở Mini App lần đầu hiểu ngay đây là nơi học sinh THPT và cha mẹ/người chăm sóc mở lời, lắng nghe nhau. Thiết kế màn chào như một ứng dụng điện thoại tinh tế, gần gũi với tuổi teen nhưng không trẻ con.
Bố cục: logo Family Bridge nhỏ ở trên; tiêu đề trái “Mở lời nhẹ nhàng, gần nhau hơn” khoảng 24px; mô tả tối đa hai đoạn ngắn; một minh họa phẳng nhỏ về hai lời thoại đối diện, không chiếm nửa màn hình. Dùng khoảng trống và nhịp chữ làm điểm nhấn. Có thể dùng một dải giới thiệu ngắn về thẻ cảm xúc, lời nhắn và đồng hành; đừng biến thành landing page dài.
Hành động chính “Bắt đầu” dẫn đến Đăng nhập. Hành động phụ “Cách dùng” dẫn đến hướng dẫn; “Tìm trợ giúp” luôn dễ thấy và không yêu cầu đăng nhập. Logo có vùng riêng, không đặt chữ lên ảnh. Nếu chưa có asset logo được duyệt, để ô giữ chỗ có ghi chú trong bản thiết kế, không sáng tác logo rồi coi là bản chính thức.
Xuất một frame chính và một biến thể màn 320px với chữ lớn. Không thêm carousel bắt buộc, social proof, tỷ lệ thành công, chuỗi ngày hoặc màn xin quyền Zalo tự động. QR Version 5 là cổng mở bản thử nghiệm, không đặt QR vào trang chào.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M01 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M02 — Cách dùng

Đối chiếu: `zalo-mini-app/src/pages/how-to-use/index.js`. Route: `/how-to-use`. Có giao diện; lời hướng dẫn cần phản ánh hai cơ chế ghép nối.

```text
M02 — CÁCH DÙNG

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại Chào mừng.

Mục tiêu: giải thích bốn bước bắt đầu trong một màn cuộn gọn, dễ đọc bằng một tay. Header “Cách dùng”; dưới là danh sách bốn bước đánh số nhỏ, nối bằng nét rất nhẹ thay vì bốn card quảng cáo lớn.
Nội dung: 1 “Đăng nhập bằng mã tài khoản” — mã và mật khẩu do lớp cấp qua kênh riêng. 2 “Kiểm tra người đồng hành” — cặp do quản trị viên cấp đã được kết nối; nếu dùng mã mời tự nguyện thì hai bên kiểm tra và xác nhận. 3 “Mở lời theo cách của bạn” — viết lời nhắn hoặc chọn thẻ cảm xúc, xem trước rồi chủ động gửi. 4 “Đồng hành khi sẵn sàng” — chương trình bốn tuần và từng hoạt động là tự nguyện.
Thêm một khối ghi chú ngắn: ghi chép riêng không tự chia sẻ; AI là tùy chọn; tạm dừng năm phút không tự gửi khi hết giờ. Thông tin này phải đọc được, không phải chữ chú thích bé mờ.
Nút chính “Tiếp tục” dẫn đến Đăng nhập. Link “Tìm trợ giúp” luôn dùng được. Xuất frame chính, phần cuối khi cuộn và biến thể chữ lớn. Đây là chỉnh cách trình bày/lời hướng dẫn theo quy tắc đã chốt; không dựng tính năng ghép cặp mới, không hứa chương trình bắt buộc hoàn thành hoặc mọi tính năng nhật ký đã mở.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M02 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M03 — Đăng nhập bằng mã tài khoản

Đối chiếu: `zalo-mini-app/src/pages/login/index.js`. Route: `/login`. Có đăng nhập mã lớp; Zalo chỉ xuất hiện nếu máy chủ cho phép.

```text
M03 — ĐĂNG NHẬP BẰNG MÃ TÀI KHOẢN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại hướng dẫn.

Thiết kế form đăng nhập điện thoại thuần một cột. Phía trên là logo nhỏ và “Đăng nhập Family Bridge”; một câu giải thích “Dùng mã tài khoản và mật khẩu do lớp cấp”. Bỏ hoàn toàn panel ảnh/brand bên cạnh form kiểu desktop.
Hai trường có nhãn thường trực: “Mã tài khoản”, ví dụ HS001 hoặc PH001, và “Mật khẩu” có nút hiện/ẩn với vùng chạm đủ lớn. Không điền sẵn mật khẩu thật; không in tài khoản kiểm thử thật. Nút chính “Đăng nhập” toàn chiều rộng; vùng phụ hướng dẫn liên hệ người cấp tài khoản nếu quên thông tin, không dựng luồng đặt lại mật khẩu chưa có.
Vai trò thật do máy chủ xác định sau đăng nhập; không cho tự chọn để đổi quyền. Không buộc đổi mật khẩu ở lần đầu. Nếu có lựa chọn Zalo thì chỉ là biến thể khi máy chủ bật, không là cách duy nhất hay tự gắn tài khoản lớp với Zalo. Bản xem trước phải mang nhãn “Dữ liệu minh họa”, tách khỏi đăng nhập thật.
Thiết kế trạng thái đang kiểm tra, sai thông tin, tạm khóa có hướng dẫn theo phản hồi máy chủ, hết phiên, mất mạng. Lỗi gần trường hoặc vùng thông báo ổn định, không chỉ toast. Frame bàn phím mở phải giữ ô mật khẩu, lỗi và nút tới được bằng cuộn. Không làm CTA cố định chồng bàn phím. Sau thành công đi Đồng ý nếu thiếu điều khoản, nếu đã đủ thì về Trang chủ.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M03 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M04 — Đồng ý và quyền riêng tư

Đối chiếu: `zalo-mini-app/src/pages/consent/index.js`. Route: `/consent`. Có ghi nhận đồng ý theo từng mục đích.

```text
M04 — ĐỒNG Ý VÀ QUYỀN RIÊNG TƯ

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại Đăng nhập.

Thiết kế màn đọc và lựa chọn đồng ý dễ hiểu, không như biểu mẫu pháp lý bị nén vào điện thoại. Tiêu đề “Bạn đồng ý điều gì?”; mô tả ngắn; ba nhóm lựa chọn có checkbox lớn và khoảng cách rõ. Phân biệt mục cần để dùng dịch vụ với mục tùy chọn bằng chữ, không chỉ màu.
Giữ nguyên bản văn hiện hành sau trong vùng nội dung đọc đầy đủ:
“Điều khoản sử dụng” — “Cần chấp nhận để dùng Family Bridge: quy tắc ứng xử, trách nhiệm gia đình và giới hạn hỗ trợ. Không thay thế hỗ trợ chuyên môn.”
“AI gợi ý cách diễn đạt” — “Tùy chọn. Cho phép AI gợi ý cách diễn đạt khi bạn viết tin nhắn. Bạn luôn xem và duyệt trước khi gửi; tắt vẫn dùng được các tính năng khác.”
“Nghiên cứu tổng hợp” — “Tùy chọn. Cho phép dùng dữ liệu đã ẩn danh cho khảo sát nghiên cứu. Từ chối không ảnh hưởng việc sử dụng ứng dụng.”
Không tick sẵn lựa chọn chưa được chấp nhận; lựa chọn hiện có phản ánh trạng thái máy chủ. Nút “Xác nhận và tiếp tục” chỉ phụ thuộc điều khoản cần thiết, không ép AI hoặc nghiên cứu. Nội dung dài được xuống dòng/cuộn, không rút gọn để vừa layout. Có “Tìm trợ giúp”.
Xuất frame chưa chọn, đã chọn điều khoản nhưng bỏ hai tùy chọn, và lỗi lưu vẫn giữ lựa chọn. Không checkbox “Đồng ý tất cả”, không màu làm người dùng hiểu lầm phải bật AI. Thông báo chi tiết về Gemini nằm ở luồng chủ động xin gợi ý, không thay thế bằng checkbox này.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M04 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M05 — Chọn vai trò xem trước

Đối chiếu: `zalo-mini-app/src/pages/role-select/index.js`. Route: `/role-select`. Trang xem trước/luồng phụ; không cấp vai trò tài khoản thật.

```text
M05 — CHỌN VAI TRÒ XEM TRƯỚC

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại hướng dẫn.

Đây là trang chọn GIAO DIỆN XEM TRƯỚC, không phải đăng ký hay cấp quyền tài khoản thật. Tiêu đề “Bạn muốn xem giao diện của ai?”; nhãn “Dữ liệu minh họa” phải hiện rõ ngay đầu màn. Một câu giải thích vai trò tài khoản thật được xác định khi đăng nhập.
Hai lựa chọn xếp dọc: “Con — học sinh THPT” và “Người chăm sóc”. Mỗi hàng dùng một biểu tượng nét đồng bộ, tiêu đề, mô tả một câu về tác vụ: con ghi nhận cảm xúc/mở lời; người chăm sóc lắng nghe/phản hồi. Tránh minh họa trẻ nhỏ hoặc ảnh gia đình quá lý tưởng. Mỗi lựa chọn là nút vùng chạm lớn, đi thẳng vào bản xem trước tương ứng; không thêm bước xác nhận dư.
Nút phụ “Đăng nhập tài khoản thật” và “Tìm trợ giúp” có thể đặt ở cuối để tránh mắc kẹt trong demo. Đây là liên kết điều hướng đề xuất trong thiết kế, không tuyên bố hiện đã có trong trang. Không hỏi ngày sinh, giới tính, thông tin con hay quan hệ gia đình.
Xuất frame chính và trạng thái đang chuyển vào bản xem trước. Không cho chọn “Quản trị viên”, không đổi role của phiên đang đăng nhập, không viết “Tiếp tục với tư cách phụ huynh” khiến người dùng hiểu đây là quyền thật. Giữ nhãn demo xuyên suốt các frame liên quan.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M05 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M06 — Trang chủ — học sinh và người chăm sóc

Đối chiếu: `zalo-mini-app/src/pages/home/index.js`. Route: `/home`. Một trang, hai bố cục theo vai trò thật.

```text
M06 — TRANG CHỦ — HỌC SINH VÀ NGƯỜI CHĂM SÓC

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Có tab dưới; Trang chủ được chọn.

Thiết kế HAI frame chính cùng hệ giao diện, không ghép dữ liệu hai vai vào một dashboard.
Frame học sinh: header gọn “Chào bạn,” và “Hôm nay bạn cảm thấy thế nào?”. Trọng tâm đầu màn là ghi nhận cảm xúc với nhãn Vui, Bình an, Lo lắng, Mệt, Khó nói thành lời; bố trí chip xuống dòng/chọn rõ, không hàng ngang bé xíu. Hành động nổi bật “Soạn thư cảm xúc”; lối vào phụ Thẻ cảm xúc và “Con cần được lắng nghe”. Dưới là hàng người đồng hành hiện tại, mục Đồng hành bốn tuần và Hộp thư gần đây. Nhật ký chỉ dẫn đến trang chờ hiện tại, không dựng trang đã có nội dung.
Frame người chăm sóc: lời chào ngắn; trọng tâm “Lời nhắn gửi đến anh/chị” với CTA mở Hộp thư; lối vào soạn lời nhắn; ghi nhận cảm xúc CỦA CHÍNH mình; bài học ngắn khi có nội dung phát hành; Đồng hành bốn tuần. Không có biểu đồ theo dõi tâm trạng của con hoặc quyền đọc nhật ký con. Chỉ nội dung người dùng thực sự nhận mới hiện.
Màn đầu chỉ có một vùng nhấn chính; các lối tắt phụ là hàng nhỏ hoặc hai ô vừa tay, không ma trận dashboard. Nhãn người đồng hành và badge dùng dữ liệu đã có; số liệu mock phải ghi chú ngoài UI là minh họa. Không bịa số chưa đọc, tỷ lệ tiến bộ hay “gia đình hạnh phúc hơn”.
Thêm biến thể chưa có kết nối, đang tải từng phần và lỗi tải cục bộ. Cặp lớp do admin cấp đang hoạt động không hiện CTA xác nhận ghép đôi. Tìm trợ giúp luôn tới được. Nội dung dài nằm dưới cuộn, không thu nhỏ toàn màn cho vừa một ảnh.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M06 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M07 — Đồng hành bốn tuần

Đối chiếu: `zalo-mini-app/src/pages/companion/index.js`. Route: `/companion`. Có chương trình, hoạt động, lời mời và thỏa ước.

```text
M07 — ĐỒNG HÀNH BỐN TUẦN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Có tab dưới; Đồng hành được chọn.

Mục tiêu: một chương trình đồng hành tự nguyện có nhịp nhẹ nhàng, không là bảng thành tích. Header “Đồng hành”; lời dẫn một câu về làm điều nhỏ cùng nhau. Người chưa tham gia thấy giới thiệu chương trình, “Xem trước hướng dẫn từng tuần”, “Tham gia chương trình”, “Để sau”. Tham gia có xác nhận riêng.
Người đang tham gia thấy bộ chọn Tuần 1–4 và nội dung một tuần tại một thời điểm. Bốn chủ đề: nhận diện cảm xúc/mở lời; giảm so sánh/ghi nhận bản sắc; ranh giới riêng tư/niềm tin; cảm ơn/xin lỗi/thỏa ước gia đình. Các tuần phát hành đều mở, không ổ khóa tuần sau. Chỉ một tuần được mở rộng để tránh bốn trang nội dung dồn trên màn.
Hoạt động có tên, hướng dẫn theo vai, mục tiêu, cách làm và thời lượng nếu nguồn đã phát hành cung cấp. “Xem chi tiết hoạt động” mở vùng đọc hoặc sheet. Phân biệt lời mời chung với tiến độ cá nhân: Mời cùng làm, Chấp nhận/Từ chối, Tôi đã làm, Bỏ qua, Đặt lại; không tick hộ người kia. Hiển thị chờ phản hồi bằng chữ.
Tuần 4 có sheet thỏa ước: cam kết đầy đủ, bản đang hiệu lực và bản đề xuất mới được phân biệt rõ; “Tôi xác nhận”, “Để sau”, rút đề xuất khi phù hợp. Chỉ hiệu lực khi hai người xác nhận cùng phiên bản. “Nghỉ chương trình” có xác nhận, không làm mất công cụ giao tiếp.
Xuất frame trước tham gia, frame một tuần đang hoạt động, sheet chi tiết và sheet thỏa ước. Không vòng tròn % giả, streak, huy hiệu cạnh tranh, ép tham gia khảo sát. Có nhắc tùy chọn dùng sổ giấy, không dựng module khảo sát/lịch hẹn chưa có trang.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M07 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M08 — Hộp thư

Đối chiếu: `zalo-mini-app/src/pages/mailbox/index.js`. Route: `/mailbox`. Có danh sách, bộ lọc và vùng đọc chi tiết hiện tại.

```text
M08 — HỘP THƯ

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Có tab dưới; Hộp thư được chọn.

Thiết kế hộp thư ưu tiên đọc, không chia đôi danh sách/chi tiết như email desktop. Header “Hộp thư”; hành động phụ soạn thư đủ rõ. Dưới có bộ lọc “Tất cả”, “Lời nhắn & Thẻ cảm xúc”, “Tín hiệu kết nối”, “Lời hồi âm”; tên dài xuống dòng hoặc bố trí hai hàng gọn, không font bé.
Danh sách một cột dùng hàng trắng/ngăn cách nhẹ. Mỗi hàng có loại nội dung, tiêu đề đã được cung cấp, người gửi/người nhận khi có dữ liệu, hướng nhận/gửi và thời gian. Chưa đọc biểu thị chấm kèm nhãn, không chỉ thay màu. API danh sách không cung cấp snippet: tuyệt đối không tự thêm đoạn tâm sự dưới tiêu đề. Không cần ô tìm kiếm hay swipe xóa nếu chức năng chưa hỗ trợ.
Chạm hàng mở màn đọc trong cùng hành trình mobile với nút quay lại; có thể chuyển đến trang Chi tiết tin nhắn sẵn có. Vùng chi tiết inline đang có trong mã cần được tái bố trí thành chế độ đọc một cột, không đặt cạnh danh sách. Đây là đề xuất bố cục, không tạo thêm trang nghiệp vụ.
Xuất danh sách có thư, không có thư với “Soạn thư cảm xúc”, đang tải và mất mạng. Có “Tải thêm” thay vì giả cuộn vô tận; badge chỉ từ số thật đã tải. Trường hợp không xác định kết quả gửi phải hướng kiểm tra trạng thái, không tự khẳng định đã gửi. Minh họa nội dung trung tính, không dùng tâm sự thật. Không hiện inbox rỗng như lỗi người dùng chưa đủ tích cực.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M08 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M09 — Đọc thư và phản hồi

Đối chiếu: `zalo-mini-app/src/pages/message/index.js`. Route: `/messages/:id`. Router Mini App hiện đăng ký trang chi tiết này, dù tài liệu parity cũ ghi web-only.

```text
M09 — ĐỌC THƯ VÀ PHẢN HỒI

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con: đề xuất ẩn tab dưới để tập trung đọc; quay về Hộp thư.

Thiết kế màn đọc thư một cột: nút quay lại Hộp thư, nhãn loại nội dung và thông tin đối phương vừa đủ, tiêu đề, thời gian, nội dung lời đã gửi với cỡ chữ 16–18px và dòng thoáng. Không bong bóng chat giả nếu dữ liệu là thư, không tên/ảnh cá nhân thật. Phân biệt thư mình gửi với thư mình nhận.
Thư nhận có vùng “Phản hồi thư này”: mẫu trả lời nhanh từ dữ liệu hiện có dưới dạng chip, chọn mẫu chỉ điền vào ô soạn, luôn sửa được. Textarea có nhãn và nút “Gửi phản hồi” rõ người nhận theo thư đang mở. Không tự gửi khi chạm mẫu. Thư mình gửi không hiển thị khung phản hồi sai chiều.
AI là hành động phụ “Gợi ý cách diễn đạt”; trạng thái chưa đồng ý mở sheet “Trước khi dùng gợi ý AI”. Sheet nói rõ câu đang viết/ngữ cảnh tự thêm được xử lý bởi Gemini của Google, không gửi toàn lịch sử/nhật ký; bản gốc và gợi ý không đính kèm cho người nhận; người viết tự xem sửa trước khi gửi. Có “Đồng ý và tạo gợi ý” và “Viết tay thôi”, không tick sẵn. Nội dung pháp lý đầy đủ dùng từ ứng dụng, không rút gọn để vừa frame.
Gợi ý xuất hiện trong panel riêng với Dùng gợi ý/Tạo gợi ý mới/Bỏ; Dùng chỉ điền ô, không gửi. Sửa ô soạn làm gợi ý cũ không còn phù hợp. AI lỗi vẫn viết/gửi thủ công được.
Xuất frame đọc thư nhận, frame thư đã gửi, vùng phản hồi bàn phím mở và sheet AI. Thêm trạng thái nội dung không còn quyền xem/đã thu hồi và gửi chưa rõ kết quả. Không chẩn đoán tâm lý, không ép trả lời ngay, không thêm xác nhận đọc/seen kiểu mạng xã hội nếu không có dữ liệu.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M09 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M10 — Soạn thư cảm xúc, AI và tạm dừng

Đối chiếu: `zalo-mini-app/src/pages/compose/index.js`. Route: `/compose`. Có soạn/lưu nháp, AI, pause server 300 giây, preview/xác nhận.

```text
M10 — SOẠN THƯ CẢM XÚC, AI VÀ TẠM DỪNG

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con: đề xuất ẩn tab dưới khi viết; có quay lại giữ nháp.

Đây là luồng quan trọng nhất. Thiết kế một màn soạn điện thoại yên tĩnh, dành phần lớn diện tích cho câu người dùng viết. Header “Soạn thư cảm xúc”; trạng thái “Bản nháp riêng tư • Chưa gửi”; hàng “Gửi đến” với tên người đã kết nối và “Đổi”; textarea có nhãn “Lời con muốn gửi” hoặc “Lời bạn muốn gửi” theo vai. Giới hạn 4.000 ký tự; hướng dẫn và bộ đếm dễ đọc.
AI nằm dưới textarea như công cụ phụ, không chiếm panel riêng ngang desktop. Nút xin gợi ý mở sheet đồng ý chi tiết trước lần dùng khi thiếu đồng ý: dữ liệu là câu đang soạn và ngữ cảnh tự thêm; bên xử lý Gemini của Google; không gửi lịch sử/nhật ký/người khác; bản gốc và gợi ý không gửi kèm; người dùng luôn tự duyệt. Có “Đồng ý và tạo gợi ý”, “Viết tay thôi”. Chữ đầy đủ được cuộn, không ép đồng ý.
Gợi ý nằm trong panel riêng, có “Dùng gợi ý”, “Tạo gợi ý mới”, “Bỏ”; không tự thay câu gốc. Khi đã sửa câu, gợi ý cũ phải yêu cầu tạo lại. Đang tạo có “Hủy chờ gợi ý”; AI lỗi/tắt/không rõ trạng thái vẫn giữ viết tay và lưu nháp. Nút chọn thẻ mở thư viện gửi thẻ riêng, không giả thẻ đang gắn với bản nháp nếu chưa hỗ trợ.
Hành động chính “Xem trước nội dung”; phụ “Lưu nháp riêng”, “Bắt đầu 5 phút nghỉ”. Pause là lựa chọn, cố định 300 giây theo máy chủ. Khi đã chọn pause, khóa gửi bản nháp đó trước mốc; hết giờ vẫn nháp, cần xem và bấm xác nhận. Hiển thị thời gian nhẹ, không vòng thở hoạt ảnh lớn. Không lựa chọn 1/3/10 phút, không tự gửi khi hết giờ/mở lại app.
Xuất các frame: soạn chính; sheet AI; gợi ý; đang pause; xem trước và xác nhận. Preview có ĐÚNG toàn bộ lời cuối và người nhận, nút sửa/giữ nháp và “Gửi cho [người nhận]”. Đổi lời/người nhận phải xem lại. Sheet xung đột bản nháp giữ được câu đang nhập, cho xem bản mới thay vì tự ghi đè. Mạng lỗi không mất chữ; chưa rõ gửi phải kiểm tra. “Tìm trợ giúp” luôn mở ngay, kể cả lúc pause. Bàn phím không che ô soạn/nút tới được qua cuộn.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M10 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M11 — Thư viện thẻ cảm xúc

Đối chiếu: `zalo-mini-app/src/pages/cards/index.js`. Route: `/cards`. Có thư viện theo nhóm từ dữ liệu, xem trước và gửi thẻ.

```text
M11 — THƯ VIỆN THẺ CẢM XÚC

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Trang chủ/Soạn thư; có quay lại.

Thiết kế thư viện thẻ giúp mở lời trong vài thao tác. Header “Thẻ cảm xúc”; một câu “Chọn lời gần với điều bạn muốn nói”. Bộ lọc “Tất cả” và các nhóm thực sự có dữ liệu; ví dụ Áp lực học tập & kỳ vọng, Cần không gian & ranh giới, Mong muốn được thấu hiểu. Đây là ví dụ nhóm đã có trong mã, không cố định sáng tác thêm sáu nhóm.
Danh sách thẻ một cột ở màn hẹp; mỗi thẻ có tiêu đề, đoạn nội dung dễ đọc và biểu tượng nét nhẹ. Có thể dùng hai cột chỉ khi chữ vẫn đọc tốt ở màn rộng, không ép thành poster bé. Tạo điểm nhấn bằng giấy sáng và viền ấm, không mỗi cảm xúc một màu đánh giá tốt/xấu. Dùng câu giả lập trung tính “Mình muốn được nghe hết câu trước khi nhận lời khuyên”.
Chạm thẻ mở sheet: đọc toàn bộ thẻ, chọn MỘT người đang kết nối, lời ghi kèm tùy chọn tối đa 1.000 ký tự. Sau “Xem trước” hiển thị đúng thẻ/phiên bản/nội dung/người nhận/lời kèm; cuối cùng “Gửi thẻ” và “Chưa gửi lúc này”. Không gửi ngay khi chọn thẻ hoặc chọn người.
Xuất frame thư viện, không có thẻ của nhóm, sheet chọn người/lời kèm và sheet xác nhận. Có lối “Tự viết lời nhắn”. Không có kết nối hướng tới Kết nối; nội dung thay đổi yêu cầu xem lại; lỗi mạng giữ lời kèm; gửi chưa rõ kết quả có kiểm tra trạng thái. Không thêm ô tìm kiếm, yêu thích hay chia sẻ mạng xã hội nếu chưa có chức năng tương ứng.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M11 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M12 — Tín hiệu cần được lắng nghe

Đối chiếu: `zalo-mini-app/src/pages/signal/index.js`. Route: `/signal`. Có gửi tín hiệu cho học sinh và tiếp nhận cho người chăm sóc.

```text
M12 — TÍN HIỆU CẦN ĐƯỢC LẮNG NGHE

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con; có quay lại và lối Tìm trợ giúp độc lập.

Thiết kế HAI biến thể vai trò với cùng hệ component. Frame học sinh có tiêu đề “Con cần được lắng nghe”, lời dẫn không gây áp lực. Trình tự rõ: chọn một người đã kết nối; chọn một nhu cầu; xem trước thông điệp; chủ động gửi.
Ba nhu cầu dựa trên dữ liệu: muốn trò chuyện yên tĩnh, cần người ở bên, muốn hẹn thời điểm trao đổi. Mỗi lựa chọn là radio row cao, biểu tượng nhỏ và một câu rõ; không là ba card nằm ngang. Tuy có nhu cầu hẹn trao đổi, API hiện KHÔNG nhận ngày/giờ cụ thể: không vẽ lịch hoặc time picker. Cũng không thêm ô lời nhắn tự do vì payload hiện không nhận ghi chú.
Preview hiển thị người nhận và thông điệp do máy chủ cung cấp. Nút chính gửi tín hiệu có label rõ; chọn nhu cầu chưa gửi. Sau server xác nhận mới hiện “Đã gửi tín hiệu”; không hứa đối phương đã xem/sẽ có mặt. Chưa có kết nối có hướng dẫn kết nối nhưng Tìm trợ giúp vẫn mở được ngay.
Frame người chăm sóc: “Tín hiệu lắng nghe”, danh sách tín hiệu mình nhận, người gửi, nhu cầu, thời gian, trạng thái; “Đã nhận tín hiệu” là hành động xác nhận tiếp nhận, không tự nhắn thay hoặc chuyển cho người khác. Empty state nhẹ, không kích thích lo lắng.
Xuất frame học sinh, preview/thành công, frame người chăm sóc và mất mạng chưa rõ gửi. Luồng này không chịu khoảng dừng năm phút của thư. Không nút SOS giả, không hứa trực 24/7, không gắn nhãn khẩn cấp y tế và không chuyển tiếp tâm sự tự động.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M12 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M13 — Tâm trạng của mình

Đối chiếu: `zalo-mini-app/src/pages/mood/index.js`. Route: `/mood`. Có ghi nhận, sửa, tổng hợp, lịch sử và chia sẻ từng mục.

```text
M13 — TÂM TRẠNG CỦA MÌNH

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Trang chủ/Cá nhân; có quay lại.

Thiết kế trang ghi nhận cảm xúc cá nhân, không biến thành bảng chấm điểm sức khỏe. Header “Tâm trạng của mình”; nhãn khóa “Chỉ mình bạn” rõ trước nút lưu. Khối đầu “Cảm xúc hôm nay” có lựa chọn từ máy chủ, tương thích các mã Vui, Bình an, Mệt, Buồn, Lo lắng, Bực, Khó nói. Không gán xanh=tốt đỏ=xấu. Ghi chú tùy chọn có nhãn, giới hạn theo ứng dụng; hành động chính “Lưu tâm trạng hôm nay”.
Dưới là tổng hợp mô tả cá nhân tối đa 90 ngày khi có dữ liệu và Lịch sử phân trang; dùng danh sách theo ngày dễ đọc, không vòng tròn wellness score. Mỗi mục có cảm xúc, ghi chú của chính mình, Sửa mục này, Chia sẻ mục này. Một ngày đã có mục thì hướng sửa, không tạo hai mục. Ngày theo máy chủ.
Sheet chia sẻ phải đọc đủ cảm xúc và ghi chú, chọn đúng một người đang kết nối, xác nhận rõ. Hiện danh sách người đã nhận mục này và trạng thái Đang chia sẻ/Bản cũ cần chia sẻ lại/Đã thu hồi/Kết nối đã kết thúc. Sửa nội dung không tự chia sẻ bản mới. Thu hồi có xác nhận, giải thích chặn lần đọc mới, không hứa xóa bản chụp ngoài ứng dụng.
Xuất frame ghi nhận chính, lịch sử có mục, sheet chia sẻ và trạng thái mục vừa thay đổi cần xem lại. Empty state không gây tội lỗi; lỗi giữ ghi chú; link “Được chia sẻ với bạn” tách khỏi lịch sử của mình. Người chăm sóc chỉ xem cảm xúc của chính họ ở đây, không biểu đồ giám sát con. Không streak, trung bình cảm xúc, chẩn đoán hay xếp hạng gia đình.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M13 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M14 — Cảm xúc được chia sẻ với bạn

Đối chiếu: `zalo-mini-app/src/pages/mood-shared/index.js`. Route: `/mood-shared`. Có danh sách và mở chi tiết với kiểm tra quyền hiện tại.

```text
M14 — CẢM XÚC ĐƯỢC CHIA SẺ VỚI BẠN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Cá nhân; có quay lại.

Thiết kế màn “Được chia sẻ với bạn” dành cho người nhận cảm xúc mà người khác chủ động chia sẻ từng mục. Một câu giải thích: bạn chỉ xem các mục được chọn, không được mở toàn bộ lịch sử của họ. Không dùng giao diện theo dõi con hoặc biểu đồ tổng hợp cảm xúc đối phương.
Danh sách một cột, mỗi hàng chỉ metadata được cấp từ máy chủ, tên người chia sẻ khi có, ngày và nút “Mở nội dung”. Không hiển thị ghi chú nhạy cảm ngay trong danh sách trước khi kiểm tra quyền chi tiết. Có “Tải thêm”; không bịa số tổng.
Chạm mở nội dung thành sheet hoặc chế độ đọc tập trung trên cùng trang, gồm cảm xúc và ghi chú thực sự được chia sẻ. Header nêu người gửi/ngày nếu nguồn cung cấp; nút “Đóng nội dung” rõ. Không thêm AI phản hồi, bình luận hay lưu bản sao nếu trang này chưa hỗ trợ. Không thêm tự động chuyển tiếp.
Xuất frame danh sách, nội dung mở, empty state “Chưa có mục được chia sẻ với bạn” và trạng thái “Không còn xem được” khi thu hồi/hết kết nối hoặc mục thay đổi. Khi quyền không còn, bỏ nội dung khỏi frame hiện tại và cho quay lại danh sách; không làm mờ nhưng vẫn để đọc phía sau overlay. Lỗi tải có Thử lại, không dùng lời khẳng định thông tin vẫn đúng sau revoke.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M14 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M15 — Nhật ký — trang chờ hiện tại

Đối chiếu: `zalo-mini-app/src/pages/diary/index.js`. Route: `/diary`. CHỈ trang thông báo; chưa có trình soạn/list nhật ký đầy đủ ở route này.

```text
M15 — NHẬT KÝ — TRANG CHỜ HIỆN TẠI

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Có tab dưới; Nhật ký được chọn.

Thiết kế lại đúng trạng thái HIỆN CÓ của tab Nhật ký: một trang chờ có chủ ý, tinh tế và trung thực. Header “Nhật ký”; biểu tượng sổ nhỏ hoặc minh họa nét đơn giản, không ảnh nền; tiêu đề “Nhật ký sẽ mở ở bản đầy đủ”.
Giữ nội dung “Nhật ký riêng và nhật ký song hành là nội dung cá nhân của bạn. Mỗi trang chỉ được chia sẻ với người đồng hành khi bạn chọn chia sẻ trang đó.” Đoạn này đọc thoáng, không là chữ bé ở cuối card. Chỉ cần một vùng nội dung trung tâm có nhịp dọc hợp lý, không trống cứng như trang lỗi và không chiếm cả màn bằng illustration.
Tab dưới vẫn có đủ năm mục và Nhật ký đang chọn. Có đường quay về Trang chủ/đi mục khác qua tab; Tìm trợ giúp tới được. Không tạo CTA “Viết nhật ký”, lịch, danh sách trang mẫu, folder, search, upload ảnh, đồng bộ sổ giấy hay onboarding nhiều bước như thể tính năng đã triển khai. Không tạo thông báo “sắp ra mắt ngày…” nếu chưa có ngày được duyệt.
Xuất frame chính và bản chữ lớn ở màn 320px. Đây là thiết kế trạng thái chờ, không phải thiết kế sản phẩm nhật ký tương lai. Route Chia sẻ từng mục hiện có các thao tác ghi chép riêng là trang riêng trong bộ prompt; đừng tự hợp nhất thành tab Nhật ký đầy đủ hoặc thay đổi phạm vi triển khai.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M15 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M16 — Ghi chép riêng và chia sẻ từng mục

Đối chiếu: `zalo-mini-app/src/pages/privacy/items.js`. Route: `/privacy-items`. Có lưu ghi chép, trang của tôi, nhận chia sẻ và xác nhận từng trang.

```text
M16 — GHI CHÉP RIÊNG VÀ CHIA SẺ TỪNG MỤC

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại Riêng tư & đồng ý.

Thiết kế màn “Chia sẻ từng mục” như nơi quản lý ghi chép cụ thể. Lời dẫn rõ: ghi chép mới là riêng tư, kết nối không mở toàn bộ nhật ký. Đây là route đã có thao tác dù tab Nhật ký chính vẫn là trang chờ; không tuyên bố đã có bộ nhật ký hoàn chỉnh.
Trình tự một cột: vùng “Ghi chép riêng” có textarea nhãn rõ, tối đa 4.000 ký tự và “Lưu ghi chép riêng”; sau đó “Các trang của tôi”; cuối là “Được chia sẻ với tôi”. Có thể dùng nhóm thu gọn/điểm neo để giảm chiều dài, nhưng không dựng chức năng tìm kiếm, folder hoặc editor định dạng mới. Trang chưa có tiêu đề dùng “Trang riêng”.
Mỗi trang của tôi có nội dung đủ đọc, chọn một người nhận đang kết nối và “Xem và xác nhận chia sẻ trang này”. Sheet xác nhận đọc toàn bộ bản mới nhất và đúng người; chỉ bấm xác nhận mới chia sẻ. Sau lưu riêng ghi “Đã lưu riêng. Chưa chia sẻ cho ai.”; sau chia sẻ nêu chỉ trang đó, các trang khác vẫn riêng tư.
Mục nhận có “Mở trang được chia sẻ”, kiểm tra quyền hiện tại trước nội dung; mất quyền không tiếp tục trưng nội dung. Có lối “Thu hồi, hủy kết nối & yêu cầu xóa” về trang Riêng tư và Tìm trợ giúp. Hiện bản giới hạn 20 trang gần nhất nếu dữ liệu bị giới hạn, không hứa nút tải thêm hoạt động khi API/luồng hiện chưa nối.
Xuất frame chính, sheet xác nhận, không có trang và xung đột nội dung cần đọc lại. Mạng lỗi giữ chữ; không tự retry chia sẻ. Không phát minh cộng tác realtime, share-all hoặc thư viện công khai.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M16 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M17 — Người đồng hành và lời mời

Đối chiếu: `zalo-mini-app/src/pages/connect/index.js`. Route: `/connect`. Có kết nối hoạt động, mã mời, nhận mã và xác nhận tự nguyện hai phía.

```text
M17 — NGƯỜI ĐỒNG HÀNH VÀ LỜI MỜI

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Cá nhân/Trang chủ; có quay lại.

Thiết kế trang “Người đồng hành” bằng danh sách người và luồng mời gọn, không đổ mọi form lên cùng một màn dài. Đầu trang là kết nối đang hoạt động, tên tự khai báo và loại Chính/Dự phòng khi có dữ liệu; số người theo dữ liệu thật. Nhắc kết nối không cho đọc mọi nhật ký.
Nếu cặp được lớp cấp đã hoạt động, hiển thị Đã kết nối; không bắt nhập mã hoặc xác nhận thêm. Mã mời là luồng tự nguyện riêng: hai lựa chọn “Tạo mã mời” và “Nhập mã mời”. Mở sheet tương ứng; mã tạo có hạn dùng/trạng thái từ máy chủ và Tạo mã mới thay thế khi phù hợp. Không bịa QR mời nếu chỉ có mã văn bản.
Nhập mã xong phải kiểm tra tên đối phương và quan hệ, ghi tên là tự khai báo. Người nhận mã tự đồng ý, người tạo tự xác nhận; trạng thái chờ rõ bên nào, không coi vừa nhập mã là kết nối xong. Lời mời gần đây có hướng gửi/nhận, Chờ/Đã xác nhận/Từ chối/Hủy/Hết hạn theo dữ liệu; hành động hợp trạng thái. Có chỉnh tên gọi để kiểm tra đúng người nếu chức năng sẵn có.
Hủy kết nối đặt trong menu/hàng phụ có xác nhận giải thích mất truy cập nội dung chia sẻ tiếp theo; không nút đỏ lớn cạnh CTA mời. Không tự hồi sinh kết nối khi nạp lại danh sách. Người hỗ trợ dự phòng vẫn là người đồng ý kết nối, không tự forward tâm sự.
Xuất frame đã có kết nối, chưa có kết nối, sheet nhập/tạo mã, xác nhận đúng người và dialog hủy. Thiếu mạng giữ input, không giả thành công. Không truy cập danh bạ Zalo, gợi ý bạn bè, tự động ghép tài khoản hay trang quản trị cấp phát.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M17 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M18 — Đề xuất ghép nối tự nguyện

Đối chiếu: `zalo-mini-app/src/pages/proposal/index.js`. Route: `/proposal`. Route đề xuất vẫn tồn tại; không dùng thay cho cặp admin đã ACTIVE.

```text
M18 — ĐỀ XUẤT GHÉP NỐI TỰ NGUYỆN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Trang chủ/Kết nối; có quay lại.

Thiết kế trang “Xác nhận ghép nối” cho đề xuất tự nguyện còn tồn tại trong sản phẩm. Đầu trang có tên người được đề xuất, vai trò, thông tin lớp/nguồn khi có; nêu tên là tự khai báo, không đóng dấu xác minh danh tính giả.
Trọng tâm là kiểm tra đúng người. Nút chính “Đúng người, tôi đồng ý kết nối”; hành động phụ “Không đúng người / Từ chối” và “Để sau” đều dễ thấy. Sau một phía xác nhận, hiện “Bạn đã đồng ý — đang chờ người kia xác nhận”; chỉ báo kết nối xong khi máy chủ xác nhận cả hai. Người được phép có Hủy đề xuất; từ chối/hủy đều có dialog rõ.
Phải tách trường hợp cặp do quản trị viên cấp đã ACTIVE: giao diện chỉ thông báo đã kết nối và dẫn quản lý kết nối, tuyệt đối không yêu cầu hai bên xác nhận lại cặp đó. Đây là quy tắc hiện hành ưu tiên hơn lời dẫn cũ “lớp ghép thì cần xác nhận” có thể còn trong bản UI.
Xuất frame cần xác nhận, chờ phía kia, đã kết nối, không có đề xuất và dialog từ chối. Nội dung giải thích kết nối không đồng nghĩa mở dữ liệu riêng. Không checkbox đồng ý AI/điều khoản thay người dùng, không tự chia sẻ tâm trạng sau ghép, không nút “chấp nhận tất cả”. Lỗi tải giữ trạng thái chưa biết thay vì dựng đề xuất. CTA có thể dẫn về Người đồng hành khi đề xuất không còn hiệu lực.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M18 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M19 — Cá nhân

Đối chiếu: `zalo-mini-app/src/pages/profile/index.js`. Route: `/profile`. Có thông tin phiên, lối tới kết nối, cảm xúc, cài đặt, riêng tư và trợ giúp.

```text
M19 — CÁ NHÂN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Có tab dưới; Cá nhân được chọn.

Thiết kế tab “Cá nhân” như trang tiện ích gọn gàng, không phải dashboard thành tích. Đầu trang là avatar đơn giản hoặc ký tự tên, tên hiển thị do người dùng đặt và vai trò thật. Không kéo ảnh Zalo tự động hoặc hiện tài khoản cá nhân thật trong mockup. Demo có nhãn Dữ liệu minh họa và chức năng đổi vai trò xem trước; phiên thật không có đổi role tùy ý.
Dùng nhóm danh sách thay vì mỗi nút là một card lớn: Người đồng hành/Kết nối & lời mời; Tâm trạng của mình; Được chia sẻ với bạn; Cài đặt; Riêng tư & đồng ý; Kiểm tra kết nối máy chủ; Tìm trợ giúp. Mỗi hàng icon 20–24px, label rõ, chevron nhỏ, vùng chạm 48px trở lên. Nhãn dài được wrap, không cắt mất nghĩa. Mô tả quyền riêng tư chỉ đặt nơi cần thiết.
Đăng xuất nằm riêng cuối trang, có dialog “Đăng xuất?” và Ở lại/Đăng xuất, chỉ báo hoàn thành khi thành công. Nếu có sửa tên nhanh theo bản hiện có, đưa vào sheet yêu cầu mật khẩu hiện tại với tài khoản lớp; đừng hỏi mật khẩu trên hàng tóm tắt. Không lộ mã đăng nhập/mật khẩu trong preview chia sẻ.
Xuất frame tài khoản học sinh, tài khoản người chăm sóc, demo và dialog đăng xuất. Học sinh và phụ huynh dùng cùng cấu trúc; không menu xem nhật ký con, điểm số hay quyền admin. Không thêm tổng số tâm sự, huy hiệu, trạng thái online hoặc hồ sơ công khai. Tìm trợ giúp không nằm trong menu ẩn nhiều lớp.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M19 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M20 — Cài đặt tài khoản

Đối chiếu: `zalo-mini-app/src/pages/settings/index.js`. Route: `/settings`. Có đổi tên, mật khẩu, mã đăng nhập tùy khả năng máy chủ và đăng xuất.

```text
M20 — CÀI ĐẶT TÀI KHOẢN

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Cá nhân; có quay lại.

Thiết kế “Cài đặt” bằng danh sách ba mục tài khoản, mỗi lần chỉ mở một form trong sheet/màn con thuộc cùng trang: Tên hiển thị, Mật khẩu, Mã đăng nhập. Giá trị tóm tắt tối thiểu; mật khẩu luôn che, không in giá trị thật. Một nhóm phụ dẫn Riêng tư & đồng ý và Đăng xuất.
Form Tên hiển thị có tên mới và mật khẩu hiện tại đối với tài khoản lớp; form mật khẩu có mật khẩu hiện tại, mật khẩu mới và xác nhận nếu luồng hiện có yêu cầu; form mã đăng nhập có mã mới và mật khẩu hiện tại. Giữ nhãn/giới hạn theo phản hồi ứng dụng, không tự hứa tiêu chí mật khẩu mới. Input 16px, label ở trên, hiện/ẩn mật khẩu có tên rõ, lỗi sát trường.
Khả năng sửa do máy chủ trả về. Nếu không cho đổi mật khẩu/mã, mục đó disabled kèm lý do và bước hỗ trợ phù hợp, không cho nhấn rồi mới báo không hỗ trợ. Không áp quy tắc đổi tài khoản lớp sang phiên Zalo. Không bắt đổi mật khẩu lần đầu, không làm luồng đăng ký/reset email hoặc liên kết Zalo khi chưa hỗ trợ.
Xuất frame danh sách, sheet đổi mật khẩu với bàn phím mở, sheet đổi tên/mã và lỗi mật khẩu hiện tại. Sau lưu thành công hiển thị thông báo ổn định và hành vi phiên đúng ứng dụng; chưa được máy chủ xác nhận thì không hiển thị thành công. Đăng xuất có dialog riêng. Không đặt form mật khẩu ngay cạnh card giới thiệu cỡ lớn như web; giữ khoảng trống vừa đủ cho tác vụ.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M20 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M21 — Riêng tư, đồng ý và xóa dữ liệu

Đối chiếu: `zalo-mini-app/src/pages/privacy/index.js`. Route: `/privacy`. Có tổng quan chia sẻ, thu hồi, đồng ý và yêu cầu xóa.

```text
M21 — RIÊNG TƯ, ĐỒNG Ý VÀ XÓA DỮ LIỆU

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Màn con từ Cá nhân/Cài đặt; có quay lại.

Thiết kế trang “Riêng tư & đồng ý” giúp người dùng biết ai đang xem gì và chủ động thay đổi. Chia ba nhóm rõ bằng danh sách/accordion nhẹ: Đang chia sẻ; Đồng ý theo mục đích; Yêu cầu xóa dữ liệu. Không bảng nhiều cột, không dashboard bảo mật giả.
Đang chia sẻ: từng mục với loại nội dung, người nhận, trạng thái hiện tại và “Thu hồi”; xem chi tiết theo quyền hiện tại. Thu hồi có sheet xác nhận đúng mục/người, giải thích chặn lần đọc mới nhưng không xóa được bản sao ngoài ứng dụng. Có liên kết Chia sẻ từng mục và quản lý kết nối; không một công tắc “gia đình xem mọi thứ”.
Đồng ý: Dịch vụ Family Bridge, AI gợi ý cách diễn đạt, Nghiên cứu tổng hợp là ba mục độc lập. Hiện trạng thái/phiên chính sách khi có, nút Rút đồng ý cho mục đang chấp nhận và dialog nêu hệ quả thật. Không toggle bật lại chỉ bằng cách mở trang; không gộp đồng ý nghiên cứu vào sử dụng dịch vụ. Cần đọc đầy đủ nội dung hiện hành; không tự viết cam kết “ẩn danh tuyệt đối” hay “bảo mật 100%”.
Xóa dữ liệu: chọn danh mục theo nguồn có thật, xem lại phạm vi trước gửi; trạng thái Đã tiếp nhận/Đang xử lý/Hoàn tất hoặc nhãn từ máy chủ. Có hủy yêu cầu khi trạng thái cho phép. Đây là yêu cầu xử lý, không xóa tức thì mọi bản sao/backup. Không biến nút thành “Xóa ngay tất cả” nếu API chỉ tạo yêu cầu.
Xuất frame tổng quan, sheet thu hồi, sheet rút đồng ý và chọn/xác nhận yêu cầu xóa. Lỗi tải không hiện danh sách trống như đã an toàn; dữ liệu thay đổi yêu cầu tải lại. Nút nguy hiểm tách khỏi hành động thường, Tìm trợ giúp luôn sẵn. Không truy cập dữ liệu riêng đối phương hoặc quản trị hệ thống.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M21 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M22 — Tìm trợ giúp

Đối chiếu: `zalo-mini-app/src/pages/help/index.js`. Route: `/help`. Trang công khai; danh bạ hiện chỉ có thông tin đang xác minh.

```text
M22 — TÌM TRỢ GIÚP

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay lại theo ngữ cảnh.

Thiết kế trang “Tìm trợ giúp” thật dễ đọc, ít thao tác, mở được khi chưa đăng nhập, mất phiên hoặc đang tạm dừng thư. Tông bình tĩnh, không poster cảnh báo đỏ, không animation đợi. Đầu trang là một đoạn hỗ trợ trung tính khuyến khích tìm người lớn tin tưởng để trò chuyện; không hỏi thông tin tâm sự trước khi xem đầu mối.
Danh bạ HIỆN TẠI chỉ có hai nhóm: “Đầu mối hỗ trợ của trường” và “Đầu mối tư vấn tâm lý học đường”, cả hai mang trạng thái “Thông tin đang được xác minh.” Giải thích thông tin sẽ hiện khi đã được xác minh và duyệt. Không số điện thoại giả, không giờ hoạt động bịa, không nút gọi tới số chưa có. Không đưa hotline từ trí nhớ vào mockup. Nếu thiết kế biến thể liên hệ đã xác minh trong tương lai, ghi rõ ngoài frame “Phụ thuộc dữ liệu đã duyệt”, không xem là màn hiện có; bản chính vẫn là trạng thái chờ.
Phần cuối Thông tin nhà phát triển: Family Bridge, kênh hỗ trợ/khiếu nại đang cập nhật. Không đưa bản nền tảng 0.3.0 thành “Zalo Version 5”; đây là hai loại phiên bản khác nhau. Đề xuất rút gọn metadata kỹ thuật sang vùng thông tin phụ, không chiếm vị trí tìm giúp.
Xuất frame hiện tại, chữ lớn 200% và trạng thái điều hướng từ bản nháp đang pause. Không bắt đăng nhập, đồng ý AI, khảo sát hoặc chờ năm phút. Không tự gọi, tự báo người thân hay tự gửi tâm sự cho nhà trường.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M22 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M23 — Kiểm tra kết nối máy chủ

Đối chiếu: `zalo-mini-app/src/pages/connection-check/index.js`. Route: `/connection-check`. Có kết quả kết nối và chế độ mô phỏng riêng.

```text
M23 — KIỂM TRA KẾT NỐI MÁY CHỦ

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; quay về Trang chủ/Chào mừng theo phiên.

Thiết kế màn chẩn đoán kết nối cho người dùng phổ thông, không phải console kỹ thuật. Header “Kiểm tra kết nối”; một biểu tượng đường nối nhỏ, trạng thái lớn rõ chữ và lời hướng dẫn một câu. Kết quả thành công “Đã kết nối tới máy chủ”; chưa sẵn sàng/mất mạng/quá thời gian chờ có hướng dẫn kiểm tra mạng và “Thử lại”.
Đang kiểm tra dùng skeleton nhẹ và “Đang kiểm tra kết nối…”, không progress % giả. Thành công có CTA “Về trang chủ”; khi chưa có phiên thì quay lại Chào mừng. Thông tin kỹ thuật nếu có chỉ đặt vùng mở rộng nhỏ, không lộ token, tên host nội bộ, lỗi SQL hay dữ liệu riêng. Không suy kết nối máy chủ tốt thành Gemini hoạt động, đăng nhập được hoặc gửi thư thành công.
Chế độ minh họa có các lựa chọn mô phỏng Thành công/Lỗi/Timeout, chỉ xuất hiện trong frame demo có nhãn “Dữ liệu minh họa”. Bản thật không hiển thị nút giả lập hoặc báo thành công do người dùng chọn kịch bản. Đây là một màn phụ, không chiếm tab điều hướng chính.
Xuất các frame đang kiểm tra, thành công, lỗi mạng và máy chủ chưa sẵn sàng với bố cục cùng kích thước để không nhảy UI. Nút Tìm trợ giúp vẫn tới được ngay cả khi API không trả lời. Tránh đồng hồ quay vô hạn hoặc tự retry liên tục làm người dùng không kiểm soát được.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M23 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

### M24 — Không tìm thấy trang

Đối chiếu: `zalo-mini-app/src/pages/not-found/index.js`. Route: `(đường dẫn không khớp)`. Fallback của router; không có route riêng.

```text
M24 — KHÔNG TÌM THẤY TRANG

Thiết kế UI độ hoàn thiện cao cho Family Bridge chạy BÊN TRONG Zalo Mini App, mobile-first một cột, frame chính 390×844 và co giãn 320–430px. Dành cho học sinh THPT và cha mẹ/người chăm sóc: ấm, tinh tế, tin cậy, dễ đọc; toàn bộ chữ hiển thị bằng tiếng Việt có dấu. Dùng Be Vietnam Pro/font hệ thống sẵn có; body/input 16px, heading 20–24px; nền #FFF4E8, surface #FFFFFF, chữ #713D32/#475569, CTA #A84733 chữ #FFF4E8, brand #C65B43 và vàng #E4AB56 chỉ điểm nhẹ. Padding 16px; khoảng cách 4/8/12/16/24px, nút mục tiêu 48px, bo control 8–12px. Icon nét nhất quán, danh sách gọn, ít card. Chừa chrome/safe area Zalo, không nhân đôi header/back/close; bàn phím không che tác vụ. Không sidebar, bố cục web thu nhỏ, chữ bé, bảng nhiều cột, neon, gradient tím, ảnh stock hoặc animation trang trí. Giữ component và palette của DESIGN.md nếu đã nạp.

Điều hướng cho trang này: Không có tab dưới; lối về trang phù hợp theo phiên.

Thiết kế màn lỗi điều hướng “Không tìm thấy trang” cùng ngôn ngữ Family Bridge. Chữ lớn vừa phải 20–24px, một câu “Trang này có thể đã thay đổi. Bạn có thể quay về để tiếp tục.”, icon đường dẫn/tờ giấy nhỏ; không con số 404 khổng lồ hoặc meme đổ lỗi người dùng.
Hành động chính đưa về Trang chủ khi đang có phiên, hoặc về Chào mừng khi chưa đăng nhập. Có thể cung cấp Quay lại nếu còn lịch sử điều hướng; chỉ là điều hướng đề xuất trong bản thiết kế, không hứa đọc được lịch sử từ host. Tìm trợ giúp là liên kết phụ dễ thấy và không cần đăng nhập.
Không lặp lại raw URL, ID thư, query token hoặc nội dung người dùng trong thông báo. Không biến lỗi mất quyền xem thư/ghi chép thành trang này mặc định: lỗi quyền phải ở màn sở hữu với lời giải thích phù hợp, còn đây chỉ là route không khớp. Không tự đăng xuất, xóa nháp hoặc chuyển qua demo.
Xuất một frame có phiên và một frame khách. Kiểm tra ở 320px/chữ lớn: câu hướng dẫn và nút đủ đọc/chạm, không cần cuộn ngang. Giao diện ngắn, có khoảng thở nhưng không ảnh trang trí toàn màn. Hành động quay về phải xuất hiện ngay trên màn đầu, không cần đọc tài liệu kỹ thuật.

Yêu cầu bàn giao: tạo frame chính trước và các biến thể quan trọng vừa nêu trên cùng canvas, đặt tên M24 / tên trạng thái; frame dài được cuộn, không nén chữ để vừa một ảnh. Dùng nội dung giả lập không nhạy cảm; không tự bổ sung chức năng ngoài mô tả. Kèm ghi chú khoảng cách, điều hướng, bàn phím/safe area, trạng thái loading/empty/error/disabled/success khi liên quan. Giữ cùng bộ component giữa các trang. Kết quả là bản thiết kế để người khác triển khai, không tuyên bố đã sửa app hay đã kiểm thử thiết bị.
```

## Kiểm tra trước khi nhận bộ thiết kế từ Stitch

- Đủ M01–M24, M06/M12 đủ hai vai, không nhầm QR Version 5 là trang app.
- Nhìn ở 320/360/390/430px vẫn là app một cột, không sidebar/web bị thu nhỏ, không cắt chữ Việt hay cuộn ngang. Header host Zalo, bàn phím và tab dưới có vùng riêng.
- Bộ component, type, palette nhất quán. Mỗi màn chỉ một hành động chính trong một bước; nội dung dài được cuộn và đọc đủ.
- Soạn/AI/chia sẻ phân biệt lưu riêng, dùng gợi ý, xem trước, xác nhận gửi. Pause 300 giây không tự gửi; trợ giúp vẫn mở ngay. Quyền và dữ liệu thật không được suy từ mockup.
- Nhật ký chờ và đầu mối chưa xác minh thể hiện đúng hiện trạng. Không vẽ trang admin, lịch hẹn, khảo sát, upload hoặc reset password chưa có chỉ vì có tên tính năng trong tài liệu mục tiêu.

## Nguồn kiểm kê và giới hạn

Nguồn: router Mini App; các module trang liệt kê phía trên; `src/app/nav.js`; `src/components/bottom-nav.js`; `packages/family_bridge_shared/src/policy.js`; quy tắc UI, phạm vi và nhận diện Family Bridge. SHA nguồn Mini App: `0bfa27d68a99c02dc4bd7afa0b43f13a193f1925` (tiếp nối bản upload v5 từ `0eea109`; commit tiếp theo chỉ nối cấu hình CI). Không suy số trang từ tài liệu web cũ.

Áp dụng các phần phân cấp thị giác, khoảng cách, component và trạng thái của skill thiết kế mobile/Stitch. Không áp các yêu cầu marketing như hero cỡ lớn, font mới, accent độc nhất hay chuyển động lặp cho form, inbox và consent vì quy tắc nhận diện/quyền riêng tư/khả năng tiếp cận Family Bridge được ưu tiên.

Đây là đầu ra tài liệu theo yêu cầu; runtime, truy vấn/DSA ứng dụng, MySQL, Gemini, deploy và kiểm thử thiết bị: N/A, không thay đổi trong nhiệm vụ này. Việc xác minh danh mục chỉ kiểm tra route/module và đủ prompt; không chứng minh thiết kế Stitch, tương phản render, khả năng tiếp cận hoặc safe area đã đạt.
