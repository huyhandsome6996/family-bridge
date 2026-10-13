# Prompt giao việc cho coding agent — Family Bridge / Stitch UI

Bạn là coding agent tiếp nhận dự án Family Bridge. Hãy **thực hiện nâng cấp giao diện**, không chỉ đưa kế hoạch. Mục tiêu là tái tạo sát từng chi tiết bốn màn Stitch AI do chủ dự án cung cấp, thay logo mẫu bằng logo Family Bridge chính chủ, và bảo toàn luồng đăng nhập Zalo/backend đã chạy thành công. Làm trên nhánh `codex/stitch-ui-upgrade` từ `origin/main` mới nhất; bàn giao PR có ảnh đối chiếu và kết quả kiểm thử. Không tự merge hoặc tự chuyển môi trường backend trong nhiệm vụ UI này.

## 1. Mốc hoàn chỉnh phải giữ

- Repo: https://github.com/huyhandsome6996/family-bridge
- Mã đăng nhập đã kiểm thử được merge qua PR #29: https://github.com/huyhandsome6996/family-bridge/pull/29
- Commit merge: `0008ceca75f6399a78ce8da9e78e479a1b3ade54`; commit nguồn đã kiểm thử: `c011b855963665d7b7d6a3d2fee0c4f3c98124a6`.
- Mini App DEV được chủ dự án xác nhận thấy nút, bấm nút và đăng nhập thành công: **`zdev-4acc61e4`**, Mini App ID `3411096375330044972`.
- Link bản thử: https://zalo.me/s/3411096375330044972/?env=DEVELOPMENT&version=zdev-4acc61e4
- Chủ dự án xác nhận “ok được rồi”. Backend đã ghi `POST /api/v1/auth/session` 200 và `GET /api/v1/consents` 200. Đây là bằng chứng đăng nhập thật, không phải mock.
- Frontend baseline: 171 tests PASS, build và kiểm tra manifest PASS. Backend F01: 115 PASS, 4 SKIP cần MySQL; core/accounts: 38 PASS, 2 SKIP theo môi trường. CI PR #29 thành công.

**Giới hạn môi trường:** bản thử thành công gọi backend trên PC tại Việt Nam, SQLite cô lập, qua tunnel tạm thời. Render vẫn có lỗi Zalo `-501` vì IP gọi Graph API ở ngoài Việt Nam. Không sửa lỗi đó bằng cách đổi region TiDB: region database không quyết định IP egress của backend. Không gọi toàn bộ production/TiDB/kết nối hai tài khoản là hoàn chỉnh từ bằng chứng này. Đọc `docs/releases/zalo-login-verified-2026-10-14.md` để tái lập profile thử đúng cách. Tunnel có thể hết hiệu lực; nhận URL backend đang chạy từ người vận hành, không tự dùng lại URL cũ hoặc tự fallback sang Render.

## 2. Đọc tài liệu trước khi sửa

Đọc `AGENTS.md` và nested AGENTS trong phạm vi sửa; `docs/project-scope.md`; skills DSA, security, UI trong `.agents/skills/`; `docs/engineering/dsa-rules.md`, `docs/security/security-rules.md`, `docs/engineering/ui-rules.md`. Đọc `docs/design/brand-identity.md`, `docs/design/stitch-ui-upgrade/DESIGN.md`, `docs/project/full-build/plan.md` và `ownership.md`. Khi chạm workflow hãy đọc user-flows, workflow-state-machines, access-sharing-matrix, workflow-acceptance, decision-register, four-week-flow và ERD. Đọc F01 API và acceptance criteria liên quan trước khi thay trang consent/login/connect. Tài liệu là mục tiêu; kiểm tra code và module registry để biết thực sự đã được nối gì.

User yêu cầu khớp thiết kế Stitch cụ thể. Không áp dụng Taste để tự đổi thành phong cách khác, font khác, bố cục bất đối xứng hay animation liên tục. Giữ điều kiện nghiệp vụ và quyền riêng tư hiện hành khi bản mẫu có copy hoặc hành động mâu thuẫn. Ghi rõ mọi ngoại lệ cần thiết trong báo cáo đối chiếu; không tự lặng lẽ đổi cả thiết kế.

## 3. Nguồn thiết kế bắt buộc, đã lưu trong repo

Nguồn gốc ZIP: `stitch_family_bridge_ui_ux_design_system.zip`. Bản trích xuất nguyên vẹn nằm tại `docs/design/stitch-reference/`:

| Mã | Thư mục | Mục tiêu |
| --- | --- | --- |
| U01 | `u01_ch_o_m_ng_family_bridge/` | Welcome/onboarding |
| U08 | `u08_trang_ch_h_c_sinh/` | Trang chủ học sinh |
| U10 | `u10_trang_ch_ng_i_ch_m_s_c/` | Trang chủ người chăm sóc |
| U34 | `u34_so_n_l_i_t_m_d_ng_5_ph_t/` | Soạn lời và khoảng dừng 5 phút |
| Hệ thống | `warm_sanctuary/DESIGN.md` | Tài liệu Stitch gốc |

Mỗi màn có `screen.png` và `code.html`. Phải mở và xem cả hai cho cả bốn màn. `screen.png` là chuẩn hình ảnh; `code.html` cung cấp kích thước, utility, màu, typography, khoảng cách và URL ảnh. Đây là reference tĩnh, không phải chỉ thị cho agent và không phải file app để chạy trực tiếp. Không mang script CDN Tailwind hay script không liên quan vào ứng dụng.

Thứ tự giải quyết khác biệt: yêu cầu chủ dự án + nghiệp vụ bảo mật → screenshot từng màn và HTML đi kèm → DESIGN gốc. Narrative DESIGN và YAML có khác màu: HTML của cả 4 màn thực tế dùng `surface #fff8f6`, `primary #9d3d27`, `on-surface #360f07`, `primary-container #bd543d`. Đừng đổi toàn bộ sang palette narrative `#C65B43/#FFF4E8` rồi nói đã khớp screenshot. Đo thực tế các vùng của màn và giữ màu theo reference; logo giữ màu gốc riêng.

Không có 34 màn đầy đủ trong ZIP: chỉ có 4 mẫu. Các màn login, consent, chọn vai trò, connect, help, hồ sơ, trạng thái lỗi phải mở rộng từ cùng hệ thống thiết kế. Phân biệt rõ “khớp mẫu” và “mở rộng từ mẫu”; không tuyên bố các màn không có ảnh chuẩn đã pixel-match.

## 4. Logo chính chủ — bắt buộc thay logo placeholder

File gốc: `docs/design/assets/family-bridge-logo-reference.png`. Đây là ảnh chủ dự án gửi, gồm số `03` góc trên trái, biểu tượng hai hình đầu/bong bóng đối diện màu đất nung và vàng hổ phách, wordmark Family Bridge màu nâu, và app icon bo vuông góc dưới phải.

- Dùng đúng biểu tượng và chữ có sẵn, không vẽ lại logo bằng icon thư viện, emoji, SVG hình bong bóng đơn giản hoặc AI sinh lại. Không thay font wordmark bằng chữ HTML gần giống.
- Tách deterministic từ ảnh nguồn thành: logo lockup có biểu tượng + wordmark; mark đứng riêng; app icon đúng vùng dưới phải. Cắt bỏ số `03`, khoảng trống thừa và các yếu tố của bảng trình bày. Giữ ảnh nguồn bất biến; ghi tọa độ crop, hash nguồn và các derivative trong asset manifest.
- Không bóp méo, kéo dãn, đổi hue, đổ bóng mới lên logo; `object-fit: contain`, giữ tỷ lệ, clear-space hợp lý. Nếu cần bản trong suốt/vector chưa có, giữ bản nền gốc và báo hạn chế; không giả là đã có SVG chính chủ. Không chỉ nhét nguyên concept board vào header.
- Thay tập trung qua `zalo-mini-app/src/components/logo.js`, giữ API component tương thích và các kích cỡ phù hợp. Những test phụ thuộc cấu trúc SVG placeholder có thể cập nhật sang kiểm tra img asset/alt/tỷ lệ; không xóa test nghiệp vụ.
- Dùng logo thật tại welcome/login, topbar, hồ sơ hoặc about có branding; dùng mark nhỏ trên nav nếu mẫu cần; app icon trong cấu hình phù hợp sau khi kiểm tra schema ZMP. Asset phải đóng gói qua Vite, có trong build và upload, không tham chiếu đường dẫn Windows.
- Logo ảnh có màu rust/amber/nâu và texture nhẹ. Đây là ngoại lệ được user yêu cầu so với logo prototype trong Stitch; ghi nhận rõ ngoại lệ này trong visual report.

## 5. Phạm vi và kiến trúc triển khai

Stack hiện hành: **HTML5, CSS3, vanilla JavaScript ES Modules, Vite, zmp-sdk**. Không chuyển React, zmp-ui hay framework mới; không upgrade SDK/Vite hoặc dependency lock chỉ để làm UI. Prototype Tailwind chuyển thành CSS local với tokens/semantic classes trong cấu trúc hiện hành. Font Be Vietnam Pro đúng prototype, đủ tiếng Việt và weights 400/500/600/700; ưu tiên bundle font có giấy phép thay vì phụ thuộc CDN runtime. Icon Material Symbols trong mẫu có thể dùng asset SVG local được phép, giữ silhouette/stroke/fill; không thay hàng loạt bằng emoji.

Khảo sát trước: `zalo-mini-app/src/styles/`, `src/components/`, `src/app/router.js`, `src/app/store.js`, toàn bộ pages; contracts dưới `packages/family_bridge_mobile_core/`; feature pages/API dưới `packages/family_bridge_mobile/`. Xác định phần đang mount thật và phần chỉ là module độc lập. Không tạo frontend thứ hai hoặc router thứ hai để né integration.

Map ban đầu:

- U01 → `src/pages/welcome/index.js`.
- U08/U10 → `src/pages/home/index.js`, render đúng vai trò và đúng trạng thái session/connection.
- Login/consent/role/connect → pages tương ứng, cùng language/tokens nhưng giữ callback và guard hiện hành.
- U34 → khảo sát module `packages/family_bridge_mobile/f06_drafts/` và các contract pause/preview hiện có. Router scaffold hiện chỉ liệt kê welcome, home, companion, mailbox, diary, profile, connection-check, help, login, consent, connect… chưa có route U34 riêng. Không tự tuyên bố U34 đã tích hợp. Nối module đúng registry/contract nếu backend và route hỗ trợ thực sự; nếu chưa, tạo UI state phù hợp và ghi feature chưa khả dụng, không mock send thành công. Thay shared routing chỉ trong phần nhỏ được review.

Trước sửa, lập inventory: route → file → trạng thái auth/role → adapter/endpoint → tác dụng phụ → reference. Commit các phần nhỏ: assets/tokens/components; onboarding/auth; home; compose nếu hỗ trợ; validation/docs. Tách backend/API/schema thay đổi ngoài phạm vi ra issue riêng, không gom vào PR UI.

## 6. Giữ nguyên đăng nhập và kết nối backend

Những file có contract trọng yếu cần coi là baseline: `src/core/config.js`, `session.js`, `login-startup.js`, `login-error.js`, `api/client.mjs`, `adapter/adapter.js`, `adapter/zalo-adapter.js`, và guards trong `src/main.js`. Mặc định chỉ đổi presentation; nếu bắt buộc thay binding, chứng minh tương đương bằng regression test.

1. SDK `getAccessToken()` chỉ gọi qua adapter trong Zalo host; import động. Không import/call SDK trực tiếp từ component. Không dùng getUserInfo/getPhoneNumber/followOA để vượt lỗi hoặc thu thêm dữ liệu không cần thiết.
2. Token SDK gửi về `POST /api/v1/auth/session` theo contract hiện có; backend xác minh Zalo và cấp token app. Không tin user ID/role do client tự gán, không gọi Graph API trực tiếp bằng app secret từ frontend, không giả token.
3. Giữ `VITE_API_BASE_URL` theo profile được người vận hành cấp. Không hardcode Render hay tunnel vào source. Đừng thay endpoint/path/body/response parser/Authorization/CORS trong PR UI. Không đổi 401 thành thành công để mở trang.
4. App session in-memory; không lưu token vào localStorage/sessionStorage/cookie/URL/QR/log/screenshot/analytics. Giữ generation guards: response cũ không ghi đè người mới, 401 request cũ không xóa session mới, logout thu hồi đúng phiên.
5. Không tự retry mutation hoặc login loop vô hạn. Loading khóa thao tác lặp, lỗi trả trạng thái thử lại bằng hành động người dùng. Giữ phân loại `ApiError.kind`; status0 không đồng nghĩa timeout. Hiển thị message đã làm sạch qua loginErrorMessage, không render raw provider text.
6. Profile `VITE_MANUAL_LOGIN_TEST=1` phải mở `/login` và KHÔNG silent login; `/help` vẫn truy cập ngay. Có nút **“Đăng nhập bằng Zalo”** rõ ràng. Không dùng copy “Tiếp tục” để khiến chủ dự án không biết mình đang kiểm thử đăng nhập. Welcome vẫn có CTA thiết kế dẫn đúng luồng. Giữ label bản thử khi cấu hình. Profile thường vẫn giữ silent-login đã có.
7. Login thành công đi theo consent/role/connect gate hiện hành. Không vì thiết kế home đẹp mà bỏ consent hoặc giả đã chọn vai trò. Consent từng purpose, không precheck; tự nguyện survey/AI phải riêng theo contract.
8. Trong trình duyệt thường, hiển thị hướng dẫn mở bằng Zalo, không tạo phiên thật giả. `?demo=1` là lựa chọn minh họa rõ ràng, không tự fallback khi API lỗi; demo fixture không thể được dùng làm bằng chứng test thật.
9. Giữ manifest fix `!f.isEntry` cho listAsyncJS và script verify tất cả emitted JS. Không bỏ chunk dynamic-entry, không inline lại tất cả để che lỗi. Kiểm tra ảnh/font/CSS cũng xuất bản và load được trong Zalo.

## 7. Yêu cầu tái tạo từng màn

### U01 — Welcome

Giữ nền kem hồng rất nhạt, khoảng thở đầu trang, pill thông tin phiên thử dành học sinh/phụ huynh THPT, card hero trắng bo mềm, brand ở giữa. Thay icon mẫu bằng logo thật. Headline “Mở lời nhẹ nhàng, gần nhau hơn” có đúng độ lớn, độ đậm và ngắt dòng. Giữ paragraph giới thiệu bốn tuần/tự nguyện/quyền riêng tư, card ảnh mẹ-con với overlay trắng phía dưới, card cam kết ranh giới màu hồng nhẹ, shield, badge, hai chip, CTA rust và secondary action, help card rồi footer.

Ảnh hero lấy đúng asset được HTML tham chiếu nếu hợp lệ và sử dụng được; lưu local có nguồn. Nếu tải không được hoặc quyền chưa rõ, ghi blocked asset cụ thể, giữ đúng aspect ratio/khung/crop bằng fallback trung tính; không tự thay stock photo khác rồi báo khớp. Không dùng ảnh screenshot làm toàn bộ trang thay DOM tương tác.

Số “Hơn 1,200 gia đình…” chưa có bằng chứng: giữ cấu trúc overlay nhưng dùng copy trung tính đã duyệt hoặc thống kê backend thực có. Footer “tiếp tục = đồng ý” trong prototype không được thay consent gate; dùng copy chính xác theo quy trình app. Nút help phải hoạt động ngay dù chưa đăng nhập.

### U08 — Trang chủ học sinh

Giữ header mark + Family Bridge/Trang chủ, help pill/avatar; context pill không gian an toàn; date; headline chào người dùng; subtitle nhẹ. Đúng thứ tự: amber card nhu cầu được lắng nghe; mood white card sáu lựa chọn; connection card; card ranh giới riêng tư; hành trình bốn tuần; quick actions; bottom nav năm tab.

Mood: “Vui vẻ / Bình yên / Mệt mỏi / Lo lắng / Buồn bã / Căng thẳng”, shape/grid/màu/text theo mẫu, selected/loading/error/disabled có trạng thái rõ. Tên An, Mẹ, ngày, week1/4, dấu online và unread không hardcode thành dữ liệu thật. Dùng actor/role/backend response được phép; chưa có active connection hiển thị trạng thái chưa kết nối với cùng geometry. Không fake online nếu API không có presence. Bấm card chỉ đến route/module được support, không gửi nội dung thay người dùng.

### U10 — Trang chủ người chăm sóc

Giữ header/greeting/ngày/context tương thích U08. Thứ tự: card tự chăm sóc bản thân với bốn mood; rust card chủ động kết nối nhẹ nhàng và CTA trắng; hộp thư với message card hồng; card cam kết tôn trọng riêng tư; bài học lắng nghe 60 giây với ba hàng đánh số; hoạt động gia đình ảnh lớn và CTA; footer + bottom nav.

Tên “Mẹ của An” chỉ khi có mapping thật; có thể dùng tên actor khi chưa biết quan hệ. Badge unread lấy response thực, zero/empty/error rõ ràng. Nội dung message chỉ từ inbox đã được backend phân quyền, không dùng nhật ký riêng của con để làm card. Chương trình/hoạt động là tự nguyện; module chưa enable hiển thị trạng thái trung thực. Không tự khởi tạo tham gia hoặc gửi lời mời khi chỉ render card.

### U34 — Soạn lời / khoảng dừng 5 phút

Giữ topbar back/title/help/avatar, pill bản nháp riêng tư, recipient card có dropdown, intent card, textarea với counter động, AI card nhẹ, pause card hourglass/timer/progress, nút bắt đầu nghỉ/lưu nháp, CTA preview và help card cuối.

Recipient lấy từ active connections/grants theo contract; chọn recipient rõ ràng, không tự đoán “Mẹ”. Text mẫu không trở thành draft của người thật. Character counter theo giới hạn hiện có; không tự mở input vô hạn. Draft/AI riêng tư, không lộ cho người thân/giáo viên/admin. Không tự nối AI provider hoặc gửi draft lên dịch vụ mới. Tôn trọng unavailable/permission/offline states.

Timer 05:00 là fixed **300 giây**, nguồn thời gian/trạng thái máy chủ theo workflow. Refresh/resume không cho phép né pause. Hết timer chỉ mở hành động phù hợp, **không tự gửi**. Gửi phải chọn người nhận, preview và explicit confirmation. Help bypass pause. Tuyên bố autosave chỉ xuất hiện nếu code lưu thành công thực sự; lỗi giữ nội dung và thông báo, không nói đã lưu khi failed. Badge “An toàn 100%” và “chuyên gia luôn sẵn…” chưa chứng minh: thay factual copy tương đương về bố cục, ghi ngoại lệ.

## 8. Màn không có screenshot và hệ thống dùng chung

Login có logo thật, typography/tokens Stitch, CTA thủ công rõ, busy/error/success, hướng dẫn ngoài Zalo, không bỏ label bản thử. Consent có card từng purpose và checkbox đúng contract, link policy/help. Role select giữ card role rõ và không đổi role qua CSS. Connect có chưa kết nối, pending, active, invalid/expired code, revoke confirmation và error states; đổi style không đổi bilateral confirmation/TTL/rate bounds. Help giữ immediate access, số/contact theo nguồn được app duyệt; không bịa hotline hoặc availability từ text mẫu. Hồ sơ/logout giữ revocation và cleanup thật. Với trang đang là scaffold, báo rõ hạn chế và link không hoạt động; không giả rằng module đầy đủ đã chạy.

Shared tokens phải bao quát background, surface/tints, text, action, muted, border, focus, states, spacing, radius, shadow, font-size/line-height và nav safe-area. CSS có scope, tránh broad selector phá form/timer. Icon-only có aria-label; img có alt; button đúng type; link đúng semantics. Không dùng clickable div hoặc chỉ rely màu để báo lỗi.

## 9. Responsive, accessibility và asset quality

Baseline tài liệu 390px; phải đo viewport screenshot gốc trước so sánh, không resize ảnh tham chiếu tùy ý để khớp. Kiểm tra thêm 320/360/390/430px; trên desktop đặt khung phù hợp, không nới toàn bộ mobile layout thành dashboard khác. Không tràn ngang. Giữ ngắt dòng tiếng Việt, dấu, font metrics và mật độ giống mẫu. Hero ảnh dùng crop/object-position thực tế. Card padding/gaps/radius/shadow/lineheight đo theo HTML+ảnh, không ước lượng đại khái.

Bottom nav năm mục đúng thứ tự active color/icon/label; chừa `env(safe-area-inset-bottom)` và khoảng cuối body để CTA không bị che. Zalo top inset theo nền tảng; bàn phím không che textarea/preview. Target chạm tối thiểu44px cho action quan trọng; focus-visible, contrast kiểm tra theo UI rules, reduced-motion. Chỉ animation nhẹ150–200ms nếu cần, không loading vô tận/loop trang trí. Không đổi toàn bộ palette để sửa một contrast; sửa cặp cần thiết và ghi deviation.

Bundle assets local, tối ưu có giới hạn hợp lý và không làm logo mất chi tiết; width/height rõ để tránh layout shift. Không hotlink logo/temp path. Không nhúng base64 cả conceptboard vào JS hoặc đưa screen.png thành background giao diện. Asset nguồn và derivative đều có provenance/hash. Kiểm tra CSP/network của Mini App và upload đúng image/font paths; tài liệu tham chiếu không được vô tình vào runtime bundle.

## 10. Các trạng thái dữ liệu cần đối chiếu

Cho mỗi route ảnh chuẩn, tạo fixture visual được ghi “Dữ liệu minh họa” qua cơ chế demo/test hiện có: logged-out, logged-in missing consent, missing role, student, caregiver, no connection, pending, active, empty, loading, API error, offline, session expired. Không thêm nút debug/role switch/token input vào bản thật. Bản demo dùng để đo hình ảnh; bản thật dùng để chứng minh integration.

Đảm bảo async cleanup khi chuyển route, không nhân đôi event listener/poll/timer. Giữ bounds pagination/list/text/cache; không fetch toàn lịch sử để vẽ home. Nếu server báo revoke hoặc actor thay đổi, dữ liệu private cũ phải bị dọn; không render stale cache vì animation. Không thêm telemetry ghi token/nội dung cá nhân.

## 11. Quy trình xác minh bắt buộc

1. Trước sửa: chạy baseline suite và build, lưu commit SHA/env profile (không secret), chụp các trạng thái auth hiện hành. Đọc scripts/package engines để dùng đúng runtime; không sửa lock để ép test.
2. Sau sửa: `npm ci`, `npm test`, `npm run build` trong `zalo-mini-app`; `python scripts/check_agent_docs.py` ở root. Chạy feature-module tests liên quan nếu sửa chúng. `git diff --check`; check manifest mỗi emitted chunk và asset tồn tại. Nếu backend không đổi, có thể dùng bằng chứng baseline backend kèm ngày/SHA; không nói vừa chạy lại nếu không chạy.
3. Regression trọng yếu: SDK host gate; không auto demo; manual-profile mở nút; normal silent-login; timeout/network/401 errors an toàn; click double không nhân request; consent không preselect; role/connection transitions; session generation/late response/logout; help luôn mở; timers không auto-send. Bổ sung test thay đổi hành vi thực tế, không viết test chỉ copy CSS implementation.
4. Visual: chụp đủ 4 màn ở đúng viewport với fixtures tương đương, font loaded và animation ổn định. Xuất ảnh reference/actual/overlay hoặc diff, ghi kích thước, scroll vùng, state và các khác biệt. Đo màu, type, gap, radius, crop; sửa sai khác rõ ràng. Pixel diff là hỗ trợ, không chứng minh auth. Không gọi “y hệt” nếu ảnh/font còn placeholder hoặc bố cục khác.
5. Khi deploy DEV, dùng backend hiện đang được người vận hành xác nhận chạy, giữ `VITE_MANUAL_LOGIN_TEST=1` và label thử; kiểm tra bundle thực chứa đúng URL qua kiểm tra an toàn, không in token. Deploy chỉ sau local checks; không overwrite production/release channel. Xác nhận người test thấy **Đăng nhập bằng Zalo**, bấm thành công, đi qua đúng gate. Cung cấp một QR mới cho bản đã kiểm tra, tránh yêu cầu quét nhiều bản sửa vụn.
6. Cần test trên Zalo thật cho nghiệm thu cuối: DOM/browser screenshot không chứng minh SDK token. Nếu thiết bị/backend không sẵn sàng, báo NOT_RUN/blocked và giữ PR reviewable; không tự biến mock thành PASS. Không đổi backend region/DB/cert/CORS/app secret để làm UI.

## 12. Tiêu chí hoàn thành và bàn giao

Đạt khi: bốn màn có đối chiếu rõ; logo đúng nguồn; routes đã có giữ hoạt động; login/consent/connect regression không fail; manifest đủ assets; không có secret hay dữ liệu người dùng thật; nav/help/timer/preview đúng contract; không thêm chức năng giả. Những module chưa mount/API chưa có phải ghi riêng, không gắn Done.

Bàn giao trong PR: mô tả vấn đề và kết quả, route/file map, screenshots actual+reference, asset manifest/hash và giấy phép font/icon/ảnh, bảng ngoại lệ copy/logo/contrast so với Stitch, test command/count/pass/skip/not-run, profile DEV+version/link nếu đã deploy, giới hạn môi trường và rollback. Runtime analysis nêu bounds/time/space của code mới; UI mapping nhỏ nên đơn giản, không scan history hay cache không giới hạn. Không claim docs/build là security certification.

Rollback: revert commit UI về baseline login đã merge; giữ secrets ở backend và giữ configuration ngoài source. Không xóa database, thu hồi user, thay parent App ID hoặc redeploy bản lỗi để rollback. Không đổi PR login đã hoàn chỉnh. Kết thúc với PR có thể review và thông tin nghiệm thu trung thực.

**Thực hiện đến khi giao diện và regression được xác minh trong phạm vi sẵn có. Khi gặp input ngoài quyền truy cập, hoàn thành phần độc lập, chỉ nêu đúng input còn thiếu. Không hỏi lại chủ dự án chọn phong cách: phong cách đã được quyết định bằng bốn màn Stitch và logo đính kèm.**
