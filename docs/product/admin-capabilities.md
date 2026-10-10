# Quản trị sâu và giới hạn dữ liệu Family Bridge

Yêu cầu chốt trong đợt workflow/admin: đủ công cụ quản trị nội dung/cấu hình thường ngày để bàn giao cho thầy không cần sửa code. Đây là thiết kế trong Zalo Mini App, **chưa triển khai**. Không có tài khoản/role được cấp tự động từ tài liệu này. Dùng [catalog](admin-configuration-catalog.md), [lifecycle](content-lifecycle.md), [access matrix](access-sharing-matrix.md), [flows](user-flows.md), [bàn giao](../operations/admin-handover.md) làm hợp đồng thống nhất.

Mục lục: [vai trò](#vai-trò), [capabilities](#capabilities), [màn hình](#màn-hình-và-phạm-vi), [authorization](#quy-trình-quyền-và-audit), [giới hạn](#giới-hạn-không-bypass), [backlog](#backlog-và-trạng-thái).

## Vai trò

| ID / vai trò | Nhiệm vụ / cấp quyền rõ | Không được suy ra |
| --- | --- | --- |
| R-SYS System Administrator / Quản trị hệ thống | Toàn bộ CAP-01..22 phù hợp scope SYSTEM, có người sở hữu/phê duyệt bootstrap; assignment ghi explicit SYSTEM | Không raw survey, private journal/AI/inbox/mood; CAP-10 vẫn cần được giao request; CAP-22 không tự có secret/console |
| R-CONTENT Biên tập và phát hành nội dung | CAP-01/02/03; có thể tách editor chỉ CAP-01, publisher CAP-02/03; scope SCHOOL hoặc SYSTEM cho thư viện chung | Không phát hành khi thiếu validations/attestation; không sửa dữ liệu gia đình |
| R-DIRECTORY Quản lý danh bạ hỗ trợ | CAP-07/08/09 đúng school; thư viện global cần SYSTEM | Không mặc định xem request_note hoặc call history riêng |
| R-STAFF Người tiếp nhận lịch hẹn | CAP-10, scope school và request được phân công, staff nhận vai trò thực | Không xem tất cả request cùng trường, nhật ký hay survey |
| R-RESEARCH Phụ trách nghiên cứu | CAP-11/12/13, cohort nằm scope được giao | Không raw answer/free text/mapping, không giảm suppression floor |
| R-OPS Vận hành kỹ thuật/quyền riêng tư | CAP-19/20/21/22 theo nhiệm vụ; phân tách operator console và case handler khi cần | Không nút DB dump; privilege hạ tầng quản lý riêng, không ngụy trang thành UI đọc tâm sự |

Các CAP-04/05/06/14/15/16/17/18 có thể phân công riêng cho người phụ trách nội dung pháp lý, nhận diện, quyền hoặc cấu hình, hoặc gắn role bổ sung được duyệt. Role là preset capability allowlist, không string wildcard 'admin:*'. Một người nhận nhiều role được union capabilities nhưng mỗi request vẫn theo đối tượng/phạm vi thực. Không suy scope từ school_id=null: SYSTEM là giá trị được cấp rõ và có authority; SCHOOL phải có school_id. Record review actor có thể trùng author khi nhóm nhỏ; màn review/action/timestamp/reason vẫn riêng. Người không có CAP-02 không được publish chỉ vì là editor.

## Capabilities

| ID | Key / hành động | Scope + dữ liệu được phép | Gate và test |
| --- | --- | --- | --- |
| CAP-01 | content.edit | Draft/public content scoped: program, topic, activity, card, reply, journal prompt, agreement template, guides | Expected revision, bounds, draft delete chỉ chưa tham chiếu; AT-01-01/03 |
| CAP-02 | content.publish | Đúng snapshot draft đã preview/review trong scope | Đủ 4 tuần/references, chuyên môn đã duyệt khi cần, explicit publish; AT-01-01 |
| CAP-03 | content.retire | Published content trong scope; release rollback từ clone | Không xóa lịch sử/pin, kiểm tra dependency và contacts; AT-01-02 |
| CAP-04 | policy.edit | Draft policy/consent, public processing copy | Không nhận consent thay actor; attestation nguồn/phạm vi; AT-01-02 |
| CAP-05 | policy.publish | Version policy đã có phê duyệt chuyên môn/pháp lý được ghi nhận | Step-up, diff/impact/new consent plan; WT-01-03 |
| CAP-06 | brand.manage | Tokens/approved asset ID trong scope; SYSTEM cho brand toàn dự án | Contrast/preview/release rollback; không upload tùy ý; AT-01-01 |
| CAP-07 | directory.manage | Đầu mối/giờ/consent/verification scoped | Không ghi bằng chứng consent chứa PII vào repo/log public; AT-02-01 |
| CAP-08 | directory.publish | Kích hoạt/tạm ngừng mục hợp lệ trong scope | Consent/verified/review_due còn hạn; AT-02-02/03 |
| CAP-09 | appointment.assign | Metadata trạng thái, staff/slot, request ID tối thiểu scoped | Staff thật/role hợp lệ, log bàn giao; không đọc note tự động; AT-02-01 |
| CAP-10 | appointment.handle | Request được giao rõ cho actor, nội dung người học chủ động gửi | Assigned + school match + active role, slot lock; WT-18-02/03 |
| CAP-11 | research.design | Draft cohort/form/question/answer type/scoring policy được duyệt | Không trộn version/phạm vi mới; AT-03-01 |
| CAP-12 | research.publish | Slot trước/sau và form version trong cohort được giao | Plan/suppression đã chốt, reference bất biến; AT-03-01/03 |
| CAP-13 | research.aggregate | Chỉ aggregate/report/export đã suppression trong scope | Consent/cohort/version và differencing, no raw path; AT-03-02/03 |
| CAP-14 | identity.metadata | Internal user ref, tên hiển thị cần thiết, account state, assignments school | Không Zalo subject/phone/mood/family graph/raw survey mặc định; AT-04-02 |
| CAP-15 | identity.restrict | Lock/unlock theo căn cứ và quy trình đã duyệt | Step-up, reason, revoke sessions, final-admin guard; AT-04-03 |
| CAP-16 | role.manage | Invite/assign/revoke named cap + scope + TTL thuộc authority người cấp | No escalation/cross-school; không tự cấp SYSTEM; AT-04-02/03 |
| CAP-17 | product.configure | Typed flags/reminder/timezone/common settings trong catalog | Implemented module registry; help luôn enabled; AT-05-01/02 |
| CAP-18 | ai.configure | AI kill switch/approved provider ID/quotas trong safety envelope | No endpoint/key UI; bounded quotas, manual fallback; AT-05-02/03 |
| CAP-19 | operations.monitor | Health/error codes/quota/task metadata đã khử nhạy cảm scoped | Không private body/token/provider prompt; AT-06-01/03 |
| CAP-20 | privacy.case | Verified deletion/revoke case status + target refs tối thiểu theo phân công | Không mở nội dung để xử lý xóa hoặc xóa thay chưa xác minh; AT-06-01 |
| CAP-21 | audit.read | Audit actor/time/action/object ref/outcome/reason scoped đã redaction | No secret/raw body, export bounded; AT-06-03 |
| CAP-22 | recovery.authorize | Approve recovery/restore/change operator request và evidence refs | Console role tách, step-up/recovery verification, ledger replay trước phục vụ; AT-06-02 |

## Màn hình và phạm vi

| Màn hình dự kiến | Ai / tác vụ | Tác động luồng người dùng |
| --- | --- | --- |
| Tổng quan | SYS/OPS, health và aggregate an toàn | Không danh sách mood, xếp hạng gia đình/drill-down nhận diện |
| Giáo trình > Phiên bản > Tuần | CONTENT/SYS, clone/sửa mục tiêu, thứ tự, audience, hướng dẫn/bài học/sổ giấy | FL-12..15 pin version, nội dung mới chỉ enrollment/revision mới |
| Thẻ > Nhóm / Phản hồi / Xưng hô | CONTENT/SYS, CRUD draft, reorder, publish/retire | FL-08/11, không gửi thay hoặc thay snapshot đã gửi |
| Nhật ký / Mẫu thỏa ước | CONTENT/SYS, prompt/template | FL-06/07/15, không sửa trang riêng/cam kết đã ký |
| Giới thiệu / FAQ / Onboarding / Chính sách | CONTENT hoặc policy caps | FL-01/17/19, bản policy mới yêu cầu đồng ý thích hợp, không tự accept |
| Nhận diện > Xem trước | SYS hoặc CAP-06 | UI mọi FL/AF, brand khác semantic states; help luôn đọc/bấm được |
| Danh bạ / Staff / Lịch tiếp nhận | DIRECTORY/SYS, CRUD verified, assign metadata | FL-17/18, đổi số revalidate, tạm ngừng không hứa lịch/call thành công |
| Yêu cầu được giao | STAFF/CAP-10 được phân công | FL-18, người học và staff xem note; người phân công không mặc định đọc |
| Khảo sát / Cohort / Báo cáo | RESEARCH/SYS | FL-19, frozen response schema, suppression không bypass |
| Tài khoản / Vai trò / Khôi phục | SYS/CAP-14..16/22 | FL-01/20, revoke có hiệu lực server; không tự đăng nhập/consent thay |
| Cấu hình / AI / Module | SYS/CAP-17/18 | Flags chỉ phần đã code; AI off vẫn giữ nháp/manual/help; pause cố định |
| Vận hành / Quyền riêng tư / Audit | OPS/SYS theo assignment | FL-20, restore ledger; không tải DB chứa tâm sự |

## Quy trình quyền và audit

1. Xác thực Zalo/server session -> active account -> named capability -> scope -> object/property permission -> state/revision guard. Check ở list/detail/search/export/write và bulk; UI giấu nút không thay server.
2. Action cấp quyền/SYSTEM, lock/unlock, publish policy, quota/provider, restore hoặc bulk destructive cần fresh step-up đúng cơ chế DEC-14. Sau challenge phải kiểm tra lại session, quyền và payload/revision gắn với challenge, không cache vô hạn.
3. Ghi transaction và audit atomically cho writes quyền/nội dung/config; audit action, actor ref, scope, target ref/revision, request ref/idempotency hash, reason, UTC time, outcome. Public content diff được phép; private bodies, mã mời, tokens, raw survey không ghi. Log denied dùng metadata tối thiểu, không enumerate người khác.
4. Cấp SYSTEM đầu tiên qua bootstrap có owner đơn vị được xác minh bởi operator ngoài app; không signup tự chọn admin. Mời admin là invitation separate (không ConnectionInvite gia đình), người nhận xác minh account/accept role. Không tự nâng toàn bộ assignment cũ khi đổi preset: review explicit migration kế hoạch ở tác vụ code riêng.
5. Cấp quyền không vượt capability/scope/delegation authority của người cấp; SCHOOL không cấp SYSTEM. Đổi role của chính mình không nâng authority. Lock/revoke đồng thời phải khóa guard record và đếm quản trị hệ thống active chưa hết hạn, gồm pending TTL expiration; ngăn mất người cuối cùng do thao tác hoặc lịch TTL. Giám sát trước TTL hết và owner recovery, không tự gia hạn trái phép.
6. Khi mất admin cuối vì sự cố ngoài app, fail-closed và dùng unit-owned recovery procedure, không endpoint public backdoor. Bootstrap/recovery có evidence xác minh, revoke session cũ và audit; không impersonate gia đình.
7. Khi revoke phân công staff, note mất quyền ngay; nếu chuyển handler, có reason/assigned recipient policy và thông báo người học, không cấp lại vì 'cùng trường'. Draft/publish concurrency theo [lifecycle](content-lifecycle.md).

## Giới hạn không bypass

System Administrator quản trị toàn hệ thống nhưng không đọc raw survey/mapping/private journal/AI/mood/thư vì vai trò đó. Người có admin đồng thời là recipient/owner được truy cập theo quyền gia đình tách biệt, không qua endpoint admin. Django superuser/is_staff chỉ là cờ kỹ thuật nếu tồn tại, không nghiệp vụ. Secret/provider endpoints/DB console đặc quyền được quản lý ngoài admin UI. Không diagnose, gửi/xác nhận connection/agreement/consent/completion thay người dùng; không thay số tuần/pause hoặc bật gửi hàng loạt ngoài scope.

## Backlog và trạng thái

Mapping hiện có: US-014 quyền/admin access, US-020 lifecycle, US-024 nội dung/danh bạ, US-025 survey/AI, US-041 bàn giao thao tác; US-004 typed schemas/API; US-018 recovery/backup. Chi tiết mới về phân quyền/brand/config/recovery là yêu cầu thiết kế cần bổ sung Task/AC và ước lượng cho các US liên quan; không giả vờ backlog live đã chỉnh hoặc các endpoint đã có. Xem [acceptance](workflow-acceptance.md) và [decision register](decision-register.md). Tài liệu không certify security hoặc hoàn thành admin.
