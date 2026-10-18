# Quy tắc workflow Family Bridge

MUST bắt buộc; SHOULD chỉ được bỏ khi có lý do và evidence trong PR. Định dạng/ràng buộc là hợp đồng thiết kế, chưa runtime. Đọc [scope](../project-scope.md), [flows](../product/user-flows.md), [states](../product/workflow-state-machines.md), [access](../product/access-sharing-matrix.md), [catalog](../product/admin-configuration-catalog.md), [acceptance](../product/workflow-acceptance.md), [decisions](../product/decision-register.md), [DSA](dsa-rules.md), [security](../security/security-rules.md), [UI](ui-rules.md) trước thay đổi liên quan.

## Rules có ID ổn định

| ID | Mức / quy tắc | Mapping | Cách kiểm chứng |
| --- | --- | --- | --- |
| WF-01 | MUST xác minh principal/session server và binding đúng App ID; không tin actor/role client | FL-01; SEC-01/02/05 | WT-01-02; credential giả/sai app/actor bị chặn |
| WF-02 | MUST default-deny mỗi action/object/property, capability + scope + TTL còn hiệu lực | Tất cả FL/AF; SEC-03/04 | AT-04-02, WT-05-02; gọi direct API khác trường |
| WF-03 | MUST giữ private journal/AI/mood chưa chia sẻ owner-only; không admin-read override | FL-04..09/19/20; SEC-05/08/23 | WT-06-02, WT-09-02, AT-03-02 |
| WF-04 | MUST grant đúng một item/recipient/revision/current generation, revoke mọi đường đọc | FL-05/07/20; SEC-08 | WT-05-02/03, WT-07-03 |
| WF-05 | MUST chọn recipient, preview nội dung cuối và explicit send; đổi payload mất preview | FL-08/11/16; SEC-07 | WT-08-02/03, WT-11-02 |
| WF-06 | MUST pause 300 giây server nếu đã chọn; không auto-send/forward từ timer/AI/retry/resume | FL-09/10/16; DSA-11, SEC-07/17 | WT-10-02/03, WT-16-02 |
| WF-07 | MUST help/listening không qua cooldown; fallback public đã duyệt khi auth/API lỗi | FL-16/17, AF-05/06; SEC-18/24 | WT-17-02, AT-05-02 |
| WF-08 | MUST hai actor tự xác nhận connection/agreement; không admin ký/thao tác thay | FL-02/03/15; SEC-06/15 | WT-02-02, WT-15-02 |
| WF-09 | MUST chương trình 4 tuần và hoạt động/survey tự nguyện, không khóa tuần/streak coercion | FL-12..14/19; DEC-02/08 | WT-12-02, WT-19-02 |
| WF-10 | MUST AI backend-only, minimal text, thông báo xử lý, schema/output không tin; không original trong message | FL-09; SEC-12/16/17/18 | WT-09-01/02/03 |
| WF-11 | MUST current state/revision guards, transaction/unique/idempotency và khóa nhất quán; không network trong lock | FL-02/08/14/15/18, AF-01/04; DSA-08 | WT-08-03, WT-18-03, AT-01-03 |
| WF-12 | MUST bound list/text/cache/poll/retry/export; quyền trước phân trang; không scan toàn history | Tất cả; DSA-01..14 | WT-04-03, AT-06-03; Q20/Q50/EXPLAIN khi có code |
| WF-13 | MUST raw survey/mapping không admin API; report đúng cohort/consent/version với suppression/differencing | FL-19, AF-03; SEC-23 | WT-19-03, AT-03-02/03 |
| WF-14 | MUST admin là named capabilities, System Administrator cấp rõ, không is_staff/superuser bypass | AF-04; DEC-05 | AT-04-02; flags không mở dữ liệu/cross-scope |
| WF-15 | MUST Draft/Preview/Review/Published/Retired/Archived, reference bất biến, preview gần UI, pin version | AF-01, FL-12/13; SEC-24 | AT-01-01/02/03 |
| WF-16 | MUST config/content thường đổi có nguồn typed/allowlist/default/bounds/effective policy; không hardcode rải rác | Catalog A..J; US-004/020/025 | AT-05-01/03; kiểm tra schema/publish mapping |
| WF-17 | MUST consent version mới không tự accept; giữ ledger/rút lại và phê duyệt chuyên môn thật | FL-01/19, AF-01; SEC-16/23 | WT-01-03, AT-01-02 |
| WF-18 | MUST admin directory verify/consent/review_due; hẹn chỉ staff được giao, khóa slot; retirement không bị rollback mù | FL-17/18, AF-02; SEC-24 | WT-18-02/03, AT-02-02/03 |
| WF-19 | MUST feature flags chỉ module đã code; off bảo toàn dữ liệu/nháp và alternatives, không tắt help | AF-05; DEC-08/16 | AT-05-02; AI off vẫn viết tay |
| WF-20 | MUST step-up action nhạy cảm, audit tối thiểu, chống khóa admin cuối, recovery có owner | AF-04/06; SEC-04/22/28 | AT-04-03, AT-06-02 |
| WF-21 | MUST rollback release mới, revalidate contacts/policies/grants/users/deletion; không xóa lịch sử | AF-01/02/06; SEC-21/24 | AT-01-02, AT-06-02 |
| WF-22 | MUST no code/SQL/JS execution/URL fetch/secrets từ settings UI, asset upload ngoài MVP | AF-01/05; SEC-11/13/19/30 | AT-05-03; malformed config/remote URL denied |
| WF-23 | MUST docs/status/evidence chính xác; không claim implemented/Done/VERIFIED từ checker | Tất cả; DEC-11/22 | Review diff, metadata và môi trường kiểm tra |
| WF-24 | SHOULD preview small screen/large text/keyboard/reduced motion và giải thích admin impacts từng flow | UI + FL/AF; SEC-18 | WT-17-01, AT-01-01; Zalo Android/iOS evidence khi có UI |
| WF-25 | MUST ghép cặp lớp do quản trị cấp CHỈ qua named capability `classroom.provision` + scope lọc thật; tạo Connection ACTIVE trong một transaction (canonical pair, generation mới, provenance source=admin_provisioned); không auto-grant nội dung/consent; audit theo batch | FL-02 provisioned; DEC-24; SEC-04/06/15 | f16 test_admin_provision (A01–A12); AT-04-02 |

## Quy trình agent

1. Đọc hợp đồng và US/tiền nhiệm, phân biệt chốt/đề xuất/OPEN ở decision register.
2. Xác định actor, current state/revision, capability/scope/objects và nguồn config/content; dùng ID FL/AF/CFG/CAP/WF/WT/AT.
3. Đối chiếu flow/ERD/API và privacy matrix; không tự thêm field/endpoint/schema ngoài scope. Chốt US-004 trước migration ở tác vụ triển khai riêng.
4. Giữ invariants, ghi bounds/DSA/query/payload/concurrency/ACL. Luồng thường ngày phải từ catalog source, không chuỗi hardcode trong nhiều component/backend.
5. Triển khai đúng nhiệm vụ đã giao, chạy negative/concurrency/stale/offline/revoke và device checks phù hợp. Docs-only chạy checker/diff/skill validators, không bịa benchmark.
6. Báo commit, command, input giả/môi trường, expected/actual, còn OPEN/N/A. Chỉ update control status/US bằng evidence thực. Không đọc lại file không đổi nhiều lần.

## Nguồn cấu hình và hiệu lực

Catalog là nguồn hợp đồng duy nhất cho fields; enums/defaults/bounds đưa vào serializer/service và schema typed, không eval JSON hay generic writable settings table không allowlist. Chốt cấu trúc đề xuất ở ERD trước code. Backend trả public snapshot đã lọc và effective_revision; frontend dùng snapshot/default an toàn thống nhất. Network lỗi không tự dùng config cũ cấp quyền. Quyền/kill switch/contacts recheck server, policy pin không thay quyền hiện hành. Unknown key/type từ chối; write cần expected revision, reason, capability và audit, không tự silently clamp action nhạy cảm. CI/SDK không chịu trách nhiệm validate policy.
