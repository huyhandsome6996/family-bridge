---
name: family-bridge-workflow
description: "Thiết kế, triển khai hoặc review nghiệp vụ Family Bridge: F01..F15, state/revision, chia sẻ riêng tư, admin sâu, nội dung/cấu hình, nghiên cứu và bàn giao. Dùng khi sửa flows, schema/API, quyền, gửi tin/AI/pause, chương trình, hỗ trợ, khảo sát hoặc vận hành; không thay mandatory DSA/security/UI."
---

# Family Bridge Workflow

## Đọc hợp đồng trước nhiệm vụ

Đọc [AGENTS](../../../AGENTS.md), [scope](../../../docs/project-scope.md), [WF rules](../../../docs/engineering/workflow-rules.md), [decision register](../../../docs/product/decision-register.md), [user flows](../../../docs/product/user-flows.md), [states](../../../docs/product/workflow-state-machines.md), [access matrix](../../../docs/product/access-sharing-matrix.md), [acceptance/mapping](../../../docs/product/workflow-acceptance.md). Sau đó chọn phần liên quan ở [four-week flow](../../../docs/product/four-week-flow.md), [ERD](../../../docs/data/erd.md), [API](../../../docs/contracts/api-foundation.md), [backlog snapshot](../../../docs/project/backlog-snapshot.json); đọc US và tiền nhiệm trước implementation. Trên resumed task chỉ đọc lại file đã đổi.

Với admin/nội dung/config/nghiên cứu/vận hành, đọc [capabilities](../../../docs/product/admin-capabilities.md), [field catalog](../../../docs/product/admin-configuration-catalog.md), [lifecycle](../../../docs/product/content-lifecycle.md), [handover](../../../docs/operations/admin-handover.md), [brand](../../../docs/design/brand-identity.md). Một workflow skill dùng chung, không tạo bản admin trùng hợp đồng.

DSA và security vẫn mandatory theo AGENTS; UI task phải đọc family-bridge-ui và UI rules, chỉ đọc Taste upstream trước khi áp dụng phần liên quan. Experimental Taste v2 không đổi React/Vite/zmp stack, quyền/private flows hoặc thêm dependency/marketing checklist. Không tự suy đặc tính platform/provider; cần verify chính nguồn hiện hành khi task yêu cầu.

## Quy trình thực hiện

1. **Xác định hợp đồng:** CHỐT/ĐỀ XUẤT/OPEN/implemented khác nhau. Docs không chứng minh runtime. Gắn F/US/FL/AF/WF/CAP/CFG/test ID đang tồn tại, không tạo US live giả; DEC-22 yêu cầu Task/schema review trước code deep admin.
2. **Xác định actor/state/config:** principal, audience, scope SYSTEM/SCHOOL/ASSIGNED_RESOURCE, current revision/generation, preconditions, entity refs, typed config source/default/bounds/effective policy. Field thường ngày dùng nguồn catalog, không hardcode nhiều component/backend. Unknown key/type/default unsafe failclosed.
3. **Kiểm tra quyền:** current backend cap+scope+TTL, object/property/grant từng item/recipient/revision/generation; check trước read/page/count/export/write. `is_staff`, superuser/client flag không bypass; System Administrator được cấp rõ toàn bộ named management caps vẫn không private/raw research/admin impersonation. Chỉ staff assigned đọc note hẹn.
4. **Đối chiếu FL ↔ states ↔ ERD/API ↔ acceptance:** ghi transitions/guards/error/unknown outcome, transaction/unique/idempotency, stale/clock/offline/revoke/cache. Không gọi AI/network trong lock. Không sửa schema/API ngoài scope được giao.
5. **Giữ invariants:** private journal/AI/mood; preview + recipient + explicit send; pause tự chọn300 server, hết giờ draft, help ngay; bilateral connection/agreement cùng revision; survey/program tự nguyện; no auto-forward/send; no diagnosis/action thay gia đình; bounded resources/minimal redacted audit. Không hồi sinh deleted/revoked access khi reconnect/rollback/restore.
6. **Admin sâu cụ thể:** role nhỏ/cap/scope/TTL, final-admin/self-elevation guards; draft/preview/review/published/retired/archive, expected revision, pin version, one-person review+publish steps có audit đúng sự thật. Expert/legal approval vẫn thật. Rollback release mới revalidate contact/contrast/policy; flags chỉ code đã có; secrets/endpoint registry trên server, không eval settings. Phân biệt app/console/coder; upload ngoài MVP.
7. **Làm đúng scope và kiểm thử:** docs-only chỉ docs/rules/skills/minimal checker, không runtime/dependency/migration/deploy. Khi code được giao, chạy WT/AT liên quan cả negative/race/stale/revoke/resume/bounds; MySQL và Zalo device evidence đúng môi trường, không suy từ SQLite/browser. Suppression policy/retention/provider/ownership OPEN phải ghi gate, không tự bịa giá trị an toàn.
8. **Báo evidence:** commit, files, commands/env/input giả, expected/actual, limits và OPEN. Chạy `python scripts/check_agent_docs.py`, `git diff --check`; checker không security/runtime certification. Không mark US Done/SEC VERIFIED từ docs. Docs-only theo direct-main với expected SHA khi đã được user/repo cho phép; không merge PR ứng dụng khác/force-push/bypass protections.

## Tự kiểm trước bàn giao

Dùng acceptance matrix để tìm flow/config bị bỏ sót; teacher không viết code phải đổi được nội dung thường ngày theo catalog khi admin thật đã triển khai. Nếu thiếu UI/asset/provider/console owner, ghi blocked/not verified; screenshot/video cần UI thật. Không chép secrets vào docs hoặc báo cáo. Preview/review không phát hành ngầm; offline không auto-submit/send/accept. Nhóm nhỏ không cần hai người thường trực để publish, nhưng bước review độc lập với edit và chuyên môn được duyệt đúng người.

Nếu hợp đồng mâu thuẫn, giữ invariant privacy/help hiện hành, nêu ID/điểm mâu thuẫn và quyết định cần chốt trước implementation; tiếp tục phần độc lập. Không lấy code nhánh chưa duyệt, không mở rộng quyền admin hiện có hoặc nghiên cứu chỉ để thỏa tài liệu.
