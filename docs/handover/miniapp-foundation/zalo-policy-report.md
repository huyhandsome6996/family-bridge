# Báo cáo chính sách Zalo — US-003 Mini App UI Foundation

Nghiên cứu bởi agent chính sách (Task 2-a), ngày truy cập nguồn: **11/10/2026**. Mẫu: Nguồn/mục/ngày → yêu cầu → tác động màn hình → cách xử lý → trạng thái kiểm tra.

## 1. Xin quyền

| # | Nguồn (mục, ngày) | Yêu cầu | Tác động | Xử lý trong đợt này | Kiểm tra |
| --- | --- | --- | --- | --- | --- |
| 1.1 | request-permission ("Các nhóm quyền", 28/01/2026) | SĐT/Vị trí/Camera là quyền nhạy cảm cần xét duyệt | Màn mở đầu không được gọi các API này | Không gọi bất kỳ API xin quyền nào ở màn mở đầu; quyền sẽ xin muộn, đúng ngữ cảnh ở luồng thật (US-011/013) | Đã kiểm tra nguồn |
| 1.2 | request-permission ("Xin quyền đúng ngữ cảnh") | Chỉ xin quyền cần cho tính năng lõi | Không popup quyền khi vào app | U01–U04 không xin quyền | Đã kiểm tra nguồn |
| 1.3 | Agreement Điều 5.3.3.a (25/09/2026) | API nhạy cảm chỉ gọi sau khi user đồng ý; app Testing không được cấp dữ liệu riêng tư | Fixture-only ở KT01 | Home demo dùng fixture, không gọi SDK dữ liệu cá nhân | Đã kiểm tra nguồn |
| 1.4 | authen-user (28/01/2026) | Nếu bắt buộc SĐT phải có onboarding giải thích | Không áp dụng ngay | Giữ mô hình xem trước không định danh; ghi khuyến nghị cho luồng kết nối thật | Đã kiểm tra nguồn |

## 2. Định danh

| # | Nguồn | Yêu cầu | Tác động | Xử lý | Kiểm tra |
| --- | --- | --- | --- | --- | --- |
| 2.1 | authen-user "Login Process" | Flow duy nhất: getAccessToken → server → graph.zalo.me kèm appsecret_proof | Không tự dựng đăng nhập riêng | U04 chỉ chọn vai trò xem trước, không tạo session; boundary ghi trong zalo-adapter | Đã kiểm tra nguồn |
| 2.2 | API getUserInfo (27/09/2026) | Name/avatar cần đồng ý (authorize scope.userInfo); lỗi -1401 khi từ chối; isSensitive cho tài khoản cần bảo vệ (kể cả trẻ em) | Không gọi getUserInfo vô điều kiện | Không gọi ở bất kỳ màn nào; gọi sau này phải xử lý -1401 | Đã kiểm tra nguồn |
| 2.3 | Agreement Điều 5.4/7.3/4.3 | Cấm mạo danh Zalo, giả mạo chứng nhận | Không form "đăng nhập Zalo" giả | UI chỉ sẽ dùng nút kích hoạt API Zalo thật ở luồng định danh (chưa có ở đợt này) | Đã kiểm tra điều khoản; "cấm form giả" là suy luận — chưa có bản văn tường minh |
| 2.4 | Agreement 5.3.1 + public-mini-app "Tiêu chí kiểm duyệt" | Tên/logo/mô tả nhất quán, không emoji/ký tự đặc biệt | Logo placeholder phải minh bạch | Placeholder SVG nhãn rõ "chờ asset mẫu 03 duyệt", không dùng logo tạm giống thương hiệu khác | Đã kiểm tra nguồn |
| 2.5 | Agreement Điều 5.5.a | Bắt buộc hiển thị thông tin nhà phát triển + phiên bản + kênh khiếu nại | Trang Tìm trợ giúp là vị trí hợp lý | Đã thêm khối "Thông tin nhà phát triển" với phiên bản; dữ liệu liên hệ thật do Huy cung cấp — hiện "Thông tin đang được cập nhật" | Đã kiểm tra nguồn; dữ liệu thực tế chưa có |

## 3. Design guidelines (redirect → docs.zaloplatforms.com, 27/09/2026)

| # | Yêu cầu | Tác động | Xử lý | Kiểm tra |
| --- | --- | --- | --- | --- |
| 3.1 | Menu Zalo cố định góc phải trên — không đặt nút dưới menu; trang phụ cần back rõ | Top-bar không đặt gì góc phải | TopBar chỉ title + back bên trái; back button trên các trang phụ | Đã kiểm tra nguồn |
| 3.2 | Bottom bar khuyến nghị ≤ 4 tab | Đề bài chốt 5 mục điều hướng | Giữ 5 mục theo đề bài (lệnh mới hơn), nav tham số hóa; DISCREPANCY ghi ở handover README mục 3 | Đã kiểm tra nguồn; quyết định sản phẩm chờ Huy |
| 3.3 | Lỗi phải thông báo rõ; báo mất kết nối; loading rõ | Connection-check phải có đủ 4 trạng thái | loading/success/error/timeout + Thử lại; không treo im lặng | Đã kiểm tra nguồn |
| 3.4 | Chọn từ tùy chọn thay vì gõ; vùng chạm 7–9mm | Role-select dạng card lớn | Touch target ≥44px; role-select không gõ | Đã kiểm tra nguồn |
| 3.5 | DG không có con số safe area cụ thể | Safe area do app tự xử lý | CSS env(safe-area-inset-*) + hideIOSSafeAreaBottom trong app-config; cần kiểm tra Zalo thật | Chưa kiểm chứng trên thiết bị |
| 3.6 | Agreement 7.6/7.3: cấm tracking bí mật, điều hướng ra ngoài | Không remote asset/analytics | Không analytics, không CDN ngoài, không link ngoài trong app | Đã kiểm tra nguồn |

## 4. Phát hành / xác minh

| # | Nguồn | Yêu cầu | Xử lý | Kiểm tra |
| --- | --- | --- | --- | --- |
| 4.1 | public-mini-app (09/09/2026) | Testing → Chờ xét duyệt → Duyệt → Publish; phải xác thực trước khi gửi xét duyệt | Không deploy, không tạo phiên bản testing, không tuyên bố được duyệt | Đã kiểm tra nguồn |
| 4.2 | mini-app-verification (04/12/2025) | Xác thực chủ sở hữu bắt buộc; danh mục giáo dục cần giấy tờ | Ghi khuyến nghị phân loại trung thực (kết nối gia đình); cần Huy chốt | Đã kiểm tra danh mục; quyết định phân loại — OPEN |
| 4.3 | Agreement 5.1–5.6 | Thẩm định lại từng phiên bản; phê duyệt không phải bảo đảm vĩnh viễn; cấm tuyên bố quan hệ với Zalo | Không dùng chữ "Zalo approved" trong UI/docs | Đã kiểm tra nguồn |

## 5. Dữ liệu người dùng dễ bị tổn thương (học sinh vị thành niên)

| # | Nguồn | Yêu cầu | Xử lý | Kiểm tra |
| --- | --- | --- | --- | --- |
| 5.1 | Agreement 6.11 | "Trẻ em" 14–<16: xác minh tuổi + đại diện pháp luật trước thu thập | Màn mở đầu không thu thập dữ liệu; luồng đồng ý kép ghi cho US-011/012 | Đã kiểm tra nguồn |
| 5.2 | Agreement 6.16.3/5.3.3.c | Không xử lý dữ liệu trẻ em khi thiếu đồng ý của trẻ VÀ giám hộ | Xem trước không định danh là mô hình an toàn | Đã kiểm tra nguồn |
| 5.3 | Agreement 7.2/7.5 | Cấm nội dung gây hại trẻ em/khuyến khích tự hại; thu thập dữ liệu trẻ em tối thiểu | Trang trợ giúp viết an toàn, không mô tả nguy hiểm, dẫn về đầu mối thật đã xác minh (hiện "đang xác minh") | Đã kiểm tra nguồn |
| 5.4 | Agreement 9.3/5.3.3.b.d | Ưu tiên khiếu nại người dùng dễ bị tổn thương; dữ liệu lưu trong Việt Nam; xóa trong 24h khi ngừng vận hành | Ghi ràng buộc data-residency VN cho Antigravity khi chọn hạ tầng; kênh khiếu nại trong trang trợ giúp | Đã kiểm tra điều khoản; hạ tầng hiện tại — Chưa kiểm tra |

## 6. SDK zmp-sdk 2.53.0

| # | Phát hiện | Xử lý | Kiểm tra |
| --- | --- | --- | --- |
| 6.1 | 2.53.0 tồn tại, là latest (publish 11/08/2026); kéo Sentry 6.x | Giữ pin 2.53.0; ghi Sentry vào chính sách riêng tư khi public | Đã kiểm tra npm registry |
| 6.2 | getUserInfo/getAccessToken/followOA/openChat/getPhoneNumber có thật trong 2.53.0 | Danh sách API trắng cho US-004 | Đã soi tarball + docs |
| 6.3 | `viewOAQuickMessage` KHÔNG tồn tại trong 2.53.0 | Loại khỏi danh sách API; nếu cần nhắn OA dùng openChat | Đã kiểm tra 2 nguồn độc lập |
| 6.4 | SDK không export isMp; phát hiện môi trường bằng UA/hostname | Viết helper riêng `isZaloHost()` trong core/config.js | Đã soi bundle |
| 6.5 | Ngoài Zalo: SDK reject -1404; localhost: getUserInfo trả mock cứng | Env-guard mọi call SDK; KHÔNG render dữ liệu SDK ngoài luồng định danh thật | Đã soi bundle branch logic |
| 6.6 | Chưa login: getAccessToken từ 2.35.0 trả ID-only, không cần xác nhận | Luồng xem trước không gọi getAccessToken | Đã kiểm tra docs |

## Discrepancy tổng hợp

1. 5 tab điều hướng (đề bài) vs DG ≤4 tab — đã xử lý/tham số hóa, cần chốt.
2. `viewOAQuickMessage` không tồn tại trong SDK pin — loại khỏi roadmap API.
3. Phân loại danh mục dịch vụ + giấy tờ xác thực giáo dục — cần quyết định trước khi tạo app thật.
4. getUserInfo localhost trả mock cứng — đã env-guard; ràng buộc đưa vào checklist Antigravity.
5. Trang trợ giúp cần dữ liệu nhà phát triển thật (Điều 5.5.a) — hiện placeholder trung thực.
