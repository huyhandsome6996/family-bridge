# Verification report — backend foundation US-003 (Agent 2-c, kiểm thử độc lập)

Người viết: **Independent Test & Review Agent (2-c)** — KHÔNG commit/push, KHÔNG sửa
file nào ngoài `backend/accounts/tests/**`, `backend/core/tests/**` và file này.
Code được kiểm chứng là kết quả của Agent 2-b trên nhánh
`feat/us-003-backend-foundation` (worktree `/home/z/my-project/fb-backend-wt`, gốc main `c2c285a`).

## 1. Phạm vi và môi trường

| Hạng mục | Giá trị |
| --- | --- |
| Phạm vi kiểm tra | Scaffold Django/DRF nền tảng: settings (LOGGING, throttle, guard production), `core.views` (health/ready/envelope), `accounts.User`, negative surface (không token/admin/zalo), throttle behavior, CORS allowlist, CI workflow + render.yaml + docs bàn giao (review read-only), dependency audit |
| OS | Linux (sandbox không root, không Docker, không MySQL server local) |
| Python | 3.12.15 (`/home/z/my-project/.venv-fb-backend`) |
| DB dùng để kiểm tra | **SQLite** (`DB_ENGINE=sqlite`, `DJANGO_ENV=test`) — theo quy ước AGENTS.md, SQLite chỉ là foundation check |
| MySQL | **KHÔNG có bằng chứng MySQL runtime trong đợt này**: không root → không cài MySQL server; `mysqlclient==2.2.8` không build được local (kiểm chứng trực tiếp: `pip download --only-binary :all:` → "No matching distribution found" — gói chỉ có sdist cho Linux). Bằng chứng MySQL duy nhất là **script** job `mysql-checks` (services mysql:8.4) trong CI — **chưa chạy được** vì nhánh chưa được lead push. Chỉ có bằng chứng cấu hình + CI script, KHÔNG có bằng chứng chạy trên MySQL |
| Test suite sở hữu của Agent 2-c | `backend/core/tests/` (9 file) + `backend/accounts/tests/test_user_model.py` — Agent 2-b không tạo file test nào (đối chiếu `git status`: đúng phạm vi) |

## 2. Ma trận kiểm tra

Kết quả suite: **`Ran 30 tests — OK (skipped=2)`** trên SQLite (2 skip có lý do tại mục 2.7). Suite chạy ổn định qua 2 lần liên tiếp.

### 2.1 Port từ kt01 (giữ nguyên logic test, theo yêu cầu)

| Mục kiểm tra | Lệnh/test | Kết quả | Bằng chứng (rút gọn) |
| --- | --- | --- | --- |
| Health public + payload + Cache-Control | `core.tests.test_health.test_health_is_public_without_exposing_configuration` (port verbatim) | PASS | 200, `{"status":"ok"}`, `Cache-Control: no-store` |
| Ready chạm DB thành công | `core.tests.test_ready.test_ready_checks_database` (port verbatim) | PASS | 200 |
| Ready 503 không leak khi DB lỗi (`OperationalError("password=secret")`) | `core.tests.test_ready.test_ready_failure_does_not_leak_database_error` (port verbatim) | PASS | 503, body `{"status":"unavailable"}` chính xác |
| Default-deny probe → 401 + envelope `not_authenticated` | `core.tests.test_default_deny.test_future_api_views_require_authentication_by_default` (port verbatim) | PASS | 401, `error.code == "not_authenticated"` |
| CORS allowlist override_settings | `core.tests.test_cors.test_cors_accepts_only_configured_origins` (port verbatim) | PASS | `https://h5.zdn.vn` → có header; `https://attacker.example` → không |
| POST `/api/v1/auth/zalo/` → 404 | `core.tests.test_default_deny.test_login_is_not_faked_by_accepting_client_identity` (port verbatim) | PASS | 404 |

Khác biệt API so với kt01: health/ready nay có `@throttle_classes([])` — không ảnh hưởng logic các test trên; hành vi miễn throttle được kiểm chứng riêng (mục 2.4).

### 2.2 Hợp đồng health/ready + shape

| Mục kiểm tra | Test | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| Payload không thừa field | `test_health_...` + `test_ready...` dùng so sánh dict chính xác `response.json() == {"status": "ok"}` | PASS | dict equality → không thể có field thừa |
| Health KHÔNG chạm DB | `test_health_performs_no_database_queries` | PASS | `assertNumQueries(0)` |
| Ready đúng 1 query | `test_ready_performs_exactly_one_database_query` | PASS | `assertNumQueries(1)` (SELECT 1) |
| Byte đo được | đo trực tiếp qua Django test client | — (số liệu) | health & ready đều 15 bytes: `{"status":"ok"}` |
| Chống leak dữ liệu nhạy cảm kể cả khi message lỗi có host/password | `test_ready_failure_logs_class_name_only_and_body_has_no_error_markers` (mock message chứa `mysql host "db-leak-host.internal:3306" password="leak-pass-xyz"`) | PASS | body 503 đúng hợp đồng; body không chứa `mysql/host/password/leak/3306`; log có đúng 1 record chỉ chứa tên class `OperationalError`, không chứa message |
| Log chỉ tên class ngoại lệ (SEC-22) | cùng test trên (`assertLogs("core.views")`) | PASS | `Readiness check failed: OperationalError` |

### 2.3 User model (accounts)

| Mục kiểm tra | Test | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| `AUTH_USER_MODEL == "accounts.User"` | `test_auth_user_model_points_to_accounts_user` | PASS | `get_user_model()` is `accounts.models.User` |
| UUID primary key (UUIDField, default `uuid4`) | `test_user_id_is_uuid_primary_key_with_uuid4_default` | PASS | field là `UUIDField`, `primary_key=True`, `default is uuid.uuid4` |
| ID sinh random uuid4, phân biệt | `test_created_users_get_random_uuid4_ids` | PASS | 2 user: UUID v4, id khác nhau |
| Tạo user + superuser | `test_create_user_and_superuser_work` | PASS | check_password đúng; superuser có `is_staff`+`is_superuser` |
| Username unique ở mức DB | `test_username_is_unique_at_database_level` | PASS | `IntegrityError` khi insert trùng (constraint DB, không chỉ form validation) |

### 2.4 Throttle (SEC-14) — behavior thật

| Mục kiểm tra | Test | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| Anon vượt rate → 429 + envelope `throttled` | `test_anon_requests_exceeding_default_rate_get_429` (61 request vào view AllowAny) | PASS | lượt 60 → 200, lượt 61 → 429, `error.code == "throttled"` |
| User xác thực vượt rate → 429 | `test_authenticated_requests_exceeding_default_rate_get_429` (121 request) | PASS | lượt 120 → 200, lượt 121 → 429 |
| Health/ready miễn throttle | `test_health_and_ready_stay_200_while_other_anon_requests_are_throttled` | PASS | cùng ident/cùng cửa sổ: view thường 429 trong khi health/ready vẫn 200 |
| Guard cấu trúc `@throttle_classes([])` | `test_health_and_ready_views_declare_no_throttle_classes` | PASS | `health.cls.throttle_classes == []` và tương tự readiness |

**Hạn chế kỹ thuật đã kiểm chứng (ghi rõ theo yêu cầu):** `override_settings(REST_FRAMEWORK={...rate thấp...})` **không** đổi được rate lúc runtime vì DRF gán `SimpleRateThrottle.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES` ngay lúc import module (rest_framework/throttling.py dòng 66 — thử thật: request thứ 3 vẫn 200 với rate override 2/min). Vì vậy behavior test chạy với **rate đã cấu hình thật** (anon 60/min, user 120/min) và đọc số limite từ settings để không vỡ khi US-004 siết số liệu. Đổi lại, test đo được hành vi production thật, không phải cấu hình bị vá trong test.

**Phát hiện quan trọng (cho US-004):** DRF `APIView.initial()` chạy `check_permissions` **trước** `check_throttles` (rest_framework/views.py dòng 424–426) → request anon bị 401 **không bao giờ chạm throttle**; hạn mức anon chỉ có tác dụng trên endpoint AllowAny/public. Không phải lỗi của 2-b (hành vi mặc định DRF), nhưng cần ghi nhận khi thiết kế rate-limit cho US-004+ (gateway/ingress vẫn là lớp chống DoS chính, đúng ghi chú trong security-rules.md).

### 2.5 Envelope lỗi + surface không được tồn tại

| Mục kiểm tra | Test | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| ValidationError → envelope hợp đồng mục 3 | `test_validation_error_uses_contract_envelope` | PASS | 400, `{"error":{"code":"invalid","details":{...}}}`, `Cache-Control: no-store` |
| DRF Http404 từ trong view → envelope | `test_drf_404_from_view_uses_contract_envelope` | PASS | 404, shape `error.code` (string, không rỗng) + `error.details` |
| POST `/api/v1/health/` → 405 qua envelope | `test_method_not_allowed_uses_contract_envelope` | PASS | 405, `error.code == "method_not_allowed"`, `no-store` |
| Path không tồn tại dưới `/api/v1/` | `test_unknown_api_path_is_plain_404_without_configuration_leak` | PASS | 404; không chứa `traceback/secret/password/settings.py/django.db` |

**Ghi nhận trung thực về 404:** đường không resolve được là **404 thuần của Django, KHÔNG đi qua envelope DRF** — khớp đúng câu của hợp đồng: *"Lỗi ngoài DRF chưa được chuẩn hóa trong khung này"*. Vì vậy test chỉ yêu cầu 404 + không leak cấu hình (không ép envelope). Envelope 404 thật được chứng minh trên DRF view raise `Http404`.

| Mục kiểm tra (negative) | Test | Kết quả |
| --- | --- | --- |
| Không endpoint phát hành token | `test_no_token_issuance_endpoint_exists`: `reverse("token_obtain_pair")` → `NoReverseMatch`; `POST /api/v1/token/`, `/api/v1/token/refresh/` → 404 | PASS |
| Không admin site | `test_admin_site_is_not_installed`: `GET /admin/`, `/admin/login/` → 404 | PASS |

### 2.6 Guard cấu hình production (subprocess thật, SEC-09/19/27)

Các test chạy `python manage.py check` trong **tiến trình con** (`cwd=backend`, `sys.executable`, env copy + strip + set `DJANGO_SETTINGS_MODULE=config.settings`), đúng luồng import settings như runtime; assert luôn rằng giá trị dummy secret/password **không xuất hiện** trong output.

| Mục kiểm tra | Test | Kết quả | Bằng chứng (rút gọn) |
| --- | --- | --- | --- |
| Production thiếu `DJANGO_SECRET_KEY` → fail closed | `test_production_without_secret_key_fails_closed` | PASS | exit ≠ 0; output chứa `DJANGO_SECRET_KEY is required` |
| Production secret 49 ký tự → fail closed | `test_production_short_secret_key_fails_closed` | PASS | exit ≠ 0; `at least 50 characters`; chuỗi dummy không bị echo |
| Production + `DB_ENGINE=sqlite` → fail closed | `test_production_sqlite_database_rejected` | PASS | exit ≠ 0; `Production requires MySQL` |
| Production + `ALLOWED_HOSTS="*"` → fail closed | `test_production_wildcard_allowed_hosts_rejected` | PASS | exit ≠ 0; `explicit DJANGO_ALLOWED_HOSTS`; không leak dummy |
| Production cấu hình dummy hợp lệ → `check` exit 0 | `test_production_valid_dummy_config_passes_check` | **SKIP local** (lý do dưới) | script khớp CI positive-guard |
| Production cấu hình dummy hợp lệ → `check --deploy` exit 0, chỉ WARNING | `test_production_check_deploy_passes_with_warnings_only` | **SKIP local** (lý do dưới) | script khớp CI positive-guard |

**Lý do SKIP (nêu theo yêu cầu):** settings production chọn `DB_ENGINE=mysql` → Django import driver `django.db.backends.mysql` lúc import settings → cần `MySQLdb` (mysqlclient). Máy local không root không build được mysqlclient (bằng chứng trực tiếp: không có wheel Linux trên PyPI — `pip download --only-binary :all:` báo "No matching distribution found"). Hai test dương tính được đánh dấu `@unittest.skipUnless(mysqlclient import được, ...)` — khi chạy trong CI job `mysql-checks` (có cài mysqlclient) chúng sẽ tự chạy và trở thành bằng chứng dương tính; tại `sqlite-checks`/local chúng skip có lý do. Job `production-guard` của CI cũng cài mysqlclient và chạy cùng kịch bản bằng shell script.

### 2.7 Kết quả tổng hợp các lệnh nền tảng (môi trường `DJANGO_ENV=test DB_ENGINE=sqlite`)

| Lệnh | Kết quả | Output rút gọn |
| --- | --- | --- |
| `python manage.py check` | PASS (exit 0) | `System check identified no issues (0 silenced).` |
| `python manage.py makemigrations --check --dry-run` | PASS (exit 0) | `No changes detected` |
| `python manage.py test -v 2` | PASS | `Ran 30 tests in ~1.3s — OK (skipped=2)` |

Phân bố 30 test: accounts 5, cors 1, default_deny 4, envelope 4, health 2, ready 4, throttle 4, settings_guard 6 (2 skipped).

### 2.8 Review độc lập CI/render.yaml/docs (read-only, không sửa)

| Mục | Cách kiểm tra | Kết quả |
| --- | --- | --- |
| YAML hợp lệ | `yaml.safe_load` (PyYAML 6.0.3) cho `.github/workflows/backend-foundation.yml` và `render.yaml` | PASS — workflow 3 jobs (`mysql-checks`, `production-guard`, `sqlite-checks`), `permissions: {contents: read}`; render.yaml 1 web service `family-bridge-backend`, `healthCheckPath: /api/v1/health/`, `autoDeploy: false`, 11 envVars |
| Actions pin SHA tồn tại | `git ls-remote` upstream | PASS — checkout `3d3c42e5…` = `refs/tags/v7.0.1`; setup-python `5fda3b95…` = `refs/tags/v7.0.0` (khớp comment phiên bản trong workflow) |
| GRANT trong job mysql-checks | Đối chiếu pattern Django | ĐÚNG — Django test runner tạo DB `test_` + `MYSQL_DATABASE` = `test_family_bridge`; GRANT ALL ON `test_family_bridge`.* là pattern chính thức của Django cho CI; không GRANT cho DB dữ liệu thật |
| paths filter | Đọc workflow | Phủ `backend/**`, `docs/setup/backend/**`, `docs/handover/backend-foundation/**`, `render.yaml`, workflow — đủ cho đợt này (observation: `docs/contracts/` không nằm trong filter — xem mục 4) |
| Env trong CI khớp nhu cầu test | Đối chiếu suite của 2-c | KHỚP — `sqlite-checks` set `DJANGO_ENV=test DB_ENGINE=sqlite` cho `manage.py test -v 2` (đúng cách suite đã chạy local); `mysql-checks` set đủ `MYSQL_*` |
| Docs (setup README, handover README, platform-endpoints, antigravity-checklist) | Đối chiếu từng tên env var/lệnh với `config/settings.py` | Tên biến `DJANGO_ENV/DJANGO_SECRET_KEY/DJANGO_ALLOWED_HOSTS/DB_ENGINE/MYSQL_*/MYSQL_SSL_CA/CORS_ALLOWED_ORIGINS` khớp 100%; lệnh check/makemigrations/migrate/test/gunicorn khớp; mô tả health/ready/throttle/envelope/JWT 15 phút/PAGE_SIZE 20/CORS regex khớp code; **không có secret thật** trong docs (chỉ placeholder/dummy) |
| Dockerfile | Đọc trực tiếp | nonroot đúng (`useradd appuser` + `USER appuser`); phát hiện 1 điểm cần lead (mục 4.2) |
| `python scripts/check_agent_docs.py` | Chạy trực tiếp | PASS (exit 0) — kiểm tra này không chứng minh runtime/US Done theo AGENTS.md |

## 3. Dependency audit (SEC-25) — pip-audit + OSV

Lệnh: `pip-audit 2.10.1 -r requirements.txt` (resolve toàn cây) trong venv; đối chiếu thêm truy vấn trực tiếp OSV API (`https://api.osv.dev/v1/query`) cho từng pin kể cả `mysqlclient` (không nằm trong requirements.txt).

| Package | Phiên bản | Advisory | Đánh giá ảnh hưởng foundation | Fix |
| --- | --- | --- | --- | --- |
| djangorestframework | 3.16.1 | **PYSEC-2026-3827** (CVE-2026-73228, GHSA-2m8g-3cmr-wg3w) — bypass `DATA_UPLOAD_MAX_MEMORY_SIZE` khi parse body JSON/urlencoded qua `request.data`. CVSS 3.1: AV:N/AC:L/PR:N → **A:L** | **Chưa có đường tận dụng trong foundation**: health/ready chỉ GET, không parse body. Nhưng mọi endpoint nghiệp vụ sau này kế thừa parsers mặc định → liên quan trực tiếp SEC-14 (bound body) | **3.17.2** |
| djangorestframework | 3.16.1 | **PYSEC-2026-3828** (CVE-2026-73229, GHSA-g47c-3xmw-q6m2) — AdminRenderer lộ dữ liệu GET-protected khi render request ghi sai. CVSS 3.1: AV:N/AC:L/PR:L → **C:L** | **Không đạt được trong cấu hình hiện tại**: settings đặt `DEFAULT_RENDERER_CLASSES = [JSONRenderer]` (không AdminRenderer) + không có admin site (test chứng minh) — hai lớp giảm thiểu đã có sẵn | **3.17.2** |
| Django | 5.2.18 | Không có advisory (OSV) | — | — |
| mysqlclient | 2.2.8 | Không có advisory (OSV) | — | — |
| django-cors-headers | 4.9.0 | Không có advisory (OSV) | — | — |
| djangorestframework-simplejwt | 5.5.1 | Không có advisory (OSV) | — | — |
| gunicorn | 23.0.0 | Không có advisory (OSV) | — | — |
| python-dotenv | 1.2.4 | Không có advisory (OSV) | — | — |
| Transitive (pip-audit resolve): PyJWT 2.15.1, sqlparse 0.6.0, asgiref 3.12.1 | — | Không có advisory | — | — |

**Đề xuất (không tự sửa requirements):** nâng pin `djangorestframework==3.17.2` trong một PR nhỏ riêng (dependency thay đổi phải review theo AGENTS.md), ưu tiên trước khi US-004 mở endpoint parse body. Cho đến lúc đó: chấp nhận được vì foundation chưa có endpoint parse body và AdminRenderer đã bị loại khỏi renderer; cần ghi advisory + trạng thái exception vào control-register khi lead chốt.

## 4. Phát hiện cần lead xử lý (KHÔNG sửa — nằm ngoài phạm vi file của 2-c)

1. **2 advisory DRF 3.16.1** (mục 3): đề xuất nâng pin lên 3.17.2 bằng PR riêng; ghi exception/reachability vào `docs/security/control-register.json` nếu tạm giữ 3.16.1.
2. **Dockerfile chạy migrate lúc start** (`CMD ... python manage.py migrate --noinput && exec gunicorn ...`) — khác pattern "migrate one-off, KHÔNG nằm trong startCommand" mà render.yaml + antigravity-checklist đã chốt. Nếu Antigravity deploy bằng image Docker này (thay vì render.yaml), user runtime `appuser` cần quyền DDL trên DB (mâu thuẫn SEC-20 "runtime user ít quyền") và migrate lặp lại mỗi lần restart container. Cần lead/Antigravity quyết định hướng nhất quán.
3. **antigravity-checklist mục 3 (migrate one-off)**: lệnh mẫu chưa liệt kê `DJANGO_SECRET_KEY` — settings production fail-closed nếu thiếu; chạy trong Render Shell thì env service có sẵn, nhưng chạy từ máy ngoài sẽ gặp lỗi "DJANGO_SECRET_KEY is required". Nên thêm 1 dòng chú thích vào checklist.
4. **render.yaml `DJANGO_SECRET_KEY: generateValue`**: cần xác nhận giá trị Render generate có độ dài ≥50 ký tự (settings bắt buộc); nếu Render tạo chuỗi ngắn hơn, service sẽ fail-closed khi deploy (an toàn nhưng chặn deploy). Kiểm tra trước khi tạo service thật.
5. **paths filter CI không gồm `docs/contracts/**`**: sửa hợp đồng API sẽ không kích hoạt backend CI. Observation; lead cân nhắc khi chốt quy trình US-004.
6. **CI chưa từng chạy** (nhánh chưa được push): mọi bằng chứng CI (sqlite-checks, mysql-checks, production-guard) hiện chỉ là script đã review; SHA pin đã verify qua `git ls-remote` nhưng vẫn cần lead push + xem lần chạy đầu, đặc biệt job mysql-checks (GRANT) và production-guard dương tính.
7. **DRF throttle là per-process cache (LocMemCache mặc định)**: với `--workers 2` trên Render, hạn mức 60/min là **mỗi worker** (tổng thực tế có thể gấp đôi) và mất khi restart; đúng ghi chú của security-rules ("DRF throttling không phải lớp chống DDoS đầy đủ") — US-004 cân nhắc shared cache/gateway cho quota quan trọng.

## 5. Phân tích runtime/DSA (bắt buộc theo AGENTS.md)

| Hạng mục | Số liệu/lý giải |
| --- | --- |
| Input bounds | health/ready **không nhận input**: `@api_view(["GET"])` chỉ cho GET (method khác → 405, test PASS); không đọc body/query; GET không kích hoạt parser DRF → không cần bound đầu vào ở nền tảng này |
| Query count | health = **0 query** (assertNumQueries(0) PASS); ready = **1 query** (SELECT 1, assertNumQueries(1) PASS) — không quét schema, không N+1 (không có quan hệ) |
| Payload size | **15 bytes** đo trực tiếp: `{"status":"ok"}` cho cả hai endpoint — xa dưới mọi ngân sách |
| Thuật toán / độ phức tạp | **O(1) thời gian và bộ nhớ phụ**: dựng dict cố định + một SELECT 1; không vòng lặp theo dữ liệu, không cache, không queue |
| List/pagination | **N/A có lý do**: chưa có list nghiệp vụ nào; DRF `PageNumberPagination` PAGE_SIZE 20 chỉ là default cho endpoint tương lai — envelope cursor cho inbox/mood/journal thuộc US-004 (đã ghi trong hợp đồng mục 4) |
| Authorization evidence | default-deny: probe APIView kế thừa `IsAuthenticated` → 401 + envelope `not_authenticated` (test PASS); không có đường phát hành token, không admin, không auth Zalo (test PASS) — quyền theo đối tượng chưa tồn tại để test (chưa có endpoint nghiệp vụ) |
| Secret/log redaction evidence | (a) readiness fail-safe chỉ log **tên class** ngoại lệ — test với message chứa host/password thật PASS; (b) body 503 không chứa marker nhạy cảm — test PASS; (c) LOGGING console plain level/name/message, không log body/token/DSN (review settings); (d) guard subprocess: output lỗi không chứa giá trị dummy secret — test PASS; (e) không secret nào trong repo/docs/render.yaml (review) |
| Giới hạn của bằng chứng | Toàn bộ đo trên SQLite in-memory trong test runner + test client; KHÔNG có đo p95/latency, KHÔNG có MySQL EXPLAIN/plan, KHÔNG có device/Zalo thật — các mục này thuộc deployment thật |

## 6. Security mapping (trạng thái từng mục theo bằng chứng đợt này)

| SEC | Trạng thái trong foundation | Bằng chứng |
| --- | --- | --- |
| SEC-03 default deny | **ĐÃ LÀM (mức nền tảng)** | settings `DEFAULT_PERMISSION_CLASSES=IsAuthenticated` + JWT; test 401/envelope; quyền theo đối tượng: **CỦA US SAU** (chưa có endpoint) |
| SEC-09 TLS/hosts/CORS | **ĐÃ LÀM (cấu hình)** | hosts/CORS explicit + từ chối `*` (guard test); DEBUG false khi production; TLS runtime thật: **chưa** (deploy thuộc Antigravity) |
| SEC-14 throttle/bound | **ĐÃ LÀM (mức nền tảng)** | anon 60/min, user 120/min + exempt health/ready — behavior test PASS; note: check_permissions trước check_throttles, per-process cache → US-004/gateway |
| SEC-19 secret | **ĐÃ LÀM (mức repo)** | không secret trong repo; render.yaml `sync:false`/`generateValue`; CI dummy; guard fail-closed PASS. Rotate/TTL secret manager: **Antigravity** |
| SEC-22 log | **ĐÃ LÀM (điểm đã có)** | readiness log tên class (test PASS); LOGGING plain không PII/DSN. Canary toàn hệ thống/retention/alert: **US SAU** |
| SEC-25 dependency | **ĐÃ LÀM một phần** | pin cứng + audit đợt này (2 advisory DRF, có đánh giá reachability + đề xuất fix 3.17.2). SBOM/update plan: **US SAU** |
| SEC-26 CI | **ĐÃ LÀM (cấu hình)** | permissions `contents:read`; SHA pin verified qua ls-remote; không secret trong workflow; không chạy untrusted PR với secrets. Bằng chứng runtime CI: **chờ lần chạy đầu** |
| SEC-27 production minimal | **ĐÃ LÀM (mức foundation)** | không admin site (test PASS); health minimal GET-only (405 test PASS); envelope không stack trace; Dockerfile nonroot; `check --deploy` trong CI. Runtime 5xx trên deploy thật: **chưa** |
| SEC-01 Zalo verify | **N/A foundation** | không endpoint auth — US-011 |
| SEC-20 DB least-privilege | **CẤU HÌNH ĐÃ CÓ, runtime CHƯA có bằng chứng** | `MYSQL_SSL_CA` → `VERIFY_IDENTITY`; hướng dẫn user ít quyền trong docs; MySQL runtime thuộc CI mysql-checks (chưa chạy) |
| SEC-02/04/05/06/07/08/10/11/12/13/15/16/17/18/21/23/24/28/29/30 | **N/A / CỦA US khác** | chưa có token thật, ACL, gửi tin, AI, khảo sát, upload, webhook… trong foundation |

## 7. Kết luận

- Suite test độc lập **30 test** (28 PASS, 2 skip có lý do — dương tính production-guard phụ thuộc mysqlclient, thuộc CI) chạy xanh bằng `python manage.py test` mặc định trong môi trường CI `DJANGO_ENV=test DB_ENGINE=sqlite`; `check` và `makemigrations --check --dry-run` sạch.
- Hợp đồng health/ready, envelope lỗi, default-deny, CORS allowlist, throttle (+ miễn cho health/ready), User UUID, guard production **đều được xác minh bằng behavior test thật** — không phát hiện sai lệch nào so với `docs/contracts/api-foundation.md` và code của Agent 2-b.
- Dependency: 2 advisory DRF 3.16.1 (fix 3.17.2) — có đánh giá ảnh hưởng; còn lại sạch.
- Nhãn đúng cho đợt này: **"backend foundation đã kiểm tra cục bộ"** (check/test/endpoint trên SQLite local + review tĩnh CI/render/docs).

KHÔNG được suy rộng thành:
- ❌ "US-003 Done" / "US-003 hoàn thành"
- ❌ "MySQL đã nghiệm thu" — **chưa có bằng chứng MySQL runtime**; chỉ có bằng chứng cấu hình + script CI (job `mysql-checks` chưa từng chạy)
- ❌ "Zalo đã kiểm chứng/đăng nhập Zalo hoạt động" — không có endpoint auth (đó là chủ ý thiết kế, test đã chứng minh 404)
- ❌ "Đã deploy/chạy production" — render.yaml chỉ chuẩn bị, chưa deploy

## Phụ lục — Quyết định Lead sau khi nhận báo cáo (2026-10-11)

1. **DRF advisory (PYSEC-2026-3827/3828):** Lead quyết định nâng pin ngay trên nhánh này
   `djangorestframework==3.16.1 → 3.17.2` thay vì PR riêng, vì nhánh chưa từng được
   phát hành/merge, thay đổi nằm trọn trong phạm vi backend foundation của đợt, và
   ship pin đã biết lỗi khi có sẵn bản fix là không cần thiết. Tương thích đã kiểm
   chứng sau nâng cấp: `manage.py check` sạch, `makemigrations --check` không drift,
   toàn bộ 30 test chạy lại → cùng kết quả (28 pass, 2 skip). Đánh giá reachability
   tại mục 3 giữ nguyên giá trị làm bằng chứng đã phân tích.
2. **Lệnh migrate one-off thiếu `DJANGO_SECRET_KEY`** (phát hiện 4.3): đã vá
   antigravity-checklist.md — thêm biến vào lệnh mẫu + ghi chú hành vi fail-closed.
3. **Dockerfile CMD tự migrate vs render.yaml one-off** (phát hiện 4.2): Lead giữ
   nguyên Dockerfile port từ khung đã review, thêm ghi chú phân biệt hai đường
   triển khai vào antigravity-checklist.md; quyết định tối ưu hóa là của Antigravity.
4. **Render generateValue** (phát hiện 4.4): checklist đã ghi rõ Render sinh chuỗi
   random 128 ký tự, đạt yêu cầu ≥50.
5. **paths filter CI không phủ docs/contracts/** (phát hiện 4.5): Lead giữ nguyên —
   docs/contracts/api-foundation.md là file hợp đồng dùng chung, thay đổi nó cần
   review chung theo AGENTS.md; CI nền tảng chỉ gate code + docs thuộc phạm vi nhánh.
6. **CI chưa chạy** (phát hiện 4.6): sẽ chạy lần đầu khi nhánh được push/PR — lead
   ghi nhận trong PR; kết quả CI không được dùng để tuyên bố MySQL device evidence.
7. **Throttle per-process** (phát hiện 4.7): giới hạn đã ghi ở cả security-rules.md
   (SEC-14) và checklist; chấp nhận ở mức foundation,US-004/DEC-17 chốt lại.
