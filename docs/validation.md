# Bằng chứng kiểm tra nền tảng

Bằng chứng ngày 10/10/2026 phía dưới được thu ở các commit 7c9a770/48f44c8 của nhánh feat/us-003-kt01 và CI của PR #1. Không suy thành kiểm thử runtime trên main: ngày 11/10/2026 chỉ bộ tài liệu/skill và công cụ kiểm tra tài liệu được đưa vào main.

Ngày 10/10/2026. Đây là kiểm tra khung kỹ thuật, không phải nghiệm thu 15 tính năng nghiệp vụ.

| Kiểm tra | Kết quả |
| --- | --- |
| Đồ thị 52 US Trello | Không thiếu tiền nhiệm, không chu trình, đúng tầng; kế tiếp trực tiếp khớp |
| Django check và migration drift | Không lỗi; không có migration chưa tạo |
| Backend tests trên SQLite | 6 test đạt: health, readiness, DB lỗi không lộ nội dung, API mặc định yêu cầu auth, CORS, không có login giả |
| API client tests | 5 test đạt: thiếu cấu hình, HTTPS, bearer header, không lộ body lỗi/không retry POST, timeout |
| HTTP thực tế giữa client và Django local | `/health/` và `/ready/` trả OK; client gọi backend thật thành công |
| Mini App production build | Đạt với Vite 8; kiểm tra app-config và các file CSS/JS được tham chiếu |
| Production configuration | Từ chối thiếu secret và từ chối SQLite trong production |
| MySQL | Đã cấu hình CI migration/test với MySQL 8.4; chưa chạy MySQL tại workspace do không có DB server/native toolchain |
| Docker/Render/Zalo thật | Chưa triển khai hoặc kiểm thử; cần bằng chứng trước Done US-003 |

## Thư viện frontend

Template ban đầu báo 53 dependency advisories (11 high, 42 moderate). Cập nhật build Vite/React plugin và bỏ tooling CSS không dùng giảm còn **8 advisories** (4 high, 4 moderate), theo `npm audit` tại thời điểm kiểm tra. Các mục còn lại nằm trong cây phụ thuộc zmp-sdk/zmp-ui: Babel CLI/chokidar/braces, Sentry và React Router. Đây là cảnh báo dependency, chưa phải bằng chứng khai thác được trong bundle hoặc ứng dụng này.

Không dùng audit fix force để hạ SDK về bản cũ hoặc áp major override chưa được Zalo UI xác nhận. Cần đánh giá reachability/bản vá tương thích SDK/UI trước phát hành; không coi PR nền tảng là bản production đã đạt audit bảo mật. Phần tạo app-config được viết trong cấu hình Vite để dùng build hiện có qua CLI Zalo; cần xác minh nạp asset trên điện thoại thật.

GitHub Actions được cấu hình cho backend SQLite, MySQL và Mini App. Kết quả local không thay thế trạng thái workflow remote; xem tab Actions/PR để biết trạng thái chạy thực tế.


## Bộ hướng dẫn agent, DSA, luồng và bảo mật (10/10/2026)

- Hai skill family-bridge-dsa và family-bridge-security: quick_validate.py đạt.
- python scripts/check_agent_docs.py đạt; ba negative cases (rule wiring mất, link hỏng, VERIFIED không evidence) được thử trên bản sao tạm và phát hiện đúng.
- Mermaid 11.12.1 parse thành công 9 sơ đồ (5 ERD, 3 flow/state chương trình, 1 trust boundary). Đây là syntax check, không render QA hoặc model/migration validation.
- Forward-test chỉ đọc: dùng hai skill thiết kế inbox/export, không thay code hoặc gọi dịch vụ. Đã làm rõ cursor vs pagination nền tảng, reconnect generation, cohort school/program scope và form/participation mapping.
- Register baseline: 21 NOT_IMPLEMENTED, 8 PARTIAL, 1 NOT_APPLICABLE_WITH_REASON; không có control VERIFIED. Retention, unlink history, provider handling, suppression/report release và các quyết định nghiên cứu vẫn cần nghiệm thu ở US liên quan.
- CI bổ sung agent-docs; workflow run mới phải kiểm tra sau push. Kiểm tra cấu trúc không chứng nhận privacy/security, và không thay MySQL/device/production tests.
- Không có business code mới, không migration, deploy Render, scan production hoặc thử exploit hệ thống bên thứ ba trong tác vụ tài liệu này.


## Đưa hướng dẫn vào main (11/10/2026)

Chuyển riêng tài liệu/skill/rules và checker, không chuyển backend/React/dependencies/Render. main có workflow Agent documentation checks độc lập; kết quả runtime cũ thuộc PR #1. Quy ước đẩy tài liệu trực tiếp main được ghi trong AGENTS.md và agent-guide.md. Chạy document checker, hai skill validators và diff check trước commit; không cần chạy lại benchmark hay các bài kiểm thử app khi không thay app.

## Workflow toàn bộ và quản trị sâu — đợt tài liệu

Baseline đối chiếu main: cbc40a402d2fcdaeb8be7f0eed3910299148dce8 (PR #2 Taste đã merge theo review/chỉ dẫn riêng; PR #1 ứng dụng vẫn không merge). Đọc scope, four-week flow, ERD, API, admin, DSA/security/UI và snapshot 52 US; dùng worktree riêng giữ checkout cũ sạch. Đợt này chỉ docs/rules/skill/checker, runtime complexity/query/device/provider/DB N/A vì không code nghiệp vụ; không dependency/lockfile/migration/backend/deploy hoặc nâng US/control status.

- `python scripts/check_agent_docs.py`: PASS. Files/relative links/frontmatter/invocation/wiring/checksum MIT unchanged; 20 FL, 6 AF, 22 CAP, 24 WF, 23 DEC, 120 CFG unique sources, 60 WT+18 AT expected cases; đủ F01..F15 và US tồn tại snapshot. Checker là structural check, không chứng minh mỗi field có UI hoặc guard backend.
- `git diff --check`: PASS. Thay đổi chỉ thuộc các path được giao; security control-register/backlog snapshot và Taste vendor files giữ nguyên bytes. Config fields/schemas/API bổ sung là đề xuất DEC-22, chưa migration/endpoint.
- Skill creator `quick_validate.py`: PASS các repo skills DSA/security/UI/workflow và Taste; workflow `agents/openai.yaml` có default prompt gọi đúng `$family-bridge-workflow`. Repo entry points có thể tìm/đọc skill, không cài global hoặc xác nhận tất cả IDE tự áp dụng.
- Negative tests trên copy tạm: **10/10 phát hiện đúng** — missing workflow doc, broken skill link, wrong frontmatter name, missing invocation, unwired adapter, duplicate WF, thiếu F mapping, unknown compact US, thiếu CAP→test, vendor checksum tamper. Fixture restore về baseline PASS mỗi lần; không sửa dữ liệu thật/credential hoặc vendor gốc.
- Mermaid **11.12.1 parse 16/16 PASS** bằng tooling có sẵn ngoài repo (Node24.19 + jsdom), không thêm dependencies vào app. Bao gồm 5 ERD, 3 sơ đồ four-week, 1 trust boundary, 1 lifecycle, 6 workflow diagrams. **Chưa render/QA bố cục Mermaid**, chưa validation schema/migration từ ERD.
- Solid sRGB contrast tính local: #713D32/#FFF4E8=8.01:1, #713D32/#E4AB56=4.25:1, #FFF4E8/#C65B43=3.89:1, functional #FFF4E8/#A84733=5.36:1, #0F172A/#E4AB56=8.72:1. Brand gốc giữ, functional pair riêng; không dùng brand-primary/accent pair dưới4.5 cho body. Đây không evidence render/device/overlay accessibility.
- Forward-test read-only workflow skill với tình huống teacher vận hành một mình: trả đúng clone/preview/review/publish, scope/TTL, no private/raw data, no forwarding sau 5 phút, revoke final-admin guard và console restore latest ledger. Supplemental scan 98 local links không broken. Đã xử lý scope enum ASSIGNED_RESOURCE và câu chữ acceptance dễ hiểu; không có mutation/network/app tests từ trial. Sample response không đảm bảo mọi agent tuân thủ.

Chưa kiểm chứng: UI/admin/backend thật, MySQL locks/index/query budgets/slot races, Zalo Android/iOS/auth step-up/call/cache, provider consent/quotas, suppression/differencing algorithm, retention/deletion/restore drill, console ownership/recovery/billing, staff thực tế, pháp lý/chuyên môn/consent trẻ vị thành niên, logo mẫu03 nguồn và handover screenshot/video. Runtime WT/AT giữ NOT_RUN; register SEC không được đổi VERIFIED và snapshot US không đổi Done. Chốt DEC-12..23 theo gate trước pilot tương ứng; AI/report/appointment failclosed khi thiếu điều kiện, manual/help luôn có đường. CI remote của commit đợt này kiểm tra sau push, không suy từ local PASS.
