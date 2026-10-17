# Hợp đồng nền tảng API

Các endpoint được ghi “hiện có” thuộc khung code trong PR #1/nhánh feat/us-003-kt01. Ngày đưa tài liệu vào main 11/10/2026 chỉ tài liệu được chuyển; main chưa có backend nghiệp vụ hoặc endpoint nền tảng này.

Đây là hợp đồng các endpoint đã triển khai cùng quy tắc đề xuất cho US-004. Chưa phải OpenAPI hoàn chỉnh cho 15 tính năng; các nhánh nghiệp vụ phải chốt schema cụ thể trước tích hợp.

## Endpoint hiện có

| Method | Path | Quyền | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/health/` | Public | 200 `{"status":"ok"}`; chỉ chứng minh process trả lời |
| GET | `/api/v1/ready/` | Public | 200 `{"status":"ok"}` khi SELECT 1 thành công; 503 `{"status":"unavailable"}` khi DB lỗi |

Response kiểm tra không chứa tên DB, password hoặc lỗi kết nối. Các endpoint trên không chứng minh schema migration hoặc tính năng nghiệp vụ đã chạy.

## Endpoint F16 — đăng nhập lớp HS/PH và đề xuất kết nối (bổ sung 16/10/2026)

Triển khai trên main (`packages/family_bridge_features/f16_classroom`), tái sử dụng Session/Invite của F01; chi tiết schema trong `openapi.yaml` (đoạn path `x-owner-feature: F16`).

| Method | Path | Quyền | Response chính |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/class-session` | Public | 200 `{token, token_type:"Bearer", expires_at, user:{id, display_name, role, class_ref}, consents_required}`; 401 generic giống hệt cho mã sai/không tồn tại/tài khoản vô hiệu; 429 khi guard DB 10 fail/15ph hoặc throttle `class_login` 200/hour |
| GET | `/api/v1/auth/class-capabilities` | Public | 200 `{login_methods:{local_class, zalo}, settings:{change_password, change_code, change_display_name}, policy:{no_forced_password_change}}`; `zalo=false` khi `FB_ZALO_LOGIN_ENABLED` tắt hoặc thiếu creds (fail closed) |
| POST | `/api/v1/auth/class-password` | Bearer | 200 `{changed:true, sessions_revoked_other:N}` — thu hồi phiên khác, giữ phiên hiện tại |
| POST | `/api/v1/auth/class-code` | Bearer | 200 `{login_code:"HSxxx", changed:true}` — chuẩn hóa UPPERCASE, yêu cầu re-auth |
| POST | `/api/v1/auth/class-display-name` | Bearer | 200 `{display_name, identity_basis:"self_declared"}` |
| GET | `/api/v1/classroom/proposals` | Bearer | 200 `{results:[{proposal_id,status,my_role,my_confirmed,counterpart_confirmed,counterpart,created_at,updated_at,revision}], next_cursor}` — chỉ proposal của chính mình |
| POST | `/api/v1/classroom/proposals/{id}/confirm` | Bearer | 200 `{proposal_id,status,my_confirmed:true,connection:null\|{connection_id,status,relationship_kind,generation}}`; bước 2 chạy pre-check + InviteService trong một transaction |
| POST | `/api/v1/classroom/proposals/{id}/decline` | Bearer | 200 payload proposal; `{reason:"refused"\|"wrong_pair"}` bắt buộc |
| POST | `/api/v1/classroom/proposals/{id}/cancel` | Bearer | 200 payload proposal; một trong hai bên, khi còn mở |

Lỗi riêng của F16 (trong envelope chuẩn): `proposal_blocked_by_open_invite` (400 — người xác nhận 2 còn lời mời classic primary đang mở, KHÔNG bị hủy hộ), `already_connected` (400 — cặp đã có Connection active), `proposal_not_found` (404 — không thuộc proposal, không leak), `proposal_not_confirmable`/`proposal_not_open` (400), `reauth_failed` (403), `weak_password`/`same_password`/`same_code`/`duplicate_code` (400), `too_many_attempts` (429 — guard DB). Khi `FB_ZALO_LOGIN_ENABLED=false`, `POST /api/v1/auth/session` (Zalo của F01) bị middleware trả 503 `module_unavailable/zalo_login_disabled` — không sửa f01.

## Endpoint F16-A — cấp phát cặp HS/PH do quản trị (bổ sung 18/10/2026 — DEC-24/CAP-23)

Tất cả endpoint yêu cầu Bearer + grant `classroom.provision` CÒN HIỆU LỰC với scope lọc THẬT: grant `global` mở mọi lớp, grant `school` chỉ khớp `class_ref` chính xác. Thiếu grant → 404 như bề mặt admin_core (`not_found`, không phân biệt). Mọi thao tác ghi kèm `batch_ref` (UUID do client tạo) — gửi lại cùng `batch_ref` trả kết quả ĐÃ LƯU (idempotent, không nhân đôi).

| Method | Path | Quyền | Response chính |
| --- | --- | --- | --- |
| GET | `/api/v1/classroom/admin/classes` | Bearer + CAP-23 | 200 `{results:[{class_ref, students, caregivers, pending_proposals}]}` trong phạm vi scope |
| POST | `/api/v1/classroom/admin/pairs-preview` | Bearer + CAP-23 | 200 `{ok, dry_run:true, summary, rows:[{row, caregiver_code, student_code, status, problems}]}` — CHỈ ĐỌC, không ghi kể cả khi thiếu mật khẩu khởi tạo |
| POST | `/api/v1/classroom/admin/pairs-apply` | Bearer + CAP-23 | 200 `{ok, wrote, batch_id, connected, already_active, reconnected, errors, rows}` — Connection ACTIVE ngay với `source=admin_provisioned`, `source_admin`, `source_batch`; validate toàn bộ trước, lỗi → không ghi gì |
| GET | `/api/v1/classroom/admin/backfill-inventory` | Bearer + CAP-23 | 200 `{accounts, proposals:{eligible_pending, blocked}, already_active_pairs, eligible_pairs, blocked_pairs}` |
| POST | `/api/v1/classroom/admin/backfill-apply` | Bearer + CAP-23 | 200 `{ok, activated, already_active, blocked, errors, rows}` — chuyển cặp đang chờ (proposal mở, cả hai tài khoản active) thành Connection ACTIVE; cặp revoked KHÔNG tự hồi sinh |

Lỗi riêng (envelope chuẩn): `class_out_of_scope` (403 — grant school không khớp class_ref), `invalid_batch_ref`/`invalid_class_ref` (400), `too_many_rows` (400 — tối đa 50 hàng/lần), `initial_password_required_for_new_accounts` (per-row preview/apply — chỉ cần khi tạo tài khoản mới), `pair_revoked_reconnect_requires_allow_reconnect` (per-row — kết nối lại cần tick chủ ý, tạo generation mới). Trạng thái hàng: `will_connect`, `will_create_accounts_and_connect`, `pair_already_active`, `pending_proposal_will_close_and_connect`, `pair_revoked`, `pair_revoked_reconnectable`, `error` (preview) / `connected`, `already_active`, `reconnected`, `error` (apply). Mật khẩu khởi tạo không bao giờ xuất hiện trong response/summary/audit.

## Quy tắc chung

1. HTTPS; JSON; route version `/api/v1/`; UUID định danh tài khoản và đối tượng nội bộ. Zalo IDs giữ kiểu chuỗi, không chuyển sang Number ở JavaScript.
2. Mặc định APIView yêu cầu bearer JWT của Family Bridge và IsAuthenticated; từng API vẫn phải thêm quyền theo đối tượng. Không dùng cookie để xác thực Mini App.
3. Lỗi DRF chuẩn: `{"error":{"code":"...","details":{...}}}`. Không trả stack trace, prompt AI hoặc dữ liệu riêng của đối tượng không có quyền. Lỗi ngoài DRF chưa được chuẩn hóa trong khung này.
4. Khung hiện tại dùng phân trang chuẩn DRF (`count`, `next`, `previous`, `results`), mặc định 20 bản ghi; chưa có list nghiệp vụ. Với inbox/mood/journal tăng dần, US-004/US sở hữu phải chốt cursor envelope (`next`, `previous`, `results`, không COUNT toàn bộ mỗi trang), thứ tự ổn định và tối đa 50 trước triển khai. Đây là đề xuất DSA, chưa thay cơ chế runtime hiện tại. Client không tự chuyển next URL tùy ý kèm token.
5. Giờ lưu UTC với USE_TZ; trả ISO 8601. Hiển thị múi giờ Việt Nam. Mốc cooldown do server quyết định.
6. US-021 phải bổ sung khóa idempotency và unique constraint trước khi gửi thẻ/tin/tín hiệu. Hai lần gửi do mạng yếu phải trả cùng message; không tự retry POST ở client hiện tại.
7. Payload gửi tin chỉ có người nhận/conversation, loại công khai được allowlist, nội dung cuối và idempotency key. `text/card/signal` trong phác thảo ban đầu là tên nhóm, chưa là enum đã triển khai. US-004 chốt mapping: `text -> text`, `card -> emotion_card`, `signal -> listening_signal`; reply/quick_reply cần schema riêng tương ứng ERD. Không nhận `is_staff`, owner tùy ý hoặc câu gốc AI.
8. US-030 phải có thao tác lưu nháp và thao tác xác nhận gửi riêng; không gửi bằng sự kiện timer kết thúc, app resume hoặc cron.
9. US-012/023 kiểm tra quyền lại ở mỗi lần đọc/gửi, không coi token hợp lệ là quyền đọc mọi dữ liệu.
10. US-004 lập OpenAPI cho auth, connection, share grant, send và content trước các nhánh phụ thuộc; mọi thay đổi phá hợp đồng phải được rà soát chung.

## Hợp đồng workflow/admin sâu cần chốt (US-004 / DEC-22)

[Flows](../product/user-flows.md), [state guards](../product/workflow-state-machines.md), [catalog](../product/admin-configuration-catalog.md), [capabilities](../product/admin-capabilities.md), [WF](../engineering/workflow-rules.md) và [ERD mở rộng](../data/erd.md) là input OpenAPI, không route đã có trên main. Tên action dưới đây là **đề xuất**, đường dẫn/method/enum cụ thể phải US-004 review trước code. Không thêm API demo giả để làm tài liệu có vẻ triển khai.

| Action đề xuất | Principal, object guard và capability | Request / response contract cần chốt |
| --- | --- | --- |
| draft.create / clone / edit / delete | CAP-01/04/06/11 theo kind và scope; draft không referenced mới delete | source_ref/typed fields/expected_revision/reason/operation key; response target ref/revision/state. Không clone user responses/consent/grants |
| content.preview / review | Quyền đọc draft đúng scope + cap review phù hợp, snapshot current revision | audience/display mode; safe preview render không side effects. Review receipt bind revision+content hash+validation+approval refs; edits invalidate receipt |
| release.publish / retire / rollback | CAP-02/03/05/06/12; correct review snapshot, references, expert approval, step-up nhạy cảm | expected_target_revision + expected_effective_revision + review_receipt + idempotency_key + reason; trả immutable release ref/version/effect. Rollback clone+validate+publish new release |
| config.read / revise / publish / safety_off | CAP-17/18, typed key allowlist và approved range/implemented-module registry | Source schema catalog, default/effective snapshot+revision; unknown keys/type400, stale409; help/pause/autosend immutable. No secret/URL/code output/input |
| directory.revise / verify / publish / suspend | CAP-07/08 scoped; consent/verified/current review_due | Safe contact fields + evidence refs + expected_revision; public response approved fields/timezone/status only. Suspend live safety immediate invalidation/audit |
| appointment.assign / handle / reschedule | CAP-09 metadata only; CAP-10 assigned active staff; requester self confirm current time | Assigned staff ref + UTC interval/display timezone + current revision; handling DTO private note chỉ authorized parties, overlap 409, changed time cần requester accept |
| role.invite / grant / revoke / account.restrict / recover | CAP-14/15/16/22 and delegation authority/final-admin guard/step-up | Named caps/scope_type/scope_ref/TTL/reason; invitation hash backend không trả credential logs, current revision; no owner/provider_subject/is_staff/superuser/consent payload |
| survey.publish / cohort.bind / aggregate.export | CAP-11/12/13 current scope, immutable referenced forms, plan policy gate | Typed form/version/phase/audience; aggregate filter allowlist/version+suppression receipt+bounded cursor; no raw/mapping route, export invalid nếu consent/policy thay đổi |
| privacy.case / audit.list / operations.status / restore.authorize | CAP-19/20/21/22 scoped/assigned + current state | Sanitized metadata only, bounded window/page, case outcome thật/ledger checkpoint/reference. Restore execution console/operator separate, không DB payload/button |
| family.send / grant / accept / revoke | Owner/recipient/bilateral auth theo FL, admin caps không thay quyền gia đình | Revision/recipient/generation/preview binding/idempotency payload hash; no original AI; listening need là conversation/being_present/arrange_chat đề xuất enum US-004 cho lựa chọn F10, không auto-book; receipt/body authorized only; help signal không cooldown |
| operation.status | Actor sở hữu operation hoặc operator cap+scope tối thiểu | Lookup key/ref có TTL/retention được chốt; sent/published/failed/pending/not_found an toàn; không enumerate key/global body hoặc đổi key retry khi unknown |

### Payload patterns và lỗi (đề xuất)

Mutation envelope có `expected_revision`, `idempotency_key`, `reason` khi admin, fields typed theo action; preview/send binding không chỉ client boolean. Backend có thể dùng signed receipt hoặc server preview record, phải chốt expiry/binding/revision/generation trong US-004. Same key cùng hash trả receipt hiện có sau auth hiện tại; khác hash409. Không trả receipt/body cũ sau revoke chỉ vì key đúng. Requests absent required reason/approval/recipient/schema bị reject, không mutate partial ngoài action contract. Bulk max/count đề xuất DEC-17, preview target IDs/scope/effect và item outcomes; không cap bypass bằng batch.

Lỗi stable machine code cần OpenAPI: `revision_conflict`409, `preview_stale`409, `duplicate_key_payload_mismatch`409, `slot_unavailable`409; `cooldown_active` với server deadline không block help; `consent_required` chỉ purpose hiện hành; `policy_not_approved`/`report_policy_unset`/`module_unavailable`; `not_authorized`, `input_invalid`, `rate_limited`, `temporarily_unavailable`. Denied objects không leak name/body/count;404/403 phải quyết định nhất quán.429/503 không tự POST retry/send; UI giữ draft và action retry explicit; unknown outcome cần status lookup. Public health chỉ process, readiness DB reachability, không ownership/privacy/slot assurance.

Cohort timezone/audience/phase từ server reference, không client đổi research scope. Public config snapshot đã lọc, scope/revision cache keys và failclosed permission config; TTL cần chốt không infinite. Kill switch/grant/role/consent live recheck độc lập pinned content. Notifications ngoài app US-019 riêng, scheduler không auto-send khi cooldown. All contracts phải gắn WT/AT và MySQL/current SDK evidence khi code có; docs-only không chạy requests vào người thật.
