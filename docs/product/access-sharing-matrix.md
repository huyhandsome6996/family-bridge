# Ma trận vai trò, capability, scope và quyền dữ liệu

Hợp đồng thiết kế, chưa endpoint. [CAP register](admin-capabilities.md) là danh sách quyền chính thức; [ERD](../data/erd.md) định nghĩa owner/recipient/grants/generation. Deny mặc định; không suy quyền từ UUID, UI, school_id null, is_staff hoặc System Administrator.

## Role x capability x scope x data access

| Role | Capability set / scope | Được đọc | Bị từ chối mặc định |
| --- | --- | --- | --- |
| R-SYS | CAP-01..22; SYSTEM được cấp rõ | Public/draft quản trị, metadata tối thiểu, aggregate đã policy, audit sạch; request note chỉ khi assigned và CAP-10 | Toàn bộ tâm sự/private/raw survey/mapping; credential/DB dump |
| R-CONTENT | CAP-01/02/03; SCHOOL hoặc SYSTEM được cấp | Draft/published public content, diff/review | Journal/mood/AI/messages/progress cá nhân/survey |
| R-DIRECTORY | CAP-07/08/09; SCHOOL hoặc SYSTEM | Contact consent/verified metadata và assignment IDs tối thiểu | request_note nếu chưa giao; nội dung gia đình |
| R-STAFF | CAP-10; SCHOOL + assigned_request | Request note người học gửi đúng mình, hẹn của mình | Request khác, private journal/AI, message không tới mình |
| R-RESEARCH | CAP-11/12/13; SCHOOL/cohort hoặc SYSTEM | Form/cohort design, report có suppression | Raw response/free text, participation user/key mapping, private mood |
| R-OPS | CAP-19/20/21/22; assigned case + scope | Health/task/error code, deletion refs, audit sạch | UI private-body viewer, secret/backup download |
| STUDENT/CAREGIVER owner | Auth + ownership, không admin capability | Journal/mood/draft/AI/note run của mình | Nội dung private actor khác |
| Family recipient | Active connection + generation, grant item/revision khi cần | Lời đã duyệt gửi mình; item đang chia sẻ đúng revision | AI original/suggestion, cả sổ, note riêng của người kia |
| Public/unauthenticated | Public published fallback | Help contacts và hướng dẫn tối thiểu hợp lệ | Mọi private/public-draft/member-specific dữ liệu |

Một actor có nhiều vai trò nhưng context admin không 'OR is_superuser' vào ACL gia đình. Cap không tạo grant; school membership không tạo connection. Xuất báo cáo/lịch sử/danh sách có cùng scope/authorization như đọc; không mở rộng bởi CSV.

## Object / action matrix

| Entity / nội dung | Read | Create/update/delete | Share/revoke / điều kiện |
| --- | --- | --- | --- |
| ProviderIdentity / session | Server auth xử lý; actor chỉ session metadata cần thiết | Bind server verified; logout/revoke theo authority | Không admin impersonation hoặc xuất provider_subject/token |
| ConnectionInvite / Connection | Hai actor liên quan, metadata nhận biết tối thiểu | Actor claim/confirm/revoke; unique/TTL/khác actor | Active sau hai xác nhận; backup cũng cùng quy tắc; no admin accept |
| MoodEntry | Owner; recipient qua MoodShare current | Owner, revision; sửa invalidate grant | Một mood/recipient/revision/generation; revoke chặn read mới |
| JournalPage | Owner; recipient qua JournalShare current | Owner; prompt admin là template, không page | Một page/recipient/revision; không mặc định cả sổ |
| PrivateDraft / AIReframe | Owner + dịch vụ kỹ thuật tối thiểu theo policy | Owner request/edit/delete; provider result đúng input_revision | Không share draft/original/suggestion hoặc reverse link từ message |
| Message | Sender theo policy; recipient active/current generation | Explicit send snapshot approved_body; recipient read receipt; immutable body | No arbitrary edit/delete by admin; unlink history OPEN DEC-13 fail-closed |
| ActivityRun / RunParticipant | Public instructions; own progress/note; chung data đã duyệt | Actor chọn tham gia/confirm phần mình | Run chung đúng hai actor; private_note không chung |
| AgreementRevision / Acceptance | Hai bên active, không admin | Owner propose immutable revision; mỗi signer tự accept | Hai signer cùng revision; sửa cần revision mới; không dùng để cấp journal grant |
| ContentRevision / ProgramVersion | Published audience đủ điều kiện hoặc scoped admin draft | CAP-01/02/03 với lifecycle; policy caps cho consent | Enrollment pin; references chặn hard-delete |
| ConsentRecord | Actor và privacy service tối thiểu theo nhiệm vụ | Actor explicit accept/withdraw version | Policy edit không tự tạo acceptance; purpose riêng |
| SupportContact | Published consented/verified/current; admin scoped | CAP-07/08; số mới reverify | Public fallback loại staff IDs/nội bộ; hết hạn tạm ngừng |
| AppointmentRequest.request_note | Requester + assigned staff/handler rõ, đúng scope | Requester và assigned staff theo state | Reassign metadata không tự đọc; thông báo user, revoke old handler |
| SurveyResponse/Answer / mapping | Actor xem phần own theo policy; research processing service tách | Actor draft/submit/withdraw; version pin | Không admin raw API, no public free text, aggregate suppression |
| RoleAssignment / account metadata | CAP-14/16 scoped; actor xem own assigned info tối thiểu | Authority cấp/thu hồi, fresh step-up, final-admin guard | Explicit SYSTEM vs SCHOOL; scope/TTL/session recheck |
| ProductConfig / BrandRelease | Public safe snapshot allowlist; admin revision trong scope | CAP-06/17/18 typed publish | Secret/endpoint/security floor không config free-text |
| DeletionRequest / Ledger / AuditEvent | Assigned handler refs/outcomes, audit scoped | Verified requester/case workflow; immutable outcomes/append-only corrections | Restore replay; no private body để chứng minh xóa |

## Thu hồi và cache

Recheck grant/connection/generation/role/account trước mỗi sensitive action; lọc DB trước pagination/aggregation. Grant mismatch revision không trả body cũ/mới; reply context cũng qua grant. Unlink trong transaction thu hồi shares, chặn send/run/agreement mới; UI clear preview/cache sau notification/refresh và không đọc từ stale cache khi chưa xác minh. Logout/actor switch xóa state riêng và hủy in-flight requests; response actor cũ không ghi vào actor mới. Không persist private drafts vào storage công khai. Không hứa thu hồi screenshot ngoài app.

## Operator và dữ liệu kỹ thuật

Operator hạ tầng có thể có đặc quyền kỹ thuật DB/backup cần quản lý riêng: assignment least privilege, audit, encryption, no routine private browsing, approval/evidence cho recovery. Đây không phải E2EE hoặc admin UI đọc tâm sự. Provider AI xử lý minimal text khi actor chủ động theo policy; nghiên cứu service mapping không expose admin. Thời hạn/chính sách còn OPEN ở [decisions](decision-register.md).
