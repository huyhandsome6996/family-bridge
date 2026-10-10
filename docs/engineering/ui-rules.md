# Quy tắc UI Family Bridge

Chuẩn thiết kế cho các lần triển khai sau, chưa phải giao diện đã xây hoặc đã nghiệm thu. Đợt chore/taste-skill-integration chỉ thêm skill/tài liệu và kiểm tra tài liệu.

Mục lục: [ưu tiên](#ưu-tiên-và-phạm-vi), [ngôn ngữ](#ngôn-ngữ-và-thao-tác), [tokens](#spacing-typography-và-màu), [component](#component-và-trạng-thái), [điện thoại](#điện-thoại-và-khả-năng-tiếp-cận), [quyền](#đồng-ý-quyền-riêng-tư-và-gửi), [nghiệm thu](#hiệu-năng-và-nghiệm-thu).

## Ưu tiên và phạm vi

- Đọc [family-bridge-ui](../../.agents/skills/family-bridge-ui/SKILL.md) trước mọi tác vụ giao diện, cùng [AGENTS](../../AGENTS.md), [scope](../project-scope.md), [DSA](dsa-rules.md) và [security](../security/security-rules.md).
- Khi xung đột, yêu cầu trực tiếp của người dùng và quy tắc phạm vi, DSA, bảo mật, quyền riêng tư, admin của Family Bridge có ưu tiên hơn Taste. Skill UI không tạo ngoại lệ bảo mật.
- Frontend chính thức: React/Vite + zmp-sdk + zmp-ui trong Zalo Mini App. Không chuyển Next.js/RSC hoặc React Native; không cài hệ component khác để theo ví dụ upstream.
- Kiểm tra package.json/components trước import. Template main hiện có Tailwind v3; không tự thêm/nâng Tailwind, GSAP, Motion, thư viện icon/font vì Taste gợi ý. Thay dependency phải thuộc nhiệm vụ riêng có lý do, đánh giá tương thích và checks phù hợp.
- Taste v2 đang thử nghiệm, thiên về landing page/portfolio/redesign. Đọc [bản pin](../../.agents/skills/design-taste-frontend/SKILL.md) trước dùng phần liên quan; xem [nguồn và giới hạn](taste-skill-integration.md). Không áp toàn bộ checklist marketing cho inbox, nhật ký, biểu mẫu hoặc admin. Không buộc hero, bento, ảnh thật, font mới, dark mode hay animation để đạt checklist upstream.

## Ngôn ngữ và thao tác

- Viết tiếng Việt đúng dấu, ngắn, dễ hiểu với học sinh THPT và người chăm sóc. Dùng động từ cụ thể: “Lưu nháp”, “Xem trước”, “Gửi cho…”, “Hủy chia sẻ”, “Tìm trợ giúp”. Không đưa SDK, grant, revision hay mã lỗi kỹ thuật vào luồng người dùng.
- Giữ cách xưng hô phù hợp vai trò; người nhận được sửa lời phản hồi. Không gọi AI là người chẩn đoán/hỗ trợ khẩn cấp hoặc hứa hiệu quả điều trị.
- Một hành động chính dễ thấy trên mỗi màn hình; hành động phụ rõ ràng. Giảm thao tác thừa nhưng giữ chọn người nhận, preview và xác nhận gửi. Có thể gộp chọn người nhận với preview nếu vẫn thấy đúng nội dung và đích gửi.
- Giữ label/route/navigation và nội dung đã duyệt khi tân trang. Không cắt/sửa nội dung đồng ý/quyền riêng tư để vừa layout; cho xuống dòng và cuộn đọc. Không preselect đồng ý, giấu từ chối hoặc gộp consent AI, chia sẻ và khảo sát.
- Chương trình 4 tuần, từng hoạt động và khảo sát tự nguyện: cho bỏ qua/tạm dừng/dừng, mở mọi tuần đã phát hành. Không khóa công cụ giao tiếp, không streak gây áp lực hay xếp hạng cảm xúc.

## Spacing, typography và màu

Baseline cho triển khai sau; dùng CSS/SCSS và API theme zmp-ui phù hợp phiên bản đã cài. Kiểm tra hiện trạng trước ánh xạ tokens; không đổi runtime trong đợt tích hợp.

| Nhóm | Quy ước |
| --- | --- |
| Spacing | Thang 4, 8, 12, 16, 24, 32 CSS px; padding ngang 16 px, 12 px khi hẹp; gap nội nhóm 8–12 px, giữa nhóm 24 px |
| Typography | Font hệ thống/zmp-ui hiện có, hỗ trợ dấu Việt; body/input 16 px, label 14–16 px, heading 20–24 px; metadata 12–14 px chỉ cho thông tin phụ, không consent/hướng dẫn chính |
| Dòng chữ | Body line-height 1.5–1.6, heading 1.25–1.35; weight 400/500/600; không tracking chặt, toàn chữ hoa, clipping dấu Việt hoặc chiều cao khóa cứng |
| Bố cục | Một cột trên điện thoại, giãn theo viewport; không cố định 375 px; hàng nhiều thao tác xuống dòng khi cần |
| Bo góc | Baseline 8 px cho control, 12 px nhóm nội dung; nhất quán, không biến mọi nội dung thành card |
| Lớp nổi | Content 0, thanh cố định 10, overlay 20, dialog 30; ánh xạ lớp zmp-ui hiện có, quản lý focus và không che trợ giúp |

Palette là đề xuất ngữ nghĩa, chưa phải nhận diện thương hiệu được duyệt. Ưu tiên tokens hiện hữu khi đạt tương phản; thay palette phải nêu trong nhiệm vụ UI riêng. Không dùng màu trạng thái để chấm cảm xúc học sinh.

| Token | Baseline nền sáng | Cách dùng |
| --- | --- | --- |
| background / surface | #F8FAFC / #FFFFFF | Nền đọc/soạn |
| text / text-secondary | #0F172A / #475569 | Chữ chính/phụ, không làm mờ chữ cần đọc bằng opacity |
| primary / on-primary | #1D4ED8 / #FFFFFF | Hành động chính/chọn; không ép mọi trạng thái cùng accent |
| success | #166534 trên #F0FDF4 | Thành công có nhãn, chỉ sau server xác nhận |
| warning | #92400E trên #FFFBEB | Cần xem lại; không dán nhãn tâm trạng “xấu” |
| error / destructive | #B91C1C trên #FEF2F2 | Lỗi/xóa/thu hồi, có cách tiếp tục |
| info | #1E40AF trên #EFF6FF | Hướng dẫn trạng thái |
| border-control / focus | #64748B / #1D4ED8 | Ranh giới input/focus rõ trên surface; placeholder không thay label |

Đo cặp màu thực tế: chữ thường >=4.5:1, chữ lớn >=3:1, ranh giới control/focus và đồ họa cần thiết >=3:1. Không chỉ dùng màu: thêm nhãn/biểu tượng và thông báo trạng thái. Nếu nhiệm vụ có dark mode, định nghĩa/đo lại tokens toàn màn hình; không tự thêm chế độ hoặc đảo nền từng section theo Taste.

## Component và trạng thái

Ưu tiên Button, Input, Text, Sheet/Dialog, danh sách và Icon zmp-ui sẵn có theo API thực tế; semantic HTML cho phần tự tạo. Icon phụ trợ; nút chỉ icon có accessible name tiếng Việt. Không thêm bộ icon để đổi thẩm mỹ.

| Component | Quy tắc |
| --- | --- |
| Button | Label rõ, vùng chạm đủ; đang gửi ngăn nhấn lặp, feedback tức thời; disable gửi không disable trợ giúp/hủy |
| Input / Textarea | Label luôn hiện, hướng dẫn/giới hạn và lỗi gần trường; giữ nội dung khi lỗi, không cắt quá giới hạn im lặng |
| Danh sách | Metadata tối thiểu đã có quyền, phân trang giới hạn; không preview tâm sự riêng trong admin/thông báo/màn hình khác |
| Preview | Đúng nội dung/revision và người nhận, có sửa/quay lại và xác nhận; đổi nội dung/người nhận phải preview lại |
| Dialog / Sheet | Focus/đóng/back rõ; xóa/thu hồi nêu phạm vi thật, không hứa xóa mọi bản chụp/backup |
| Admin | Capability/school scope, dữ liệu tối thiểu; editor/reviewer riêng; không nút “đọc tâm sự” hoặc export raw |

| Trạng thái | Hành vi |
| --- | --- |
| loading | “Đang tải…”/skeleton nhẹ giữ kích thước; “Đang gửi…” khi gửi; không chặn toàn app |
| empty | Giải thích chưa có nội dung và bước tiếp phù hợp; không tự tạo/chia sẻ dữ liệu thay người dùng |
| error / offline | Dễ hiểu, giữ nháp, retry tải theo DSA; gửi chưa rõ kết quả thì đối chiếu server/idempotency, không tự retry send hoặc báo đã gửi |
| disabled | Nêu lý do/cách tiếp tục; pause tính từ mốc server; không nút vô nghĩa thiếu giải thích |
| success | Phân biệt “Đã lưu nháp”, “Đã gửi”, “Đã chia sẻ”; chỉ khi server xác nhận, không suy từ hoạt ảnh |
| revoked / stale | Bỏ nội dung/preview không còn quyền; revision cũ cần xem lại, không âm thầm ghi đè/gửi |

Không chỉ dùng toast thoáng qua cho lỗi/consent quan trọng. Dùng accessibility component/live region phù hợp, tránh đọc lặp từng giây countdown.

## Điện thoại và khả năng tiếp cận

- Kiểm tra 320, 360, 390, 430 CSS px; text scale/zoom 200% không mất nội dung/hành động hay cuộn ngang toàn trang. Nút dài được xuống dòng; không thu chữ consent để vừa nút.
- Vùng chạm >=44×44 CSS px, mục tiêu 48×48 cho hành động chính, gap >=8 px giữa đích cạnh nhau. Không dựa hover/swipe làm đường duy nhất.
- Dùng inset host/component theo SDK; env(safe-area-inset-*) là fallback khi host hỗ trợ, không bằng chứng đủ cho Zalo. Tránh cộng inset hai lần khi zmp-ui đã xử lý; kiểm tra notch, thanh Zalo/tabbar trên Android/iOS thật.
- Bàn phím mở: input, lỗi và nút lưu/preview tới được qua cuộn; tránh fixed bar che textarea. Viewport linh hoạt có fallback, không giả định 100vh/100dvh xử lý mọi WebView. Back/đóng bàn phím không mất nháp.
- Focus hợp lý/nhìn thấy, name/label tiếng Việt; dialog nhận/trả focus. Kiểm tra bàn phím, TalkBack/VoiceOver cho flow liên quan; lý do disabled vẫn đọc được.
- Ưu tiên không chuyển động. Nếu cần feedback/trạng thái, khoảng 100–200 ms, chỉ transform/opacity khi phù hợp. Tôn trọng prefers-reduced-motion với mọi animation không thiết yếu, kể cả cường độ thấp. Không autoplay, parallax, scroll hijack/loop trang trí hoặc chờ animation để gọi trợ giúp/gửi.

## Đồng ý, quyền riêng tư và gửi

Tuân [luồng](../product/four-week-flow.md), [ERD](../data/erd.md), [admin](../product/admin-capabilities.md) và SEC-03/04/05/07/08/10/12/16/17/18/22/23/24 theo scope.

- Kết nối không cấp quyền đọc cả nhật ký. Chia sẻ từng mood/trang, người nhận và revision; AI original/suggestion riêng, tin chỉ là lời đã duyệt. Không render private body rồi ẩn CSS.
- Giữ nội dung đồng ý/quyền riêng tư đã duyệt, đọc đầy đủ và đồng ý chủ động từng mục đích. AI chỉ khi người viết chọn với thông báo provider phù hợp; không hứa E2EE/riêng tư tuyệt đối.
- Chọn người nhận đang kết nối, xem trước và xác nhận gửi/chia sẻ. Không tự gửi sau **300 giây (5 phút)**, AI, retry, resume hoặc thiếu phản hồi. Pause đã chọn chặn gửi nháp đó trước mốc server; hết giờ vẫn là nháp để xem/xác nhận.
- “Con cần được lắng nghe” là tín hiệu chọn người nhận, khác “Tìm trợ giúp”; cả hai không bị cooldown nháp trì hoãn. Help mở ngay, danh bạ công khai tối thiểu đã duyệt có fallback khi auth/API lỗi; không tự gọi/chuyển tâm sự.
- Admin theo capability/scope server; UI phản ánh quyền đã xác minh. Thầy được chọn làm recipient chỉ đọc nội dung gửi cho mình. Không mặc định đọc tâm sự, AI, mood, nhật ký, note hẹn hay survey raw.
- Revoke/unlink/logout/đổi actor bỏ private state/cache phù hợp. Render user/AI text như text, không HTML tùy ý; không gửi analytics, crash screenshots, notification preview hoặc URL.

## Hiệu năng và nghiệm thu

- Theo giới hạn list/cache/polling/AI của DSA; không tải cả lịch sử. Memo/virtualize theo đo, không thêm infrastructure vì Taste.
- Không ảnh trang trí, video, blur/lớp GPU hay animation nặng làm chậm inbox, nhật ký, trợ giúp. Asset cần thiết có kích thước/budget; không ảnh từ xa ngẫu nhiên cho dữ liệu nhạy cảm.
- Khi có UI thật, ghi evidence các trạng thái, màn hình hẹp, bàn phím/safe area, text lớn, contrast, reduced motion và offline/resume; synthetic actors khác quyền, revoke/no-auto-send. Browser không thay Zalo Android/iOS.
- Đợt này kiểm tra docs/validator/checksum/license/link/wiring; runtime/DSA benchmarks, accessibility/device và bảo mật nghiệp vụ N/A/chưa kiểm chứng vì không đổi app. Không mark US Done/SEC VERIFIED từ tài liệu.
