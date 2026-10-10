# Danh mục cấu hình và nội dung quản trị

Đặc tả fields cho A..J, chưa model/API/UI. Các tên source là hợp đồng logic đề xuất cần US-004 chốt, không file runtime đã tạo. CHỐT nằm decision register; tất cả giới hạn định lượng mới bên dưới là baseline **ĐỀ XUẤT DEC-17** nếu không dẫn quyết định đã chốt. Không tự coi defaults là dữ liệu nghiên cứu/pháp lý/đầu mối thật. “App” là thầy tự làm sau khi chức năng được xây và nghiệm thu; ở main hiện mọi màn quản trị đều chưa triển khai.

Mục lục: [quy ước](#quy-ước), [A](#a-giáo-trình), [B](#b-thẻ-và-phản-hồi), [C](#c-nhật-ký-và-thỏa-ước), [D](#d-giới-thiệu-và-consent), [E](#e-nhận-diện), [F](#f-danh-bạ-và-lịch-hẹn), [G](#g-khảo-sát-và-nghiên-cứu), [H](#h-tài-khoản-và-quyền), [I](#i-sản-phẩm-và-ai), [J](#j-vận-hành-và-quyền-riêng-tư).

## Quy ước

[CAP](admin-capabilities.md) xác định role+scope; SYS chỉ có quyền tương ứng đã cấp, không bypass. Các prefix source: ProgramVersion/WeekTopic/ContentRevision/Survey*/RoleAssignment theo [ERD](../data/erd.md); ContentGroup/PolicyVersion/BrandRelease/ProductConfig/StaffAvailability/AdminInvite/PrivacyCase/DeletionRevocationLedger là schema đề xuất bổ sung, chưa migrations. Chỉ allowlist keys; defaults áp draft tạo mới, không backfill dữ liệu người dùng âm thầm. String plain text Unicode, strip control nguy hiểm, giữ dấu Việt; URL chỉ HTTPS được kiểm tra, không JS/data URL hoặc tự fetch URL tùy ý. Reason tối thiểu 10 tối đa 500 ký tự cho publish/retire/quyền/operational change.

Mỗi row có source duy nhất, người quản lý/màn hình, type/default/validation, effect/impact, lifecycle policy và execution boundary. Policy cột cuối trước App được áp đầy đủ cho field đó; không quy ước 'admin chỉnh mọi thứ'. Default null nghĩa chưa chốt/chưa nhập, không zero/unlimited. Không log giá trị nhạy cảm. Contact consent/verification receipt bind phone/identity/hours/timezone và revision đã xác minh: đổi các field đó invalidate bằng chứng cũ, phải xác minh/đồng ý lại khi phạm vi thay đổi trước public publish; suspend safety có hiệu lực ngay.

| Policy | Version / preview / rollback / audit / hiệu lực |
| --- | --- |
| P1 | Draft -> Review -> Published; pin content/program, preview theo audience; clone revision rollback, revalidate references; audit public diff+reason. New enrollment/run/item theo release, dữ liệu hiện tại không rewrite |
| P2 | Directory/availability operational revision; preview public/staff views, xác minh lại; publish hợp lệ hoặc suspend ngay vì safety, recheck server; rollback clone reverify; audit metadata, không PII note |
| P3 | Policy/brand/config release typed; preview impact/contrast/action availability, publish có validation/step-up khi nhạy cảm; rollback release mới không giảm safety floors; audit revision/reason; xem effect riêng row |
| P4 | Research draft/form/cohort immutable khi published/referenced/response; preview form+aggregate, new version không remap response; rollback bằng release hợp lệ, no mapping restoration; audit schema/version, không raw answers |
| P5 | Role/account/control state transition có expected revision + step-up; hiệu lực authorization ngay, preview target/scope/TTL/impact; recovery/revoke là event mới, no self escalation; audit metadata, no impersonation |
| P6 | Console/runbook policy ngoài UI; preview plan trong staging, recovery có approval/evidence; audit outcome refs/ledger không secret/DB bodies; không nút download DB trong app |

Giới hạn P/L/body, page 20 tối đa 50, text private <=4000 và JSON <=64KiB, poll 30s/backoff <=120s, UI <=200 metadata, AI một in-flight/actor và <=30s theo DSA vẫn áp dụng. Field text public tối đa 4000 mỗi mục; dài hơn chia mục có phiên bản, không tự cho JSON vô hạn. Default help.enabled=true/pause.seconds=300 và auto_send=false là CHỐT, read-only, không admin edit. Cohort suppression/AI safety envelopes chưa duyệt thì tính năng fail-closed.


## A. Giáo trình

Người quản lý: CAP-01 edit; CAP-02 publish; CAP-03 retire, scope theo CAP. Màn hình dự kiến: Giáo trình > Phiên bản > Tuần/Hoạt động.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-A01 `ProgramVersion.name` | string 1..120; default “Chương trình đồng hành 4 tuần” | Release; tên bản mới, pin cũ giữ | P1 | App |
| CFG-A02 `ProgramVersion.description` | text <=4000; default rỗng, publish phải có mô tả | Release; mô tả public bản mới | P1 | App |
| CFG-A03 `ProgramVersion.week_count` | integer =4; default 4, read-only DEC-02 | Không edit; số tuần khác cần quyết định nghiên cứu riêng | P1 | Coder + quyết định riêng |
| CFG-A04 `ProgramVersion.clone_from` | UUID published/draft được quyền; default null; refs hợp lệ | Clone tạo ID/version mới, không copy enrollment/response | P1 | App |
| CFG-A05 `WeekTopic.ordinal` | integer 1..4; mỗi program đủ duy nhất 1..4 | Release; đổi thứ tự không đổi pin đang dùng | P1 | App |
| CFG-A06 `WeekTopic.title` | string 1..120; default 4 tên trong four-week-flow | Release; sửa wording giữ mục đích chủ đề baseline | P1 | App + chuyên môn |
| CFG-A07 `WeekTopic.description` | text <=4000; default rỗng, publish required | Release; không tự thay phạm vi nghiên cứu | P1 | App + chuyên môn |
| CFG-A08 `WeekTopic.objectives` | list 1..10 text <=300; default nội dung baseline sau duyệt | Release; mục tiêu đọc theo pin | P1 | App + chuyên môn |
| CFG-A09 `ContentRevision.activity_order` | integer 0..999; default vị trí cuối; unique trong nhóm, max 100 items/tuần | Release; reorder ổn định, không đánh dấu done thay | P1 | App |
| CFG-A10 `ContentRevision.audience` | enum student/caregiver/joint; bắt buộc, không default gửi cả hai | Release; lọc đúng đối tượng, không grant | P1 | App |
| CFG-A11 `ContentRevision.duration_seconds` | integer 30..7200; default 300 cho activity; 60 cho lesson | Release; thời lượng dự kiến, không timer bắt buộc | P1 | App |
| CFG-A12 `ContentRevision.instructions` | text 1..4000; default rỗng | Release; prompt/hướng dẫn mới, không sửa ghi chú run | P1 | App + chuyên môn |
| CFG-A13 `ContentRevision.reflective_questions` | list 0..10, text <=300; default [] | Release; không auto answer/send | P1 | App + chuyên môn |
| CFG-A14 `ContentRevision.kind` | enum kind registry: activity/lesson/paper_guide/guidance và kinds B/C/D đã chốt US-004; required | Release; loại phù hợp schema, không nhập executable widget | P1 | App; loại mới cần coder |
| CFG-A15 `ContentRevision.visibility` | enum draft/active/retired; draft default; trạng thái qua action | Ẩn/retire chặn dùng mới; pin safe cũ xem lại, unsafe theo DEC-20 | P1 | App |

## B. Thẻ và phản hồi

Người quản lý: CAP-01/02/03, scope theo CAP. Màn hình dự kiến: Thẻ > Nhóm/Thẻ/Phản hồi/Xưng hô.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-B01 `ContentGroup.title` | string 1..80; default rỗng; max 50 nhóm | Release; nhóm picker mới | P1 | App |
| CFG-B02 `ContentGroup.order` | integer 0..999 unique scoped; default cuối | Release; sort không thay nội dung tin | P1 | App |
| CFG-B03 `ContentGroup.status` | draft/active/retired; default draft | Retire nhóm: preview refs, không orphan thẻ published | P1 | App |
| CFG-B04 `ContentRevision.card_group_id` | UUID active nhóm đúng scope; required | Release; card thuộc nhóm, không cross-scope | P1 | App |
| CFG-B05 `ContentRevision.card_title` | string 1..80; default rỗng | Release; card mới, snapshot tin cũ giữ | P1 | App |
| CFG-B06 `ContentRevision.card_body` | text 1..1000; default rỗng | Release; không gửi tự động | P1 | App + chuyên môn |
| CFG-B07 `ContentRevision.recipient_guidance` | text 0..2000; default rỗng | Release; hướng dẫn người nhận, không đọc original | P1 | App + chuyên môn |
| CFG-B08 `ContentRevision.card_order` | integer 0..999; default cuối; max 200 thẻ thư viện/phiên bản | Release; picker paginated, không tải full thư viện | P1 | App |
| CFG-B09 `ContentRevision.quick_reply_text` | text 1..500; default rỗng; max 20 mẫu/ngữ cảnh | Release; user sửa/duyệt trước gửi | P1 | App + chuyên môn |
| CFG-B10 `ContentRevision.pronoun_context` | enum student_to_caregiver/caregiver_to_student/neutral; required | Release; chỉ đề xuất xưng hô, không suy quan hệ riêng | P1 | App |
| CFG-B11 `ContentRevision.pronoun_labels` | typed object speaker/recipient, mỗi string 1..40; default neutral | Release; no template code/HTML, user có thể sửa | P1 | App |

## C. Nhật ký và thỏa ước

Người quản lý: CAP-01/02/03, scope theo CAP. Màn hình dự kiến: Nội dung > Nhật ký/Mẫu thỏa ước.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-C01 `ContentRevision.journal_topic` | string 1..120; default theo chủ đề tuần đã duyệt | Release; page mới pin prompt, page riêng không rewrite | P1 | App |
| CFG-C02 `ContentRevision.journal_questions` | list 1..10 text <=300; default bản duyệt | Release; chủ page chọn viết, không auto share | P1 | App |
| CFG-C03 `ContentRevision.journal_mode` | enum private/parallel_prompt; default private | Release; parallel là chủ đề chung, không quyền đọc chung | P1 | App |
| CFG-C04 `ContentRevision.agreement_title` | string 1..120; default “Thỏa ước gia đình mới” | Release; proposal mới, confirmed không đổi | P1 | App |
| CFG-C05 `ContentRevision.agreement_prompts` | list 1..10 text <=300; default [] phải duyệt | Release; gợi ý, không admin ký | P1 | App + chuyên môn |
| CFG-C06 `ContentRevision.agreement_terms_template` | list 1..3 text <=1000; default [] | Release; user sửa rồi hai signer accept cùng revision | P1 | App + chuyên môn |

## D. Giới thiệu và consent

Người quản lý: CAP-01/02/03 cho public copy; CAP-04/05 cho policy, scope theo CAP. Màn hình dự kiến: Nội dung > Giới thiệu/FAQ/Onboarding/Chính sách.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-D01 `ContentRevision.about_body` | text 1..4000; default bản chuyên môn duyệt, không kết quả nghiên cứu giả | Release; giới thiệu public mới | P1 | App + chuyên môn |
| CFG-D02 `ContentRevision.how_to_body` | text 1..4000; default rỗng | Release; hướng dẫn đúng feature đã có | P1 | App |
| CFG-D03 `ContentRevision.faq_question` | string 1..200; required; max 50 mục | Release; public FAQ paginated | P1 | App |
| CFG-D04 `ContentRevision.faq_answer` | text 1..2000; required | Release; không hứa trực 24/7/privacy tuyệt đối | P1 | App + chuyên môn |
| CFG-D05 `ContentRevision.project_contact` | typed display_name <=120 + approved contact ref; default null | Release; không tự tạo số người thật/chưa consent | P1 | App + xác minh |
| CFG-D06 `ContentRevision.onboarding_steps` | list 1..10 refs published đúng scope; default bản duyệt | Release; skip info optional, consent riêng | P1 | App |
| CFG-D07 `ContentRevision.system_notice` | title <=120/body <=2000/start/end UTC/audience; default draft; max 5 active | In-app banner opt scope, không bulk Zalo/send tâm sự; expire theo giờ server | P1 | App; notification mới cần scope |
| CFG-D08 `PolicyVersion.purpose` | enum service/ai_processing/research; required | Published policy cho đúng operation, không gộp consent | P3 | App + người phụ trách |
| CFG-D09 `PolicyVersion.body` | text chia section <=4000/section, max 20; required, no code/secret | Release; không tự accept version mới, operation liên quan cần assent | P3 | App + duyệt pháp lý/chuyên môn |
| CFG-D10 `PolicyVersion.processing_summary` | typed recipients/categories/retention refs, <=4000; required | Release; retention OPEN chặn xử lý thật, không bịa thời hạn | P3 | App + owner privacy/provider |
| CFG-D11 `PolicyVersion.approval_ref` | UUID attestation record + approver role/date/source ref; default null | Publish blocked thiếu duyệt cần thiết; admin quyền cao không thay chuyên môn | P3 | App + reviewer thực |
| CFG-D12 `PolicyVersion.requires_reconsent` | boolean theo assessment, default true khi processing đổi; không tùy ý false | Chỉ operation phụ thuộc chờ consent mới, help vẫn mở | P3 | App + owner privacy |

## E. Nhận diện

Người quản lý: CAP-06, scope theo CAP. Màn hình dự kiến: Nhận diện > Tokens/Logo > Preview.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-E01 `BrandRelease.logo_asset_id` | enum approved asset registry; default mẫu 03 pending file, không URL tự do | Release sau asset kiểm tra; hiện không có file logo 03 trong repo | P3 | Coder chuẩn bị asset; upload ngoài MVP |
| CFG-E02 `BrandRelease.primary` | hex RGB #C65B43 default; contrast mọi pair sử dụng phải đạt | Release UI mới; không ép làm màu error/success | P3 | App sau theme đã code |
| CFG-E03 `BrandRelease.accent` | hex RGB #E4AB56 default; không white text trên accent thiếu contrast | Release, accent trang trí không tình trạng tâm lý | P3 | App sau theme đã code |
| CFG-E04 `BrandRelease.background` | hex RGB #FFF4E8 default; control/help vẫn đọc rõ | Release; fallback solid, no heavy background | P3 | App sau theme đã code |
| CFG-E05 `BrandRelease.text` | hex RGB #713D32 default; text contrast >=4.5:1 | Release; không opacity làm mất consent | P3 | App sau theme đã code |
| CFG-E06 `BrandRelease.functional_action_pair` | typed background/on_color hex RGB; default đề xuất #A84733/#FFF4E8 đạt 5.36:1; mỗi color validation và cặp >=4.5:1 | Release; chỉ publish cặp đạt, không auto giảm chuẩn | P3 | App sau theme đã code |

## F. Danh bạ và lịch hẹn

Người quản lý: CAP-07/08 directory; CAP-09 assign; CAP-10 xử lý, scope theo CAP. Màn hình dự kiến: Danh bạ > Đầu mối/Lịch tiếp nhận; Yêu cầu được giao.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-F01 `SupportContact.public_name` | string 1..120; default rỗng | Release public approved; metadata tối thiểu | P2 | App + người thật |
| CFG-F02 `SupportContact.phone` | string normalized + country code, 7..15 digits đề xuất; required, gọi đúng số đã verify | Đổi số vô hiệu verification cho số đó, reverify trước active | P2 | App + xác minh |
| CFG-F03 `SupportContact.operating_hours` | structured weekday/start/end; tối đa 14 slots/week, no overlap; default [] | Live sau publish; giờ rỗng không hứa tiếp nhận | P2 | App |
| CFG-F04 `SupportContact.service_timezone` | IANA allowlist; default Asia/Ho_Chi_Minh; server UTC conversion | Live; hiển thị timezone, hẹn đã confirm giữ UTC và báo thay đổi | P2 | App |
| CFG-F05 `SupportContact.contact_type` | enum school/help; required | Release; help public fallback khác staff inbox | P2 | App |
| CFG-F06 `SupportContact.consented` | bool false default; evidence ref bắt buộc khi true | Active blocked nếu false/withdrawn; không retro accept | P2 | App + consent thực |
| CFG-F07 `SupportContact.verified_at` | server UTC sau thao tác verify + evidence ref; null default | Không client viết timestamp tùy ý, đổi số invalidates | P2 | App + xác minh |
| CFG-F08 `SupportContact.review_due_at` | future UTC >verified_at; default null; khoảng đề xuất <=90 ngày cần DEC-18 | Quá hạn không active/call theo cache cũ, cần đầu mối khác | P2 | App + owner danh bạ |
| CFG-F09 `SupportContact.status` | draft/active/suspended/retired; draft default | Suspend ngay chặn request mới, warning hẹn pending/confirmed; no data delete | P2 | App |
| CFG-F10 `SupportContact.staff_user_id` | UUID active CAP-10 staff school match; default null | Null cho gọi số, không bật in-app hẹn; không grant mọi note | P2 | App + staff đồng ý |
| CFG-F11 `StaffAvailability.accepting_requests` | bool false default, verified staff & schedule required khi true | Live kiểm tra ở create/accept; off không mất help | P2 | App + operator thật |
| CFG-F12 `StaffAvailability.slot_minutes` | int 15..120 default 30; no overlapping UTC slots | Live cho slot mới, confirmed schedule không âm thầm đổi | P2 | App |
| CFG-F13 `AppointmentRequest.assigned_staff_id` | UUID đúng capability/scope; null default; reassignment reason/requester notice | Immediate old handler loses note; new handler explicit scoped permission | P5 | App |
| CFG-F14 `AppointmentRequest.proposed_start_end` | UTC interval [start,end), future, 15..120m; default null | Requester/staff propose -> requester confirm; lock staff schedule | P5 | App |

## G. Khảo sát và nghiên cứu

Người quản lý: CAP-11/12/13, scope theo CAP. Màn hình dự kiến: Nghiên cứu > Form/Cohort/Slot/Báo cáo.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-G01 `SurveyVersion.name` | string 1..120; required; clone source scoped UUID optional | Release mới, không remap existing responses | P4 | App + nghiên cứu |
| CFG-G02 `SurveyVersion.audience` | enum student/caregiver required; no default lấy từ response payload | Release; match participation audience snapshot | P4 | App |
| CFG-G03 `SurveyVersion.phase` | enum pre/post required | Release; phase từ cohort slot, không client tự đổi | P4 | App |
| CFG-G04 `SurveyQuestion.code` | string [A-Z0-9_] 1..40 unique version; required | Freeze khi publish/referenced; paired codes cần plan | P4 | App + plan |
| CFG-G05 `SurveyQuestion.prompt` | text 1..1000; required; max 100 questions/form đề xuất | Release; không sửa wording form có response | P4 | App + duyệt chuyên môn |
| CFG-G06 `SurveyQuestion.answer_type` | enum single/multiple/integer/decimal/scale/text đã renderer hỗ trợ; required | New type ngoài registry cần coder; free text phải assess DEC-15 | P4 | App; loại mới cần coder |
| CFG-G07 `SurveyQuestion.options` | list 2..20 code+label <=120; default [] với non-choice | Unique codes/required matching type, không code executable | P4 | App |
| CFG-G08 `SurveyQuestion.validation` | typed required/min/max/step/max_length; default không required, text max1000 | Reject bounds sai/đáp án ngoài options, no regex/code tùy ý | P4 | App + plan |
| CFG-G09 `SurveyVersion.scoring_policy_id` | enum approved policy registry; default null | No scoring nếu null, không tự thêm p-value/kết quả | P4 | App; thuật toán mới cần coder |
| CFG-G10 `ResearchCohort.name` | string 1..120; required | New cohort scope explicit, không thu PII thêm | P4 | App |
| CFG-G11 `ResearchCohort.school_id` | scope SCHOOL ID hoặc explicit SYSTEM; required choice | Không null->SYSTEM tự suy, không cross-school export | P4 | App theo quyền |
| CFG-G12 `ResearchCohort.program_version_id` | UUID published 4-week program; required | Pin nghiên cứu, không trộn nội dung/phạm vi | P4 | App + plan |
| CFG-G13 `CohortSurvey.pre_form_version_id` | UUID đúng cohort audience/pre published; required theo plan | Mapping immutable publication; response pin | P4 | App + plan |
| CFG-G14 `CohortSurvey.post_form_version_id` | UUID đúng audience/post; required theo plan | Paired analysis giữ compatibility plan, no silent remap | P4 | App + plan |
| CFG-G15 `ResearchCohort.minimum_group_size` | int k>=approved floor; default null -> reports disabled | Không tùy ý giảm hoặc rollback dưới floor; DEC-15 chưa chốt | P4 | Owner policy + coder initial; tăng App |
| CFG-G16 `ResearchCohort.suppression_policy_id` | enum approved versioned policy; null default -> no export | Complementary suppression/filter/differencing; cùng policy UI/CSV | P4 | Coder + privacy duyệt; chọn App |
| CFG-G17 `ResearchCohort.allowed_report_dimensions` | allowlist max 5 dimensions thuộc plan; default [] | No arbitrary query/crossjoin nhận diện, scope & suppression | P4 | App trong envelope; chiều mới cần duyệt |

## H. Tài khoản và quyền

Người quản lý: CAP-14/15/16/22, scope theo CAP. Màn hình dự kiến: Tài khoản > Vai trò/Mời/Khôi phục.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-H01 `AdminInvite.recipient_account_ref` | verified internal user UUID; default null; người nhận tự accept | Không family auto connect/login thay; invitation TTL | P5 | App |
| CFG-H02 `AdminInvite.expires_at` | server UTC; default +24h đề xuất, max 7d; no reuse | Expired không tạo role; khác family invite | P5 | App |
| CFG-H03 `RoleAssignment.capability_ids` | list CAP allowlist 1..22; default []; không vượt delegation authority | Effective khi accept/grant, revoke ngay; no wildcards | P5 | App theo authority |
| CFG-H04 `RoleAssignment.scope_type` | enum SYSTEM/SCHOOL/ASSIGNED_RESOURCE; required; default SCHOOL chỉ khi school rõ | SYSTEM explicit only delegated system grant; không auto expand cũ | P5 | App theo authority; bootstrap console |
| CFG-H05 `RoleAssignment.scope_ref` | typed scope: SYSTEM không resource; SCHOOL cần active school_id; ASSIGNED_RESOURCE cần kind+ID+school context hợp lệ | Không school-null bypass; recheck every action | P5 | App |
| CFG-H06 `RoleAssignment.expires_at` | future UTC hoặc durable theo approved recovery plan; default null pending decision | TTL expiry chặn quyền, final-admin risk không tự gia hạn | P5 | App + owner policy |
| CFG-H07 `RoleAssignment.delegable_caps` | subset caps/scope granted; default [] | Không self-elevation/school->system; same-actor change rechecked | P5 | App chỉ owner có authority |
| CFG-H08 `User.account_status` | active/restricted/deletion_pending/deleted; default active sau verified login | Lock theo reason, revoke session; help public còn; deleted no restore resurrect | P5 | App; deletion service cần coder initial |
| CFG-H09 `AccountRestriction.reason_ref` | approved reason enum + text10..500; required | No diagnosis từ mood, notify phù hợp/quy trình khiếu nại | P5 | App + owner quy trình |
| CFG-H10 `AccountRecovery.unit_owner_ref` | verified unit owner metadata/evidence ref; null default chưa setup | Không UI tự chọn recovery owner mới, protect final admin | P6 | Console + owner/operator |

## I. Sản phẩm và AI

Người quản lý: CAP-17/18, scope theo CAP. Màn hình dự kiến: Cấu hình > Module/Nhắc lịch/AI.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-I01 `ProductConfig.module_flags` | map module registry->bool; default false chưa implemented/verified | Only implemented modules; off giữ data/drafts, UI alternatives; no help flag | P3 | App sau feature flag đã code |
| CFG-I02 `ProductConfig.help_enabled` | bool true read-only DEC-08 | Không tắt dù auth/quota/maintenance lỗi | P3 | Không edit |
| CFG-I03 `ProductConfig.pause_seconds` | int 300 read-only DEC-03 | Không admin tăng/giảm, no client override | P3 | Không edit; đổi cần quyết định riêng |
| CFG-I04 `ProductConfig.auto_send` | bool false read-only | Không job gửi từ timer/AI/resume/retry | P3 | Không edit |
| CFG-I05 `ProductConfig.default_timezone` | IANA allowlist default Asia/Ho_Chi_Minh | Cho default mới, lịch/consent đã pin UTC không rewrite | P3 | App |
| CFG-I06 `ProductConfig.reminder_enabled` | bool false default; chỉ in-app opt-in module đã duyệt | No mass send/Zalo push; withdrawn/quiet-hours suppress | P3 | App sau DEC-19 + coder initial |
| CFG-I07 `ProductConfig.reminder_quiet_hours` | local interval default 21:00..07:00 đề xuất; timezone required | Chỉ opt-in future schedules, không auto gửi nội dung private | P3 | App sau scope duyệt |
| CFG-I08 `ProductConfig.reminder_daily_limit` | int 0..approved max; default 0 chưa chốt | No unlimited; zero tắt nhắc không tắt app/help | P3 | App sau envelope approved |
| CFG-I09 `ProductConfig.list_page_limit` | int 20..50 default 20, max 50 DSA target | Cho queries mới, auth filter trước pagination | P3 | App sau contract typed |
| CFG-I10 `ProductConfig.ai_enabled` | bool false default tới khi DEC-16 gate đạt; kill switch off được ngay | Off giữ nháp, manual compose/help mở; in-flight output không auto apply | P3 | App + operator |
| CFG-I11 `ProductConfig.ai_provider_id` | enum server approved registry, null default | Không raw URL/model arbitrary/secret; switch có compatible policy consent | P3 | App chọn approved; provider mới coder/console |
| CFG-I12 `ProductConfig.ai_timeout_seconds` | int 1..30 default 30 target; safe envelope phải duyệt | Future requests; expired giữ nháp, không auto retry | P3 | App giảm trong envelope |
| CFG-I13 `ProductConfig.ai_max_input_chars` | int 1..4000 default 4000 target, envelope approved | Reject quá dài với hướng dẫn, không cắt ý im lặng | P3 | App trong envelope |
| CFG-I14 `ProductConfig.ai_actor_concurrency` | int 1 read-only baseline DSA | Không mở concurrency từ UI để bypass quota | P3 | Coder theo nhiệm vụ benchmark riêng |
| CFG-I15 `ProductConfig.ai_actor_daily_quota` | int0..approved max; null default ->AI off, zero nghĩa off | Atomic shared quota, no unlimited; không chặn manual/help | P3 | App trong envelope approved |
| CFG-I16 `ProductConfig.ai_global_cost_limit` | decimal tiền đơn vị rõ >=0 <=approved ceiling; null ->AI off | Kill switch khi hết quota; không gọi provider trong DB lock | P3 | App giảm/đổi trong ceiling; billing console |
| CFG-I17 `ProviderRegistry.endpoint_secret` | server allowlist endpoint/secret reference, không field write/read admin | Không nhập Python/SQL/JS/prompt executable; không display key | P6 | Coder/console secret manager |

## J. Vận hành và quyền riêng tư

Người quản lý: CAP-19/20/21/22, scope theo CAP. Màn hình dự kiến: Vận hành > Health/Tác vụ/Quyền riêng tư/Audit.

| ID / source.field | Kiểu / default / validation | Hiệu lực và tác động hiện tại | Version/preview/rollback/audit | Thầy / coder / hạ tầng |
| --- | --- | --- | --- | --- |
| CFG-J01 `Operations.health_summary` | read-only service status/time/error category; unknown default | UI chỉ status, không connection string/DB credentials | P6 | App đọc sau monitor đã code |
| CFG-J02 `Operations.quota_summary` | read-only aggregate usage/window/provider ID; unknown default | Scope/threshold/privacy-safe, no prompt/actor content | P6 | App đọc; ceiling console/approved config |
| CFG-J03 `PrivacyCase.assigned_handler_id` | UUID CAP-20 đúng scope; null default | Explicit assignment case, không mở dữ liệu body | P5 | App |
| CFG-J04 `DeletionRequest.scope` | allowlist typed categories do verified actor chọn; required | Handler không đổi thành xóa rộng hơn, retention DEC-12 | P5 | User action; App theo case |
| CFG-J05 `DeletionRequest.status` | requested/verified/processing/completed/rejected/failed_needs_action; requested default | Service guards/evidence, no success trước xóa/ledger ghi | P5 | App case; tác vụ nền coder initial |
| CFG-J06 `PrivacyCase.outcome_notice` | template approved+status refs <=1000; default bản duyệt | Chỉ result người yêu cầu; không log secret hay hứa xóa tuyệt đối | P3 | App + owner privacy |
| CFG-J07 `AuditEvent.filter_range` | read filter UTC start/end max31d đề xuất; page20..50 | Scoped redacted audit, export lô <=50 đề xuất | P6 | App đọc sau code |
| CFG-J08 `AuditEvent.retention_policy_id` | approved immutable policy ref, null -> OPEN | Không admin xóa dấu vết; audit scope limited | P6 | Owner privacy + console/operator |
| CFG-J09 `BackupPolicy.schedule_retention` | approved cadence/days/encryption/region/RPO/RTO; null OPEN | No DB download UI, encrypted backup scoped operators | P6 | Console MySQL/storage + operator |
| CFG-J10 `RestoreJob.backup_ref` | allowlist backup metadata ref; null; integrity/schema verified | Restore staging -> ledger replay -> ACL/help checks -> release gate | P6 | Console/runbook + CAP-22 authorize |
| CFG-J11 `DeletionRevocationLedger.checkpoint` | immutable sequence/hash/external protected copy; read-only | Reapply newer deletes/revokes/consent/account before serve | P6 | Operator; append service only |
| CFG-J12 `Operations.billing_recovery_owner` | unit-owned console account refs/contact metadata; null OPEN | No card/secret in repo/UI; quota/renewal handover checklist | P6 | Thầy qua console dịch vụ |

## Tác động module tắt

AI off: không khởi tạo request mới, cancel/ignore response stale, giữ original/working text, vẫn manual/send/help. Survey off: chặn nộp mới, giữ bản đã nộp và quyền withdrawal/xóa theo policy, report chỉ nếu consent/plan còn hợp lệ. Program off: chặn enrollment/run mới, giữ history/pin safe, private tools/help vẫn dùng. Appointment off/không staff: không nhận request mới; pending/confirmed thông báo rõ và xử lý qua assigned operator, vẫn danh bạ gọi hợp lệ. Cards off: giữ snapshot tin cũ, manual compose nếu module đó đã code. Inbox mới off vì sự cố cần hạn chế send rõ lý do, không mở private fallback, nghe/help độc lập; xử lý privacy/xóa không bị khóa bởi flag nội dung. Journal/mood off không xóa data, giữ đường privacy và công cụ thay thế theo thiết kế. Module chưa có feature flag không được UI giả toggle. Không bật lại flags từ backup trước replay safety/ledger.

## Giới hạn chỉnh sửa

Thêm kind/renderer/answer type/capability mới, đổi schema/thuật toán scoring/DSA limits ngoài envelope/provider endpoint/stack/phạm vi nghiên cứu cần coder và quyết định scope. GitHub/Render/MySQL/Zalo/billing/secret rotation là console/runbook, không promise Mini App tự vận hành hạ tầng. Bulk/step-up/concurrency áp lifecycle. Field mới phải bổ sung CFG ID, source/manager/screen/type/default/bounds/impact/policy/tests; schema/source manifest sẽ được chốt trong US-004, không settings free-for-all.

## Fields dùng chung và các lựa chọn cố định

Fields title/body/instructions/audience/scope/revision/status/approval/reason áp cùng schema source khi kind tương ứng: CFG-A10/A12 và bounds P1 cũng áp card/quick reply/prompt/guidance của B/C/D, không tạo key tự do. Registry kind phải chốt US-004 gồm các content kinds được nêu trong catalog; thêm kind/widget là coder task riêng. Role preset không phải field tự nhập wildcard: preset version/roles nhỏ theo CAP allowlist, edit authority vẫn từng grant. ASSIGNED_RESOURCE scope cần explicit kind/ref và scope trường nếu tài nguyên thuộc trường; không thay assignment guard của AppointmentRequest hoặc PrivacyCase.

Nhu cầu của listening signal gồm trò chuyện/ở bên/hẹn trao đổi theo F10, lựa chọn nghiệp vụ đã chốt F10; enum serializer cần chốt US-004 trong contract gửi; user tự chọn, không auto đặt lịch hoặc chuyển tin. Admin sửa wording/hướng dẫn/xưng hô qua content sources B/D và CFG-A12 khi kind phù hợp; muốn thêm loại nhu cầu phải schema/US-004 review, không free executable config. Semantic palette/accessibility thresholds cố định ở UI/brand contract; token thường đổi dùng BrandRelease, không rải hex tùy component. Read-only computed health/audit filters không persisted generic settings; checklist fields console là inventory/runbook boundary, không UI hứa sửa infrastructure.
