# Bàn giao quản trị Family Bridge cho thầy/đơn vị

**Trạng thái:** tài liệu thiết kế và kế hoạch nghiệm thu, chưa có admin UI hoạt động trên main baseline cbc40a402d2fcdaeb8be7f0eed3910299148dce8. Tên menu/nút dưới đây là yêu cầu cho UI sau này. Không dùng hướng dẫn này để khẳng định thầy đã tự thao tác được. Screenshot/video/biên bản với UI thật: **cần bổ sung sau triển khai và thử nghiệm**; không dùng mockup/ảnh giả làm evidence.

Đọc [scope](../project-scope.md), [capabilities](../product/admin-capabilities.md), [từng field](../product/admin-configuration-catalog.md), [lifecycle](../product/content-lifecycle.md), [FL/AF](../product/user-flows.md), [acceptance](../product/workflow-acceptance.md), [decisions](../product/decision-register.md), [incident](../security/incident-response.md). Admin chỉ hiện capability được cấp và backend kiểm tra lại. System Administrator có named capabilities quản trị toàn hệ thống được cấp rõ; không quyền đọc nhật ký/AI/mood riêng, toàn bộ thư/note hẹn/raw survey/mapping chỉ vì role cao. Một người có thể nhiều role, review/publish bằng hai bước riêng; pháp lý/chuyên môn vẫn cần người phụ trách duyệt thật.

## Chuẩn bị trước bàn giao

1. Chốt người sở hữu của đơn vị, người vận hành dự phòng, reviewer chuyên môn/privacy, staff thật tiếp nhận và liên hệ bảo trì; thay các mục “chưa phân công” bằng tên/liên hệ được đồng ý trong sổ vận hành **riêng có quyền truy cập**, không repo công khai. Chốt DEC-12..23 theo gate; chỉ dữ liệu synthetic trước khi đạt.
2. Owner cung cấp tài khoản của đơn vị/thầy trên từng dịch vụ. Mời coder bằng role hạn chế/TTL; không dùng tài khoản cá nhân coder làm chủ billing/domain/app/DB/provider. Không chia sẻ mật khẩu hay login thay thầy; mỗi người tự nhận invitation và xác thực tài khoản.
3. Thầy tự đăng nhập Zalo Mini App phiên hợp lệ, nhận role/cap/scope/TTL rõ; xác nhận SYSTEM khác SCHOOL. Thử role nhỏ để hiểu menu theo quyền, không bật `is_staff`/superuser thay role nghiệp vụ. Màn hình chưa có thì ghi blocked US tương ứng, không “thực hiện bằng console DB” cho công việc thường ngày.
4. Với thao tác nhạy cảm, triển khai step-up đúng cơ chế đã chốt DEC-14; không chỉ checkbox “tôi là admin”. Kiểm tra owner dự phòng hoạt động trước thu hồi admin cũ. Last viable SYSTEM admin không được khóa/thu hồi nhầm.
5. Môi trường nghiệm thu synthetic và restore tách production, có version/build SHA ghi lại; các service accounts/keys nằm secret manager/server của đơn vị, không tài liệu, chat, git, screenshot, file export hoặc URL. Biên bản chỉ lưu reference/owner/ngày kiểm tra, tuyệt đối không giá trị credential.

## Menu và việc tự làm trong app khi đã triển khai/đạt nghiệm thu

| Menu dự kiến | Thầy làm được với capability | Không thuộc quyền mặc định / đường khác | Liên kết |
| --- | --- | --- | --- |
| Nội dung → Chương trình/Thẻ/Nhật ký/Thỏa ước/FAQ | Clone draft, sửa, preview theo actor, review, publish, retire, rollback bản mới | Không sửa trang riêng/confirmed agreement; không đổi4 tuần hoặc nghiên cứu chốt | AF-01; catalog A..D |
| Nhận diện | Chọn asset registry đã duyệt, brand/functional color theo validation, preview, rollback | File logo 03 chưa có; upload ngoài MVP, asset mới cần quy trình/coder | AF-01; CFG-E; brand doc |
| Hỗ trợ → Danh bạ/Lịch tiếp nhận | Verify/consent, sửa số/giờ/timezone, tạm ngừng, assign staff | Không tư vấn/chẩn đoán hoặc hứa staff 24/7, không đọc note mọi request | AF-02; CFG-F |
| Hẹn được giao | Staff tự đọc request được giao, accept/decline/đề xuất giờ/cancel theo workflow | System Administrator chưa assigned không note; user tự confirm giờ mới | FL-18; CAP-10 |
| Nghiên cứu → Form/Cohort/Báo cáo | Tạo/clone version form, phase/audience; aggregate/export đúng scope đã suppression | Không raw answers/mapping/SQL tự do/hạ k floor; policy chưa chốt không report | AF-03; CFG-G |
| Tài khoản & quyền | Invite, roles/caps/scope/TTL, revoke/lock có căn cứ và audit | Không tự nâng quyền, login/consent/connect thay; không sửa định danh provider | AF-04; CFG-H |
| Cấu hình → Modules/AI/Nhắc lịch | Chỉ flags đã code, typed safe ranges; AI off giữ manual/help | Không pause≠300, auto-send, help off, bulk Zalo push/code/URL/key | AF-05; CFG-I |
| Vận hành/Quyền riêng tư/Audit | Sanitized health/quotas, assigned case status, bounded audit lọc | Không full DB download; backup/restore/keys/deploy trên console với quyền riêng | AF-06; CFG-J |

## Cách đọc một phiên bản và phát hành

Trang Chi tiết hiển thị ID/revision/state, audience/scope, người sửa, ngày server, lý do và nơi đang tham chiếu (chỉ số liệu vận hành được phép). Draft chưa người nào dùng có thể xóa bằng quyền phù hợp; published/referenced thì clone revision mới và retire/archive, không hard delete. Đọc impacts trước edit: enrollment pin phiên bản cũ, message gửi rồi giữ approved snapshot, prompt/template mới không rewrite trang riêng hoặc thỏa ước đã xác nhận.

Quy trình thường ngày: **Chọn bản → Nhân bản/Tạo draft → Sửa → Lưu → Preview → Xem lại snapshot → Xác nhận phát hành**. Preview chọn học sinh/người chăm sóc/chung, màn hình nhỏ/chữ lớn, help luôn hiện. Nút publish phải giải thích đối tượng nào nhận bản mới và đối tượng nào giữ pin. Nếu chỉ một người vận hành, cùng người tự xem lại và confirm publish sau khi review receipt tạo ra; không ghi reviewer giả. Nội dung consent/pháp lý/chuyên môn có approval reference của người phụ trách hợp lệ trước publish. Sửa sau review làm mất receipt và cần review lại.

409 “Bản đã thay đổi”: tải bản mới, so sánh fields và tự quyết định áp input; không bấm liên tục, không ghi đè người khác. Timeout publish “chưa rõ kết quả”: dùng tra trạng thái request/current release; retry theo cùng key nếu hợp đồng cho phép, không tạo bản thứ hai để đoán. Hủy draft không gửi/publish. Bulk action phải preview IDs/scope/count/impacts, xác nhận rõ và xem outcome từng item; không “chọn tất cả toàn DB”.

## Ví dụ thực hành không viết code

### Đổi chủ đề tuần 2 (AF-01, AT-01-01)

1. Nội dung → Chương trình → baseline 4 tuần hiện hành. Ghi ID/version, chọn Nhân bản bản nháp, lý do “làm rõ hướng dẫn tuần 2”. Không sửa published trực tiếp.
2. Tuần2 → sửa title/description/objectives theo CFG-A06/A07/A08; giữ ordinal 2 và mục đích baseline, week_count=4. Nếu muốn mục tiêu khác phạm vi nghiên cứu phải dừng chốt riêng, không tự phát hành.
3. Preview actor student/caregiver, kiểm tra câu chữ dễ hiểu, liên kết hoạt động/lesson và thời lượng; không bắt đi tuần1 trước.
4. Lưu xem lại → xác nhận phát hành với CAP-02. Kiểm tra release mới cho enrollment mới; actor A đang pin v1 vẫn v1, không âm thầm chuyển. Ghi actual/evidence AT-01-01 + WT-12-01 khi UI thật có.

### Thêm thẻ cảm xúc (AF-01, WT-08-01)

1. Thẻ → Tạo draft → chọn group/order/audience. Điền title/body/guidance/recipient guidance/pronoun context từ CFG-B; nội dung không chẩn đoán/đổ lỗi.
2. Preview thẻ, composer recipient và hướng dẫn người nhận; chưa có recipient thì không Gửi. Thầy chỉ quản lý mẫu, không bấm gửi thay gia đình.
3. Review/publish, thử bằng actor synthetic chọn recipient/preview/explicit send; message chỉ approved body, template mới không sửa message cũ. Không gửi tới người thật để nghiệm thu.

### Ẩn bài học (AF-01, WT-13-03)

1. Chọn lesson ID và xem program/runs đang tham chiếu. Với thay đổi thường ngày, clone program/content release, đổi visibility theo CFG-A15 rồi review/publish cho enrollment mới.
2. Người pin cũ giữ policy; lỗi chuyên môn nghiêm trọng phải retire safety theo DEC-20 đã chốt và đưa alternative/help, không giấu âm thầm hay hard-delete run/note. Gate chưa chốt: chuyển owner chuyên môn, không tự migrate enrollment.
3. Kiểm tra link không gãy, người mới không start lesson hidden, run cũ không mất note; ghi lý do/audit và biên bản tác động.

### Sửa đầu mối hỗ trợ (AF-02, AT-02-01/02)

1. Danh bạ → chọn contact. Xác minh với chính đầu mối qua quy trình được đồng ý, ghi consent evidence reference, thời điểm xác minh và review_due; không đưa tài liệu cá nhân vào public repo.
2. Sửa phone chuẩn/hours/timezone/name/type theo CFG-F; preview public hiển thị số và giờ đúng. Publish khi đủ verification/consent, kiểm tra public snapshot và fallback.
3. Nếu số cũ không nhận nữa: Tạm ngừng ngay có reason/audit; không rollback số cũ khi chưa xác minh lại. Xem hẹn đang mở, người phụ trách xử lý đổi/cancel cùng requester, không tự đổi giờ đã confirm. Không hứa notification Zalo đã gửi nếu US-019 chưa có.

### Tạo khảo sát trước/sau (AF-03, AT-03-01/02)

1. Form → Tạo/Nhân bản draft; điền stable question codes, prompt/type/options/required/bounds. Validation không code thực thi, scoring chỉ allowlist được duyệt. Chọn audience và phase trước/sau riêng.
2. Cohort → chọn school/scope, pin program/form và policy nghiên cứu đã duyệt; opt-in/withdraw luôn rõ. Preview như participant, review/publish.
3. Khi có response, sửa bằng version mới; không edit schema cũ hay remap answers. Chốt cách thay slot/version trước khi dùng phiên bản khác. Reports chỉ aggregate scoped có k/complementary suppression/differencing đã chốt DEC-15; chưa chốt thì không export, không “k=0 để thử”. System Administrator cũng không raw/mapping.

### Phân công staff nhận hẹn (AF-02, AT-02-03)

1. Kiểm tra người có thật và role staff active/TTL/scope đúng; availability, giờ/timezone và nhận lịch rõ. Khi thiếu người tiếp nhận, tắt booking new requests và giữ danh bạ/help.
2. Bảng Phân công chỉ metadata tối thiểu → chọn request/staff → preview diff/reason → confirm assignment. Backend kiểm tra cap/scope/current revision; không tự assign toàn bộ để đọc tâm sự.
3. Staff tự đăng nhập mở request được giao để accept/decline/propose. Người dùng tự confirm giờ đổi. Reassign làm staff cũ mất note access ngay; kiểm tra overlap/409 và cache trên actor synthetic. Hẹn completed chỉ khi người thực tế tiếp nhận xác nhận theo policy, không từ click Gọi.

### Cấp và thu hồi quyền (AF-04, AT-04-01/02/03)

1. Tài khoản & quyền → Mời → chọn định danh an toàn, roles/caps cần thiết, scope/TTL/reason. Trường S1 không suy thành SYSTEM; không bật quyền tất cả admin hiện có.
2. Người nhận tự login/accept. Thầy xem cap/scope diff, xác thực lại rồi confirm; nếu vượt quyền delegable hoặc self-elevation backend phải deny.
3. Thu hồi chọn đúng grant/scope, preview impacts và confirm step-up. Kiểm tra API action/cached menu mất quyền sau revoke; nhật ký/AI/raw survey vốn không thuộc role vẫn riêng.
4. Trước khóa/thu hồi chủ SYSTEM cuối, tạo và kiểm tra owner kế nhiệm/dự phòng thật. Hai người thu hồi nhau cùng lúc phải guard DB, không để mất admin cuối. Lost account dùng RecoveryCase/owner runbook, không bypass bằng sửa DB hoặc cờ superuser.

### Rollback nội dung/config (AF-01/05, AT-01-02)

1. Lịch sử phát hành → chọn release tốt trước đó → xem diff với current và tham chiếu đang dùng → Clone thành draft mới, reason “khôi phục hướng dẫn đã duyệt”.
2. Validation lại contact current, refs, contrast, legal approval và config safe ranges; loại số hỗ trợ retired, không revive consent/grant/user bị xóa. Nếu module chưa code hoặc AI policy không còn hợp lệ, không bật theo bản cũ.
3. Preview/review/publish bản mới có release ID mới; giữ toàn bộ lịch sử. Rollback không rollback private data/enrollment pin/deletion ledger. Kiểm tra UI mới/actor pin cũ và audit. Backup restore là runbook khác, không nút rollback này.

### Giảm quota/tắt AI khi sự cố (AF-05, AT-05-01/03)

Cấu hình → AI → xem revision/range/cost owner; quota chỉ trong khoảng đã duyệt DEC-16, chưa chốt không cho input tùy ý. Tắt AI safety với confirm/audit; test inflight không apply/gửi, manual/help còn dùng và nháp còn nguyên. Operator xử lý provider/billing/keys ngoài app. Bật lại phải policy/provider/health hợp lệ và review, không “tăng vô hạn” để né lỗi. Không sửa pause300 hoặc help_enabled.

### Xử lý yêu cầu quyền riêng tư và audit (AF-06)

Quyền riêng tư → case được giao → xem receipt/scope/deadline theo policy, không mở tâm sự. Assign/cập nhật trạng thái chỉ dựa worker outcome thật; partial failure giữ failed_needs_action và liên hệ operator qua kênh đã thống nhất. Notice kết quả tối thiểu cho requester, không gửi raw records. Audit lọc scope/time/action/outcome/page bounded; không body/secret/full DB. Nếu audit không ghi được, sensitive mutation failclosed, triage sự cố, help public vẫn có alternative.

## Sổ sở hữu và tiếp nhận quyền dịch vụ

**Tất cả mục dưới đây hiện CHƯA KIỂM CHỨNG** về owner thực tế/cấu hình production. Sau bàn giao điền reference và ngày kiểm tra trong sổ riêng; không chép secrets hoặc mã recovery. Console names/permissions cần đối chiếu giao diện dịch vụ tại thời điểm bàn giao, không hứa Mini App quản lý được console.

| Dịch vụ | Owner và thông tin không nhạy cảm cần chốt | Cách tiếp nhận an toàn / nghiệm thu | Ngoài app / cần người nào |
| --- | --- | --- | --- |
| GitHub repo/organization | Đơn vị/thầy owner, repo URL, branch protection, operator dự phòng | Invite account của đơn vị, người nhận tự login, MFA/recovery ở kho an toàn; kiểm tra access/backup source, thu hồi coder sau chuyển | Repo settings/CI/token rotation trên console; đổi code/merge ứng dụng cần coder và review |
| Zalo Mini App | Đơn vị owner app/App ID, phát hành/review ownership, operator backup | Role invitation đúng chủ, kiểm tra đăng nhập/phát hành ở sandbox; recovery qua quy trình provider, không chia account | Credentials/review/distribution/SDK policy ngoài app; tích hợp cần coder |
| Render | Đơn vị owner workspace/service, region, service IDs, billing contact | Invite minimal operator, xác minh dashboard/deploy rollback quyền, secrets server không show UI | Service/restart/deploy/env/billing console, runbook có operator; code defect cần coder |
| MySQL | Đơn vị owner service, DB reference/version, backup destination, operator | Tài khoản mỗi người/service hạn chế, encrypted backup/restore test synthetic, không paste DSN/password vào docs | Migrations/index/restore/network/key console; schema cần coder + operator |
| AI provider | Đơn vị owner project/model allowlist, processing terms, quota/billing owner | Owner tự tạo/rotate key qua cơ chế secret server đã duyệt; verify health/quota không gửi tâm sự | Endpoint/key/billing/provider outage console; adapter mới cần coder/privacy review |
| Billing/khôi phục/liên hệ | Người thanh toán, dự phòng, ngày gia hạn, escalation và RPO/RTO | Thử contact/recovery bằng account của đơn vị, không coder độc quyền; reference secret vault và owner, không giá trị | Console/hành chính; budget/contract do đơn vị chốt, không admin tự nhập thẻ vào Mini App |

Mỗi owner xác nhận tự truy cập được bằng account của mình, có phương thức khôi phục độc lập, quyền dự phòng đã được kiểm tra và billing không phụ thuộc coder. Mời operator bằng capability cần thiết/TTL; xác minh người nhận qua kênh đã thống nhất. Rotation khi chuyển chủ: cập nhật secret server, kiểm tra service bằng dữ liệu giả, revoke key/token cũ, ghi thời gian/reference/outcome không giá trị. Không commit credential, không đưa key lên URL/screenshots/logs. Truy cập DB/backup vẫn theo mục đích, retention và audit; đây không quyền đọc nội dung gia đình qua admin UI.

## Runbook backup/restore (AF-06; cần operator console)

1. Chốt RPO/RTO/cadence/retention/encryption/key owner/destination/permissions và cách backup durable deletion/revocation ledger **riêng không bị rollback theo snapshot DB** (DEC-12/18). Chưa chốt thì không khẳng định an toàn production.
2. Backup theo policy; ghi manifest timestamp/schema version/code SHA/checksum/encryption-key reference/ledger checkpoint trong kho vận hành hạn chế. Thầy xem status/receipt sanitized, không tải full DB vào Mini App hoặc repo/chat. Kiểm tra restore định kỳ với synthetic data; không gửi bản raw cho coder để “debug”.
3. Sự cố: owner authorize change case + step-up; operator xác minh backup/checksum/key/schema tương thích, dừng writes/giới hạn traffic theo runbook đã duyệt. Help fallback public vẫn truy cập; không chặn vì thời gian restore.
4. Restore vào môi trường cách ly không phục vụ user, không outbound AI/notification/send jobs. Áp **latest** deletion/revocation ledger hiện tại, không chỉ bản ledger trong backup: xóa/khóa user, revoke consent/grants/roles, generation/retention/provider cases đúng phạm vi.
5. Trong lúc restore có revoke/delete mới: reconcile tới cutover checkpoint, freeze writes có quy trình hoặc replay tới watermark transaction rõ; verify không missing events. Không `serving` khi ledger stale, errors hoặc không biết checkpoint.
6. Negative test synthetic: backup trước deletion rồi restore vẫn không đọc user/grant/consent cũ; expired roles không sống lại; current contacts retired không promise; survey withdrawal không report. Kiểm tra auth/indexes/schema/current app version, jobs idempotency không replay gửi.
7. Owner/operator ghi evidence sanitized, approve cutover, resume controlled và monitor. Failed restore giữ cách ly, rollback hạ tầng cũng replay ledger; không khôi phục access cũ để giảm downtime. Thông báo tình trạng theo kênh đã duyệt, không private payload; biên bản thời gian thực so với RPO/RTO mục tiêu.

## Mất tài khoản, sự cố, hết phí/quota và đổi người vận hành

| Tình huống | Việc thầy/operator làm | Gate/recovery/cần coder |
| --- | --- | --- |
| Mất Zalo/admin account | Dùng owner dự phòng đã cấp rõ; mở recovery case, xác minh ownership theo DEC-14, khóa phiên nghi ngờ | Không giả login/consent hoặc tự đổi provider ID; provider recovery qua console, implementation nếu thiếu flow cần coder |
| Mất owner console | Owner dự phòng/recovery độc lập của đơn vị tiếp nhận; escalation nhà cung cấp theo quy trình đã kiểm tra | Không có owner/recovery thì blocked; không hứa coder hoặc app lấy lại quyền được |
| Lỗi dịch vụ/dữ liệu | AF-06 sanitized status, owner triage; giữ help fallback; incident runbook, audit và xác định scope ảnh hưởng | Không xuất DB/tâm sự vào ticket; operator console restore, code bug sửa bằng reviewed task |
| AI lỗi/hết quota/phí | AF-05 tắt AI, manual/help giữ; owner billing kiểm tra quota/cost, không tự tăng ngoài range | Provider console/contract/unit phê duyệt; bật lại khi an toàn, DEC-16 |
| Render/MySQL/Zalo hết phí/ngừng dịch vụ | Billing owner xử lý/khôi phục console, thông báo sanitized, kiểm tra backup và help alternative | Mini App không trả phí/redeploy DB; operator và nhà cung cấp, coder nếu compatibility/code defect |
| Đổi thầy/operator/coder | Inventory accounts/roles/cases/releases/console owner, invite kế nhiệm rồi người đó tự xác minh, rotate service keys và revoke cũ | Không revoke admin cuối trước verify; không chuyển ownership bằng chép secrets vào docs; ghi audit/reference |
| Đầu mối không nhận nữa | Suspend public, thay verified alternative, xử lý hẹn bằng staff có thật và requester confirm | Không nhờ AI/coder đóng vai chuyên gia; staff/reviewer chuyên môn chốt thông tin |

Liên hệ bảo trì: cần đơn vị phân công người/kênh/giờ đáp ứng/escalation và cam kết riêng trước pilot. Không bịa tên, số, SLA hoặc hứa hỗ trợ 24/7. Hướng dẫn app không thay đào tạo chuyên môn/legal; giới hạn UI và capabilities phải nói rõ.

## Nghiệm thu với một người không viết code

Thực hiện trên build đã triển khai, với teacher account của đơn vị và actor synthetic khác nhau. Người quan sát không làm hộ bằng DB/code/console cho các việc app; teacher có thể có nhiều roles. Người qualified duyệt nội dung chuyên môn/legal khi cần. Nếu phải nhờ coder cho field thường ngày trong catalog, ghi failure/US thiếu, không coi bàn giao đạt.

| Bài thực hành | Expected | Evidence hiện tại |
| --- | --- | --- |
| Login actor đúng, xem quyền SYSTEM/SCHOOL và private boundary | Không role flag mở private data; logout cache sạch theo hợp đồng | NOT_RUN; cần UI + Zalo |
| Đổi title/objective tuần 2 | Draft/preview/review/publish; đúng 4 tuần, A pin cũ/B mới đúng | NOT_RUN; AT-01-01, WT-12-01 |
| Thêm thẻ, ẩn lesson | Published version mới, template không message/private rewrite, alternative an toàn | NOT_RUN; WT-08-01, WT-13-03 |
| Sửa phone/hours/suspend | Verified current public snapshot; không revive stale; help luôn có đường | NOT_RUN; AT-02-01/02, WT-17-02 |
| Clone khảo sát trước/sau | Frozen form, voluntary, no raw/mapping/k bypass | NOT_RUN; AT-03-01/02, WT-19-02/03 |
| Assign/reassign staff | Note chỉ assigned, conflict slot/time cần confirm, old staff bị revoke | NOT_RUN; AT-02-03, WT-18-02/03 |
| Invite/revoke TTL school role | Direct API deny sau revoke, không self-elevate/final-admin lockout | NOT_RUN; AT-04-01/02/03 |
| AI off và rollback config/content | Manual/help còn, rollback release mới, không hồi sinh grants/consent | NOT_RUN; AT-05-01/02/03, AT-01-02 |
| Audit/partial privacy case | Sanitized bounded history, status đúng, không full DB button | NOT_RUN; AT-06-01/03 |
| Restore drill cùng operator | Teacher authorize, operator console, latest ledger trước serve, account owner recovery thử được | NOT_RUN; AT-06-02; console evidence riêng |

Biên bản cuối ghi thực tế tên owner/role, build SHA/environment, ngày, task ID, action/result, screenshot/video đã che dữ liệu, lỗi còn lại, liên hệ và thời hạn khắc phục. Teacher tự xác nhận theo bằng chứng thực, không checkbox thay phiên thao tác. Docs hoàn thành không thành US-041/050 Done hoặc SEC VERIFIED. Các file pháp lý, logo 03, policy suppression, staff availability, console ownership và recovery hiện chưa được kiểm chứng trong đợt này.
