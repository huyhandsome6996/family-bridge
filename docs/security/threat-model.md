# Mô hình đe dọa Family Bridge

Bản thiết kế 10/10/2026; cập nhật khi thay auth, storage, quyền, AI/provider, trường, export hoặc deployment. Các rủi ro là giả thuyết cần xử lý, không khẳng định có lỗ hổng đã khai thác.

## Tài sản và ranh giới

Tài sản: danh tính Zalo/binding, session/keys, kết nối/consent, nhật ký/mood/nháp AI, message đã duyệt, lịch hẹn, survey raw/mapping, báo cáo tổng hợp, public danh bạ, backup và release artifact.

```mermaid
flowchart TD
  A["Người dùng / thiết bị Zalo"] -->|Credential và API qua HTTPS| B["Django API: xác thực, quyền và giới hạn"]
  Z["Zalo identity provider"] -->|Kết quả xác minh| B
  B -->|FK, constraints, dữ liệu tối thiểu| C["MySQL và backup cách ly"]
  B -->|Chỉ text chủ động yêu cầu| D["AI provider bên ngoài"]
  E["Admin/staff theo scope"] -->|Capability, không quyền đọc toàn bộ| B
  F["GitHub / build pipeline"] -->|Artifact gắn commit; secrets tách| G["Render / runtime"]
  G --> B
```

Client/role flags/timestamp/IDs/user text/AI output/third-party response không tin cậy. Network nội bộ không tự chứng minh actor được phép. Server/operator và AI provider có xử lý kỹ thuật; không có E2EE được triển khai. Backup là một ranh giới quyền/retention riêng, không bản sao tùy ý.

## Actor và abuse cases

| Actor / điểm vào | Rủi ro cụ thể | Kiểm soát |
| --- | --- | --- |
| Người lạ / login và invite | Giả Zalo ID, dò mã, enumeration, replay | SEC-01/02/06/14 |
| Người đã kết nối | Đọc mọi journal/mood, giữ grant sau unlink, ép gửi/đổi người nhận | SEC-03/05/07/08/15 |
| Người dùng khác | Đổi object/recipient/school ID để truy cập chéo | SEC-03/04/05 |
| Người dùng gửi nội dung độc hại | Stored XSS, SQL/command injection, Unicode/big body, URLs | SEC-11/12/13/14 |
| Staff/admin phạm vi hạn chế | Nâng quyền, xuất raw surveys, xem tâm sự trường khác | SEC-04/05/22/23/26 |
| Client bị can thiệp hoặc account bị chiếm | Lộ token, stale session, send retry/double submit | SEC-02/07/10/15 |
| Bot / API/AI | Spam invite/thư/hẹn, vét quota AI, làm đầy DB/worker | SEC-06/14/15/16 |
| Prompt/AI provider | Lộ original/PII, đổi ý, trả HTML, auto-action | SEC-05/12/16/17/18 |
| Dependency/CI compromise | Build cài code độc, artifact thay đổi, lấy secret | SEC-19/25/26 |
| Cấu hình cloud / DB | Public MySQL, proxy spoofing, DEBUG, secret health/log | SEC-09/19/20/27 |
| Research export | Pseudonym bị join lại, nhóm nhỏ/diff inference | SEC-23 |
| Hỏng DB/provider/runtime | Mất dữ liệu, restore quyền đã thu hồi, trợ giúp bị chặn | SEC-18/21/24/27/28 |

## Rủi ro cần ưu tiên

P0 trước thử dữ liệu thật: xác thực/binding, object/property/admin ACL, token/secret handling, consent/sharing, no-auto-send, quota/resource controls, log minimization và backup/restore/delete policy. P1 trước phát hành rộng: threat review provider/SDK, suppression/report/export, hardened pipeline/monitoring, abuse/incident drills. Đây là thứ tự triển khai, không miễn P1 nếu pilot đã dùng tính năng tương ứng.

Không đưa private nội dung vào telemetry, analytics, crash screenshots hoặc notification preview. Số điện thoại/giờ contact phải đúng và được đồng ý; content/admin compromise có thể hướng học sinh đến đầu mối giả, nên publish cần kiểm soát tương đương code release.

## Giới hạn và quyết định còn mở

Không chống hoàn toàn thiết bị root, screenshot, tài khoản Zalo bị chiếm hoặc operator/provider độc hại. Phải giảm dữ liệu/đặc quyền và mô tả thật cho người dùng. Chốt refresh/step-up cơ chế Zalo, retention/provider processing, tin lịch sử sau unlink, ngưỡng báo cáo, quy trình trường và budget/rate limit trước kiểm thử tính năng tương ứng. Không triển khai biometric/device attestation/pinning trong JS nếu Zalo platform không hỗ trợ; dùng MASVS để đánh giá phần mình kiểm soát.

## Ranh giới quản trị sâu và nội dung/configuration

[Admin](../product/admin-capabilities.md), [catalog](../product/admin-configuration-catalog.md), [lifecycle](../product/content-lifecycle.md), [access](../product/access-sharing-matrix.md) và [WF](../engineering/workflow-rules.md) bổ sung attack surfaces thiết kế; control register chưa được nâng status. Những màn hình mới chưa tồn tại, tests sau implementation phải kiểm tra trực tiếp backend.

| Điểm vào / abuse | Kiểm soát bắt buộc / expected test |
| --- | --- |
| SYSTEM preset đổi mở quyền cũ, school=null hoặc client/superuser bypass | Explicit named cap+scope+TTL, no automatic widening, no private/raw-data capability, delegation bounds; AT-04-02 |
| Hai owner revoke/khóa nhau hoặc grant TTL hết khiến mất admin cuối | Guard record/transaction và owner recovery độc lập đã kiểm tra; monitor TTL, không gia hạn ngầm; AT-04-03; DEC-14/18 |
| Editor tự sửa sau review, dùng stale receipt, publish lặp | Bind snapshot/revision/hash, invalidate review, expected pointer/idempotency/unique; same person review/publish allowed nhưng bước riêng + honest audit; AT-01-03 |
| Contact giả/expired quay lại từ rollback; config màu che help | Verified consent/review_due/live safety recheck và contrast preview, rollback revalidate current refs; WT-17-02, AT-01-02, AT-02-03 |
| Settings Python/SQL/JS/free URL/provider endpoint hoặc secrets lấy qua UI | Typed allowlist, no eval/fetch, provider registry server, secrets outside UI, immutable help/pause/autosend; AT-05-03 |
| Staff/SYS bulk tự assign để đọc tâm sự | Metadata-only dispatcher, assignment qualified/purpose/reason/current scope, monitoring abuse, no bulk autoassignment; WT-18-02, AT-02-03 |
| Aggregate small-group/differencing hoặc k bị hạ | Approved floor/complementary suppression/query/export policy, never raw/mapping path including SYS; DEC-15 gate, AT-03-02/03 |
| Audit/ops dump body; restore backup hồi sinh deletion/roles/consent | Minimal logs/data projection, no full DB button, restricted encrypted console backup và latest durable ledger before serving; AT-06-01/02/03 |
| Logo upload disguised executable/oversize/URL SSRF/metadata tracking | Ngoài MVP DEC-21; chỉ approved asset registry hiện tại. Nếu được mở riêng: magic+decode/reencode/strip metadata/quarantine/scoped random keys/type-size-pixel bounds/no SVG HTML JS URL fetch và permissions xử lý rõ theo brand threat model; SEC-30, AT-05-03 |

Step-up phải supported bởi session/provider thực, không fake UI confirmation. Same actor publish không miễn legal/expert approval. Operations permission không bằng quyền đọc raw dữ liệu gia đình; console operator technical access không được gọi E2EE. Đơn vị sở hữu accounts/billing/recovery, coder role hạn chế/TTL; không secrets trong sổ bàn giao public. Gate retention/suppression/provider/ownership/staff chưa chốt phải failclosed các actions tương ứng, help/manual không bị trì hoãn.
