# Đặc tả chuyển Stitch thành Zalo Mini App hoạt động thật

## 1. Folder và stack bắt buộc

- Đích duy nhất của UI: `zalo-mini-app/src/` — pages, components, styles, assets, app router/nav/shell khi cần. `zalo-mini-app/tests/` và scripts build liên quan được cập nhật tương ứng. HTML5 + CSS3 + JavaScript thuần ES Modules + Vite + zmp-sdk qua adapter; không React, React Native, Next.js, zmp-ui hay Tailwind mới.
- Entry `zalo-mini-app/src/main.js`; CSS entry `src/styles/index.css`; router `src/app/router.js`; manifest nguồn `app-config.json`; build ra `www/`. Giữ `base: './'`, dynamic import/chunks và Zalo manifest; không chuyển output sang `dist` hoặc upload web.
- Không sửa `web/**`, `backend/**`, models/migrations hoặc `render.yaml` cho redesign này. `packages/family_bridge_shared/**` chỉ đọc/tái sử dụng, không đổi API/session toàn hệ thống để chữa thẩm mỹ. Không import DOM/UI từ web, không đổi package/lockfile vì template dùng CDN.
- Thư mục `docs/design/zalo-miniapp-stitch-20261021/stitch-export/` là tham chiếu lưu trữ, không nằm trong import/runtime. Không chép 87 HTML vào public/www để mở như ứng dụng; mỗi `Mxx` là một route/module thật với nhiều state. Không đưa ZIP/ảnh chụp bàn giao vào bundle runtime.
- Các đường dẫn legacy, route, query demo và export `page` phải tiếp tục chạy. Có thể đổi `chrome: 'app'`/shell Mini App sang bố cục mobile khi hợp lý nhưng giữ guard auth/role, cleanup, callback chống response cũ và navigation contract. `app-shell`/`shell.css` hiện mang nhánh desktop là điểm cần xử lý tại MINI APP; không chỉnh shell web để chữa gián tiếp.

## 2. Chuyển đổi thị giác

Giữ cấu trúc hiển thị của frame M01–M24: thứ tự nội dung, khoảng trống, nhịp chữ, bo góc, hàng danh sách, vùng viết và sheet. Hợp nhất token theo DESIGN.md chuẩn, không dùng bảng màu đỏ-hồng khác ở YAML Stitch. Be Vietnam Pro có sẵn local; icon dùng component local. Không load Google Fonts, Material Symbols CDN, Tailwind CDN, ảnh Googleusercontent hoặc script từ HTML mẫu. Ảnh không thiết yếu thì bỏ; tài nguyên thực sự cần phải có quyền sử dụng và local phù hợp, không tải remote ngẫu nhiên cho đủ giống mockup.

Loại khỏi màn production tất cả khối “Design Spec”, “Developer Note”, “Handoff”, mã route, tên API, code lỗi kỹ thuật, QA switches và comment hướng dẫn. Đó là chú thích giao cho lập trình viên. Tách layout minh họa nhiều state trong cùng ảnh thành các state thật; không hiện đồng thời lỗi, loading, success và bàn phím giả trên một trang. Không vẽ status bar/chrome Zalo/avatar góc phải/bàn phím iOS như một phần HTML app. Dùng host/safe-area thực, tránh cộng inset hai lần.

Một cột 320–430px; bản chính 390×844; chạm 44px tối thiểu/48px mục tiêu, input/body 16px, heading 20–24px; text 200% vẫn đọc và thao tác; không clip dấu Việt. Tab dưới năm mục chỉ ở trang cấp một, một phiên bản nav duy nhất. Trang con tập trung đọc/viết, quay lại giữ nháp. Không fixed CTA đè textarea/lỗi khi bàn phím mở. Chủ động kiểm tra scrolling sheet dài, nút đóng/back và focus.

## 3. Không thay nghiệp vụ để khớp hình giả

- Dùng adapter/API thật; mock chỉ trong chế độ demo được chọn rõ. Không biến lỗi thành demo, không hardcode tên gia đình, trường học, số tin, latency, phiên, thành công hay hạn xử lý từ export. UI dùng số đo/metadata khi API thật cung cấp; thiếu thì ẩn hoặc thông báo trung thực.
- Đăng nhập bằng mã tài khoản HS/PH. Chỉ UI Zalo theo capability máy chủ; không tạo chức năng “đã liên kết Zalo”, OTP, SĐT/reset online tự ý. Re-auth cài đặt bằng mật khẩu hiện tại theo contract. Role thật không tự chọn.
- Consent service, AI, research độc lập; không tick hộ, không ép AI/nghiên cứu. Giữ nguyên text chính sách hiện hành từ source; không tự đổi version `ai-v1` sang tên do Stitch viết. AI chỉ từ backend khi người dùng yêu cầu với consent hiện hành; có disclosure Gemini; giữ nguyên bản gốc, cho xem/sửa/gạt gợi ý, chống stale. Lỗi AI vẫn viết/lưu/xem trước/gửi thủ công.
- Chia sẻ từng item/revision/đúng người đang kết nối; đọc toàn bộ nội dung cuối trước xác nhận. Không hiển thị private text rồi chỉ che CSS. Mất quyền/đổi actor/logout/unlink phải bỏ private state và hủy response cũ.
- Pause tùy chọn cố định 300 giây theo máy chủ, chỉ ràng buộc bản nháp đã pause. Không “hủy khoảng nghỉ” để gửi sớm trái contract, không khóa toàn phiên/tất cả API; hết giờ vẫn nháp. Không auto-send khi timer/AI/retry/resume. Trợ giúp và tín hiệu lắng nghe không bị khóa theo pause.
- Gửi mất response: đối chiếu operation/idempotency đã có, không tự retry mutation hoặc cung cấp nút gửi lại mù quáng. Dùng gợi ý và chọn quick reply chỉ điền ô, không gửi.
- Không thêm lưu nội dung/token vào localStorage/sessionStorage/IndexedDB/Zalo storage từ notes của Stitch. Giữ session in-memory và cơ chế lưu nháp máy chủ của app; không dựng offline-cache nhật ký/AI. Ngoại lệ role demo đang có không được mở rộng sang nội dung riêng.
- Không bịa hotline, “miễn phí 24/7”, E2EE, “mã hóa cục bộ”, bảo mật tuyệt đối, Gemini không huấn luyện, tư vấn ẩn danh, lịch hẹn hay xóa dữ liệu đúng 7–14 ngày/ân hạn 48h. Chỉ hiển thị nội dung và trạng thái đã được duyệt/thực thi. Đây là những nội dung có trong hình gốc nhưng phải bỏ/chỉnh khi tích hợp.
- `/diary` giữ trạng thái chờ. Không mở rộng tính năng từ bốn frame khám phá ban đầu. `/privacy-items` vẫn có thao tác ghi chép/chia sẻ hiện hữu. `/help` hiện đầu mối đang xác minh; frame tương lai đã xác minh chỉ tham chiếu, không dựng số/gọi thật. Không thêm survey/admin/appointment.

## 4. Kiểm thử và hoàn tất

Theo VERIFICATION.md; tự tìm và sửa lỗi trong phạm vi UI đến khi các kiểm tra bắt buộc đạt. Không xóa test/giảm assertion bảo vệ quyền riêng tư hoặc no-auto-send để xanh. Layout/text có đổi thì sửa assertion giao diện tương ứng có lý do, giữ test hành vi và thêm regression cho lỗi thật. Không thêm test chỉ đọc nguyên CSS/source để lặp implementation nếu kiểm tra hành vi tốt hơn.

Sau khi đạt: commit/push nhánh này, tích hợp `origin/main` mới nhất không làm mất thay đổi người khác, chạy lại kiểm tra trên kết quả tích hợp và đưa thẳng lên `main` bằng fast-forward push theo yêu cầu chủ repo. Không hỏi lại duyệt merge thường lệ. Nếu branch protection chặn direct push, dùng PR + CI và merge khi có quyền, không tắt protection hoặc force push; báo chính xác nếu quyền GitHub còn chặn.

Không chạy `zmp deploy`, submit review/live, Render deploy, đổi env/secret hoặc tạo workflow auto deploy. Bàn giao main SHA, tests, ảnh đối chiếu 24 trang và `www` mới cùng manifest/hash để Codex chat gốc deploy. Build được phép, publish không thuộc coding agent. Nhiệm vụ hồ sơ hiện tại chưa thực hiện các bước code/main/deploy này.
