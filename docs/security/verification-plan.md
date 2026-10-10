# Kế hoạch kiểm chứng và điều kiện phát hành

Tài liệu test được phép trong local/staging, dữ liệu giả. Chưa chạy các bài test nghiệp vụ dưới đây; endpoint chưa có ghi NOT_IMPLEMENTED. Không pentest/scan/load production hoặc dịch vụ người khác chỉ vì tài liệu mô tả được.

## Phạm vi và evidence

Mỗi đợt ghi commit, app/API domain, DB/version, Android/iOS/Zalo version, danh sách actor giả, người phụ trách, giới hạn tải và thời gian. Không có token/PII trong evidence. Evidence cần expected/actual và residual risk; test unit khác integration/device/config.

| Nhóm | Bài kiểm tra tối thiểu | SEC |
| --- | --- | --- |
| Auth/binding | Fake ID không login; expired/wrong-app/invalid credential; reuse/rebind; disabled/revoked session | 01/02 |
| Object ACL | A tạo riêng, B đã kết nối, C lạ: list/detail/search/export/update/delete đều đúng; revoked grant/connection | 03/08 |
| Roles/property ACL | Editor/staff/researcher khác scope gọi direct API; sửa owner/admin/status/read_at; response whitelist | 04/05 |
| Invite | TTL, self-connect, used code, claim cạnh tranh, guessing rate limit; hai lần xác nhận đúng actor | 06/14/15 |
| Send/draft/AI | Double submit, same key different payload, stale revision, 299/300 giây server, app resume, provider timeout | 07/15/16/17 |
| No-auto-send/help | Timer hết, background, retry, AI trả kết quả không message; help mở ngay khi đang cooldown/quota/auth lỗi | 07/18/24 |
| Input/output | Chuỗi giả có markup/injection giữ là dữ liệu; Unicode/oversized body; safe URLs; không raw HTML AI | 11/12/14 |
| SSRF/egress | Fake provider qua adapter local; denied destinations/redirects; không gửi request metadata thật | 13 |
| Concurrency MySQL | Revoke vs send, confirm invite vs expiry, sign agreement vs revision, double-book appointment | 15 |
| Confidentiality | Canary riêng không nằm recipient payload, bundle, notification, logs, CSV/cache; actor switch/logout clears | 05/08/10/16/22 |
| Surveys | Không consent/bỏ survey vẫn dùng app; small groups và differencing không lộ cá nhân; raw export bị từ chối | 23 |
| Config/runtime | DEBUG false, hosts/origin/proxy trust, TLS CA/hostname, DB least privilege/private; generic errors | 09/19/20/27 |
| Dependencies/CI | Audit Python/npm/container; advisory triage; PR fork không secret; artifact/source gắn commit | 25/26 |
| Backup/incident | Restore isolated, replay deletion/revoke, check help fallback; rotate/revoke tabletop | 21/28 |
| Inventory | Routes deployed so với contract, debug/admin/retired endpoints; webhook tests chỉ khi có | 29/30 |

Dùng MySQL cho race/constraints; SQLite không chứng minh semantics khóa. Boundary markers không cần exploit gây hại. Fuzz giới hạn input/cases, timeout; DoS resilience qua mô phỏng quota/worker limits trước, không tạo flood thật.

## Các bước kỹ thuật

1. Chạy các check hiện có phù hợp: Django check, migration drift, backend/client tests, production Mini App build và document checker.
2. Bổ sung negative authorization và transition tests theo feature, query count theo DSA, dùng fixtures giả; không tạo test chỉ để tăng coverage.
3. Trước deploy chạy manage.py check --deploy với production settings/secrets được cấu hình an toàn; review cảnh báo. Không khắc phục bằng hosts=* hoặc tắt middleware.
4. Dependency checks như pip-audit/npm audit và container scanner thực hiện ở sandbox không production secret. Quét không chứng minh toàn bộ sạch; ghi tool/version, kết quả, runtime reachability và fixes/exception.
5. SAST/secret scan/DAST (ví dụ OWASP ZAP) chỉ đưa vào pipeline sau cấu hình target/allowlist, redaction và review output. Không upload dữ liệu riêng hoặc tự đăng nhập production cho scanner.
6. Thử Zalo Android/iOS với nhiều tài khoản giả, HTTPS thực, CORS/preflight, storage/resume, help/call screen và logout. Browser simulator không thay thế bước này.
7. Restore rehearsal và incident tabletop có người phụ trách, lập evidence khử nhận diện.

## Gate trước dữ liệu thật / phát hành

- Feature sử dụng phải có auth/ACL/consent và negative tests đạt; endpoint chưa đạt không được bật cho pilot.
- Không còn known exploitable critical/high risk trong đường chạy dùng; advisory severity cần triage, không ignore mọi transitive hoặc force fix làm hỏng SDK. Rủi ro medium có owner, deadline và biện pháp phù hợp.
- Chốt retention/deletion/unlink/provider policy, verified help contacts, operator hẹn thực tế và thông báo riêng tư.
- Backup restore/deletion replay kiểm chứng; secrets/exposed token đã revoke, runtime/provider configs reviewed.
- Negative tests + MySQL integration + relevant device tests + deploy checks có evidence.
- Có rollback/sự cố, owner hỗ trợ và giới hạn pilot. Không dùng câu “OWASP certified”, “bảo mật tuyệt đối” hoặc “không hack được”.

Gate là yêu cầu nghiệm thu cho phiên bản đưa dùng, không một câu hỏi xin phép mới cho mỗi edit tài liệu. Trạng thái quản lý ở [control register](control-register.json).
