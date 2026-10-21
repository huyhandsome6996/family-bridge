# Family Bridge sửa gấp đăng nhập và AI

Ngày bàn giao: 21/10/2026, giờ Việt Nam.

**Cách dùng:** Đưa nguyên file này cho Codex tại repository Family Bridge và yêu cầu thực hiện phần **Prompt thực thi** bên dưới. Đây là hồ sơ sự cố và yêu cầu sửa; không phải báo cáo đã sửa thành công.

## 1. Mục tiêu và bối cảnh

- Repository: https://github.com/huyhandsome6996/family-bridge
- Web: https://family-bridge-web.onrender.com/
- Backend dùng chung: https://family-bridge-backend.onrender.com
- Hai frontend độc lập: `web/` và `zalo-mini-app/`; dùng chung API, không lấy bản web thay cho Mini App.
- Người dùng đăng nhập bằng mã tài khoản HS/PH và mật khẩu được cấp, cặp phụ huynh–học sinh được quản trị viên ghép sẵn. Không yêu cầu mã mời hoặc bật đăng nhập SDK Zalo để chữa lỗi tài khoản lớp.
- Cần khôi phục đăng nhập thật, sau đó AI cho cả học sinh và phụ huynh trên web/Mini App. Giữ được luồng viết tay khi AI lỗi.

Main mới nhất lúc kiểm tra: `fc9e524eefd711c6ef76b055f1efe0be1816f733`, thông điệp `chore(render): enable auto-deploy on commit for backend service`.

**Codex phải fetch lại main trước khi làm.** Không dùng `7ace3da` làm baseline sửa nếu main đã tiến lên. SHA mới trong GitHub chưa chứng minh Render hoặc Zalo đã chạy đúng bản đó.

## 2. Bằng chứng đã đọc được từ ba ảnh

Các ảnh ban đầu báo lỗi đọc tệp trong ChatGPT; ở lần bàn giao này đã mở và xem được. Không sao chép các giá trị bí mật trong ảnh.

| Bằng chứng | Quan sát thực tế | Kết luận có thể đưa ra |
| --- | --- | --- |
| `image(20261021-032039).png` | Web đang ở màn phản hồi thư bằng tài khoản phụ huynh; nút AI bị khóa; thông báo “Cổng gợi ý AI chưa được bật trên máy chủ — nút sẽ mở khi máy chủ bật.” | Màn này thể hiện trạng thái AI off; cần kiểm tra Response của API trạng thái và cấu hình tiến trình backend đang phục vụ. Chưa có bằng chứng gọi Gemini thất bại. |
| Cùng ảnh trên | Có dòng “Thư viện lời hồi âm chưa được cấu hình trên máy chủ — bạn vẫn viết phản hồi tự do bên dưới.” | Đây là cấu hình thư viện lời hồi âm, tách biệt với Gemini. Không coi thêm key Gemini sẽ tự chữa mục này. |
| `image(20261021-032049).png` | Ảnh Environment backend có tên biến GEMINI_API_KEY; không thấy FB_AI_ENABLED trong phần danh sách được chụp. FB_ZALO_LOGIN_ENABLED đang false. | Ở thời điểm ảnh, có khai báo key nhưng chưa đủ bằng chứng bật AI. Không kết luận key hợp lệ chỉ vì có giá trị. Không suy ra ảnh là cấu hình mới nhất. |
| `image(20261021-032058).png` | Form HS/PH trong khung Mini App Zalo hiện “Chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build.” | Ưu tiên kiểm tra bản Mini App đang phát hành thiếu địa chỉ backend trong bundle. Chưa có căn cứ kết luận sai mật khẩu hoặc phải reset tài khoản. |

Ảnh mobile cho thấy lỗi cấu hình trước khi đăng nhập được. Ảnh web cho thấy có một phiên đã vào màn thư. Vì vậy không gộp thành kết luận “mọi tài khoản đều bị sai mật khẩu”.

### Bí mật đã bị lộ trong ảnh cấu hình

Ảnh Environment hiện giá trị của các biến bí mật như GEMINI_API_KEY, DJANGO_SECRET_KEY, MYSQL_PASSWORD, ZALO_APP_SECRET. **Không chép lại, không dùng các giá trị đã lộ để đăng nhập/gọi API, không đưa ảnh gốc vào commit hoặc báo cáo công khai.**

Phối hợp Huy thay mới/thu hồi thông qua kênh quản lý credentials an toàn; đồng bộ mật khẩu database với Render khi thay. Đổi DJANGO_SECRET_KEY cần tính đến tác động phiên/chữ ký. Không thay bừa làm gián đoạn thêm, không yêu cầu Huy dán key/mật khẩu vào chat. Dùng credentials hợp lệ đã cấu hình an toàn trong môi trường làm việc.

## 3. Những điểm mã nguồn đã xác minh

Đối chiếu tại `fc9e524eefd711c6ef76b055f1efe0be1816f733`:

### Đăng nhập

- `zalo-mini-app/src/core/config.js` đọc `import.meta.env.VITE_API_BASE_URL`; không có thì trả chuỗi rỗng.
- `web/src/core/config.js` có kiểm tra thiếu cấu hình và thông báo tiếng Việt tương ứng.
- `zalo-mini-app/.env.example` đã có địa chỉ backend đúng. **Có .env.example trong Git không có nghĩa môi trường build đã nạp nó.**
- `zalo-mini-app/src/core/login-startup.js` giữ đăng nhập SDK Zalo ở trạng thái dormant; luồng hiện tại dùng tài khoản lớp.
- `zalo-mini-app/package.json`: `npm run build` chạy Vite rồi `scripts/verify-build.mjs`.
- `zalo-mini-app/vite.config.mjs`: thư mục kết quả là **`www`**, có manifest `app-config.json` và các chunk JS/CSS.
- Web build riêng ra `web/dist`; không triển khai thư mục này thành Mini App.

### AI

`backend/config/settings.py` đọc:

| Biến | Mặc định/ràng buộc hiện tại |
| --- | --- |
| FB_AI_ENABLED | false nếu thiếu; chỉ chuỗi `true` hoặc `1` bật |
| GEMINI_API_KEY | Rỗng nếu thiếu; chỉ ở backend |
| GEMINI_MODEL | gemini-2.5-flash |
| GEMINI_TIMEOUT_SECONDS | 15; giới hạn 3–30; không phân tích được thành số thì cấu hình không hợp lệ |
| GEMINI_MAX_OUTPUT_TOKENS | 1024; giới hạn 64–4096; không phân tích được thành số thì cấu hình không hợp lệ |

- `f04_ai/services/wiring.py` chỉ đăng ký provider khi mọi điều kiện hợp lệ. Sai cấu hình thì AI off, không cố bật giao diện.
- `f04_ai/services/gemini.py` hiện chỉ cho phép `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`.
- `web/src/components/ai-assist.js` kiểm tra `aiStatus()` khi mount; off thì khóa nút.
- `GET /api/v1/ai/status` yêu cầu đăng nhập. `ai_enabled=true` chỉ xác nhận provider được cấu hình, chưa chứng minh gọi Gemini thành công.
- `POST /api/v1/ai/refine` cần phiên, consent `ai_processing` hiện hành và idempotency key theo hợp đồng.
- `render.yaml` chưa khai báo các biến AI; backend và web đang có `autoDeployTrigger: commit` trong mã nguồn mới.

Vite thay giá trị env khi build. Thêm VITE_API_BASE_URL vào backend Render không sửa bundle Mini App đã phát hành; phải build và triển khai lại đúng client.

## 4. Sự cố khởi động backend trước đó

Huy đã gửi log deploy commit `7ace3dab80c2473095cdef51c0cd3b35805b4143`:

```text
2026-10-20T16:29:05Z Deploying...
2026-10-20T16:29:21Z Family Bridge backend ports successfully wired.
2026-10-20T16:44:08Z Port scan timeout reached, no open ports detected.
2026-10-20T16:47:06Z Timed Out
```

Docker Command lúc Huy kiểm tra: **để trống**, tức dùng CMD trong Dockerfile. Dockerfile mới nhất vẫn chạy:

```sh
python backend/manage.py migrate --noinput && exec gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 60
```

Suy luận cần điều tra: tiến trình có thể kẹt trong khởi tạo Django hoặc migration/database trước khi Gunicorn mở cổng. Dòng “ports successfully wired” là nối các thành phần nghiệp vụ, không chứng minh socket HTTP đã lắng nghe. **Chưa có traceback xác định dòng bị treo.** Không khẳng định do Gemini hoặc database khi chưa có bằng chứng.

Một lệnh Docker chẩn đoán dùng faulthandler đã được đề xuất sau đó; chưa xác minh Huy lưu thành công hoặc có còn override hay không. Codex phải kiểm tra lại Docker Command hiện tại. Nếu override còn tồn tại, nó có thể tiếp tục ghi đè CMD mới trong Git.

Tại lần bàn giao này, công cụ truy cập health/ready không lấy được kết quả; đây không phải bằng chứng backend đang sập. Phải kiểm tra từ môi trường có mạng phù hợp.

---

## 5. Prompt thực thi cho Codex

Bạn là coding agent xử lý khẩn cấp Family Bridge. **Hãy thực hiện sửa và kiểm tra**, không chỉ viết kế hoạch hoặc yêu cầu Huy lặp lại các bước đã có bằng chứng trong tài liệu này.

### A. Nhận hiện trạng và giữ phạm vi

1. Đọc toàn bộ hồ sơ ở trên, fetch main mới nhất và ghi baseline SHA. Giữ nguyên mọi thay đổi của agent khác; dùng worktree/nhánh hotfix riêng phù hợp chỉ dẫn hiện hành, không force push/reset main.
2. Đọc AGENTS.md, nested instructions, project-scope và các rule/skill DSA, security, UI, workflow có liên quan. Tôn trọng hướng dẫn hiện hành trong repo; không làm lại scaffold US-003 hoặc chuyển sang React vì tài liệu lịch sử.
3. Kiểm tra CI và diff từ baseline. Nhánh code/mixed config phải theo quy trình review của repo. Tài liệu này không tự cấp quyền bỏ review hoặc merge main.
4. Dùng quyền đã được Huy cấp trong phiên của bạn cho commit/push/deploy. Nếu chưa có quyền merge/publish cần thiết, hoàn thiện bản vá, tests, PR và gói build trước; chỉ hỏi đúng thao tác cuối còn thiếu quyền. Không tạo dịch vụ trả phí, không xóa database/tài khoản/dữ liệu thật.
5. Thứ tự: backend khả dụng → cấu hình build đăng nhập → xác thực thật → AI → thư viện lời hồi âm. Không dùng mock/demo để báo thành công.

### B. Xác định backend đang chạy và khôi phục khi cần

- Ghi commit đang deploy, trạng thái deploy thực, Docker Command override và thời điểm log. Phân biệt với main trên GitHub.
- Kiểm tra health và ready riêng; health 200 không chứng minh database, auth hoặc AI sẵn sàng.
- Nếu còn port timeout: đo từng bước django.setup, kết nối DB bằng truy vấn chỉ đọc, kiểm tra kế hoạch migration, migration và khởi động Gunicorn. Dùng stack dump/log mốc thời gian đã khử secrets để tìm nơi chờ.
- Kiểm tra DB provider còn hoạt động, DNS/TLS, giới hạn kết nối, khóa/DDL và migration tương thích MySQL/TiDB. Đã có connect_timeout=10; không giải thích mọi kiểu treo bằng việc thiếu connect timeout.
- Kiểm tra no-network/no-query không cần thiết ở import/apps.ready. Bật AI không được gọi provider trong quá trình boot/migrate/health.
- Sửa nguyên nhân có bằng chứng. Nếu thay startup/migration strategy, phải có kiểm soát migration một lần và lỗi rõ ràng, không chạy server như thể DB sẵn sàng khi chưa đạt điều kiện. Không fake migration, xóa bảng, disable TLS hoặc mở cổng giả để Render báo xanh.
- Sau khi khôi phục, gỡ override chẩn đoán khi không còn cần và xác nhận service dùng đúng lệnh mong muốn.

### C. Sửa đăng nhập Mini App trước

Nguyên nhân hiển thị trong ảnh là thiếu VITE_API_BASE_URL của client build. Không reset mật khẩu trước khi xử lý nó.

1. Kiểm tra môi trường build thực tế, working directory, mode, envDir, biến shell/CI và file env. Biến shell rỗng có thể đè giá trị file; phải tìm nguồn thật, không chỉ tạo thêm file mẫu.
2. Đặt cấu hình công khai tại môi trường build Mini App:

```dotenv
VITE_API_BASE_URL=https://family-bridge-backend.onrender.com
```

3. Build từ `zalo-mini-app/`; kiểm tra bundle **www** thực sự mang base URL đúng, manifest entry trỏ đúng tài nguyên, không dùng www cũ/nhầm thư mục. .env.example không tự được Vite nạp như .env.
4. Thêm kiểm tra tối thiểu ở production build/deploy để thiếu/rỗng/sai base URL thì dừng với lỗi rõ ràng trước khi upload. Điều chỉnh CI hợp lý; giữ demo/test được chọn tường minh, không biến lỗi thành demo.
5. Kiểm tra web độc lập: Render service `family-bridge-web` cần cùng VITE_API_BASE_URL tại thời điểm build và phải rebuild nếu thay. Không sửa bundle Mini App bằng cách chỉ deploy web.
6. Kiểm tra domain/network allowlist Zalo theo tài liệu chính thức hiện hành và Origin thực tế. CORS chỉ thêm origin cần thiết, không dùng `*` hoặc cho phép mọi origin để che lỗi. Missing config xảy ra trước network nên xử lý cấu hình trước.
7. Test HS/PH login trên API rồi từng client với credentials an toàn được cấp. Kiểm tra payload, token in-memory, consent, người đồng hành ghép sẵn, logout/expiry. Không log body mật khẩu hoặc Authorization.
8. `FB_ZALO_LOGIN_ENABLED=false` là tắt cơ chế SDK cũ; không tự bật nó để chữa form mã tài khoản HS/PH. Không ép người dùng xin OTP hoặc mã mời.
9. Build/publish bản Mini App mới bằng CLI/tooling đã xác thực của Huy; đọc --help và tài liệu hiện hành, không bịa lệnh deploy, không dùng access token từng lộ. Ghi version/build ID và cung cấp QR/link testing thật. Test thiết bị Zalo thực nếu có; nếu chưa, ghi NOT_RUN.

Lệnh build minh họa cho POSIX, không phải lệnh publish:

```sh
cd zalo-mini-app
npm ci
VITE_API_BASE_URL=https://family-bridge-backend.onrender.com npm run build
```

PowerShell tương đương:

```powershell
Set-Location zalo-mini-app
npm ci
$env:VITE_API_BASE_URL = 'https://family-bridge-backend.onrender.com'
npm run build
```

### D. Bật và kiểm tra AI thực tế

1. Kiểm tra cấu hình **runtime của đúng backend đang phục vụ**, không in giá trị key. Chỉ báo các trạng thái như enabled/key_present/model/config_valid.
2. Bảo đảm có FB_AI_ENABLED=true và key Gemini hợp lệ lấy từ nơi quản lý secrets an toàn. Nếu ảnh đã lộ key, phối hợp thay mới trước khi dùng cho production.
3. Bộ cấu hình hiện tại, chỉ dùng model khi project thực tế truy cập được:

```dotenv
FB_AI_ENABLED=true
GEMINI_API_KEY=<SECRET_NHAP_RIENG>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_SECONDS=15
GEMINI_MAX_OUTPUT_TOKENS=1024
```

4. Kiểm tra FB_FEATURES nếu bị giới hạn: f04_ai và các thành phần phụ thuộc phải được nạp; không tự tắt feature khác. Kiểm tra F04 apps.ready có đăng ký provider trong tiến trình chạy thật.
5. Thay env backend phải deploy/reload tiến trình để nhận cấu hình. Xác nhận commit/process mới đã nhận; trang cũ đang mở có thể cần mount lại component để lấy trạng thái mới.
6. Dùng phiên đã đăng nhập kiểm tra GET /api/v1/ai/status. Nếu false, tìm chính xác cấu hình/wiring bị chặn. Không sửa UI thành enabled hoặc bắt mọi lỗi rồi trả true.
7. Nếu true, gọi refine qua luồng người dùng với consent hiện hành, idempotency và một câu thử không nhạy cảm. Theo dõi mã lỗi đã khử dữ liệu: provider_auth_invalid, provider_model_unavailable, provider_quota_exceeded, provider_timeout, provider_output_truncated, consent_required.
8. Xác minh model với tài liệu Gemini chính thức và quyền project thực tế. Dòng 2.5 có thay đổi quyền truy cập theo vòng đời; không mặc định mọi key mới dùng được. Nếu cần model mới, cập nhật allowlist/default/request/response/tests đồng bộ; chỉ đổi env sang tên ngoài allowlist hiện tại sẽ làm AI off.
9. Bổ sung tên biến/placeholder vào env.example và runbook. Nếu sửa Blueprint, không commit key và không tự bật AI cho mọi môi trường ngoài phạm vi đã cho phép.
10. Test AI ở soạn thư **và phản hồi thư**, cho HS và PH, web và Mini App. Bảo đảm Dùng gợi ý chỉ điền ô soạn; người dùng vẫn tự lưu/xem trước/gửi. Không tự gửi, không mất bản gốc khi lỗi, không áp dụng gợi ý cũ đè nội dung người dùng vừa sửa.

### E. Thư viện lời hồi âm

Ảnh báo chưa cấu hình thư viện, không phải lỗi Gemini. Sau P0 đăng nhập/AI, kiểm tra provider/catalog nội dung đã publish, wiring và API. Sửa đúng nguồn nội dung nếu nằm trong phạm vi; không thêm lịch sử tham gia hoặc thư giả của người dùng. Nếu chưa giải quyết được ngay, báo rõ còn thiếu cấu hình nào; giữ phản hồi tự do hoạt động.

### F. Kiểm thử và tiêu chí nghiệm thu

Chạy suite hiện có phù hợp, bổ sung test cho nguyên nhân và regression, build hai client. Không dùng kết quả SQLite/browser để tuyên bố MySQL/Zalo device PASS.

| Hạng mục | Bằng chứng bắt buộc |
| --- | --- |
| Backend khởi động | Commit deploy, Gunicorn listening trên 0.0.0.0:$PORT, deploy thành công |
| Database | Ready thực và kiểm tra auth thật, không chỉ health |
| Build thiếu API URL | Dừng trước publish với lỗi rõ ràng |
| Mini App build đúng | www mới, manifest đúng, base URL đúng, version/build ID |
| HS/PH đăng nhập | Mỗi vai vào tài khoản riêng và thấy người đồng hành đúng; không yêu cầu mã mời |
| Session | Logout/expiry không để response cũ phục hồi phiên |
| AI off | Luồng viết tay vẫn hoạt động, UI giải thích đúng |
| AI on | Status true và refine thành công bằng Gemini thật, không chỉ mock |
| Consent | Từ chối/rút đồng ý chặn xử lý AI đúng hợp đồng |
| Soạn và hồi âm | Hai vai/two clients đều được kiểm tra theo môi trường có thật |
| Gửi thư | Gợi ý/hết 300 giây không tự gửi; chỉ gửi sau thao tác xác nhận |
| Secrets | Không có secret trong diff, bundle, logs hoặc báo cáo |

Khi không có quyền truy cập Render, key hoặc thiết bị: ghi BLOCKED/NOT_RUN đúng phần; vẫn hoàn thiện code, tests, PR và gói build có thể làm. Không gọi là hoàn tất chỉ vì build xanh.

### G. Git và triển khai an toàn

- Sửa nhỏ tập trung, không đổi giao diện toàn trang/stack/dependencies nếu không cần.
- Commit/push nhánh hotfix, mở PR theo policy repo; không force push hoặc gộp code chưa review từ nhánh khác.
- Backend main hiện khai báo auto-deploy trên commit: mọi merge có thể kích hoạt deploy. Kiểm tra cấu hình Dashboard thực và điều phối trước khi cập nhật main.
- Hoàn tất checks và bản vá cụ thể trước khi cần quyết định merge/deploy. Dùng quyền đã có; chỉ xin đúng quyền còn thiếu nếu thật sự bị chặn.
- Deploy đúng backend, web và Mini App khi từng phần đã sẵn sàng; ghi rõ phần nào không thay đổi. Chuẩn bị rollback về bản tốt và lưu ý migration additive/khả năng tương thích. Không rollback DB bằng cách xóa dữ liệu.

### H. Đầu ra cho Huy

Trả lời ngắn, kèm bằng chứng:
1. Nguyên nhân đăng nhập và nguyên nhân AI, tách riêng; phân biệt confirmed với suy luận.
2. Baseline/head SHA, PR, file thay đổi.
3. Tests/build đã chạy, kết quả và phần NOT_RUN.
4. Biến nào cần Huy nhập ở service/build nào; chỉ tên/placeholder, không giá trị bí mật.
5. Backend/web commit đang live; Mini App version/QR/link testing nếu đã publish thật.
6. Link web đăng nhập và soạn thư; hướng dẫn Huy thử 3–5 bước.
7. Tình trạng Docker override/migration/rollback và việc thay mới secrets bị lộ.

Ưu tiên làm ngay, không tiếp tục vòng hỏi Huy chụp ảnh hoặc gửi lại log cũ khi hồ sơ đã đủ cho việc bắt đầu.

## 6. Nguồn và đường dẫn kiểm tra

- Main đối chiếu: https://github.com/huyhandsome6996/family-bridge/tree/fc9e524eefd711c6ef76b055f1efe0be1816f733
- Đăng nhập Mini App: `zalo-mini-app/src/core/config.js`, `src/core/login-startup.js`, `src/pages/login/credential-form.js`.
- Build Mini App: `zalo-mini-app/.env.example`, `package.json`, `vite.config.mjs`, `zmp-cli.json`.
- AI backend: `backend/config/settings.py`, `packages/family_bridge_features/f04_ai/apps.py`, `services/wiring.py`, `services/gemini.py`, `api.py`, `urls.py`.
- UI AI: `web/src/components/ai-assist.js`; kiểm tra counterpart trong Mini App theo tree mới nhất.
- Deploy: `Dockerfile`, `render.yaml`; đối chiếu Dashboard vì runtime có thể override Git.
- Vite env/build: https://vite.dev/guide/env-and-mode
- Render env: https://render.com/docs/configure-environment-variables
- Render Docker Command: https://render.com/docs/docker
- Gemini model lifecycle: https://ai.google.dev/gemini-api/docs/deprecations/

Trang web để kiểm thử:
- https://family-bridge-web.onrender.com/#/login
- https://family-bridge-web.onrender.com/#/compose
- https://family-bridge-web.onrender.com/#/mailbox
- https://family-bridge-web.onrender.com/#/connect

Không đưa message UUID, nội dung thư thật hoặc bí mật trong ảnh vào báo cáo công khai. Các URL chức năng cần phiên đăng nhập; chỉ được báo PASS sau khi kiểm tra thật.
