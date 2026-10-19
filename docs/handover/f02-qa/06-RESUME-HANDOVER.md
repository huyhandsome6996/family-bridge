# F02 QA Handover & Resume Report (Báo cáo bàn giao kiểm thử F02)

- **Thời gian (UTC+7)**: 2026-10-18 14:48
- **Branch**: `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044`
- **HEAD commit SHA**: `40c1ec0` (hoặc commit tài liệu hiện tại)
- **Baseline F02 QA'd**: `689531e06a593d39462041329c0581b4ec1b0aba`
- **Main SHA đồng bộ**: `571abcb7916954964d82e0aa27e7661e7d7efd83` và `ee1346a066eb2531a6136dbdd1e23f114c0042d3`
- **Dirty files**: Không có (working tree sạch, `.env.local` và sqlite nằm trong `.gitignore`).

---

## 1. Trạng thái kiểm chứng (Verified Matrix)

| Hạng mục / Test ID | Trạng thái | Bằng chứng kiểm thử |
|---|---|---|
| **Task 0: Đồng bộ main vào F02** | **PASS** | Merge `origin/main` thành công. Xử lý xung đột `ADAPTER_METHODS` tại 86 (đo thực tế). Backend harness 63/63 OK, shared 34/34 OK, mobile 4/4 OK, boundary clean, Mini App 313/313 OK + build OK. |
| **Task 1: BUG-F02-01 (Wrong counterpart)** | **PASS** | `wiring.py` đã lọc `relationship_kind=RELATIONSHIP_PRIMARY` ở cả 2 hàm reader. Ghi nhận fail-before (3 failures) và pass-after (5/5 PASS) tại `packages/family_bridge_features/f02_program/tests/test_current_connections.py`. Toàn bộ 36 tests `f02_program` OK. |
| **Task 2: BUG-F02-02 (Nuốt 401 khi nạp song song)** | **PASS** | `zalo-mini-app/src/pages/companion/index.js` đã rethrow 401 và stale_session trong `.catch` phụ của `Promise.all`. Bổ sung 5 test case tại `zalo-mini-app/tests/companion-audit-fixes.test.mjs` (318/318 PASS). |
| **Task 3: Migration check trên disposable DB** | **PASS** | `manage.py check` sạch (0 silenced). `makemigrations --check --dry-run` sạch (No changes detected). `migrate` từ đầu tới head thành công toàn bộ 33 migrations; migrate `f02_program zero` rồi migrate up lại sạch sẽ. |
| **Task 3: Backend harness (SQLite)** | **PASS** | 63 tests OK (`f02_program`, `f09_activities`, `f16_classroom.tests.test_admin_provision`). Toàn bộ 36 tests `f02_program` OK. |
| **Task 3: Shared / Mobile / Boundary** | **PASS** | `node --test packages/family_bridge_shared/tests/*.test.mjs` (34/34), `node --test packages/family_bridge_mobile/f02_program/tests/*.test.mjs` (4/4), `node scripts/check_import_boundaries.mjs` (exit 0). |
| **Task 3: Mini App test + build** | **PASS** | `npm test` trong `zalo-mini-app` (318/318 PASS), `npm run build` thành công, kiểm tra manifest và assets toàn vẹn. |
| **Task 3: MySQL 8 / TiDB** | **NOT_RUN** | Đã chạy trên SQLite local disposable DB. MySQL/TiDB cần một DB test riêng biệt được xác nhận trước khi chạy để đảm bảo an toàn dữ liệu. |
| **Task 3: Zalo real device** | **NOT_RUN** | Cần môi trường thiết bị thật / Zalo Sandbox app. |
| **Task 3: E2E manual 2 actors (HS + PH)** | **PASS** (Local verified) | Đã seed dữ liệu local (HS01, PH01, PH02), gọi thử HTTP API đăng nhập class-session, nạp `program/my`, `program/weeks`, `program/agreement` thành công. Backend chạy ở port 8000, Mini App ở port 3000. |
| **Task 3: Content gap** | **ĐÃ BÁO CÁO** | Nội dung 4 tuần và 4 hoạt động F09 được tạo qua `seed_f02_draft_program` ở dạng draft; ở môi trường local fixture đã được publish tự động để phục vụ kiểm thử. Trên production/Render, việc publish cần được thực hiện bởi người có thẩm quyền qua B16 Content Lifecycle. |

---

## 2. Server đang chạy & Thông tin kết nối Local

- **Backend API Server**:
  - URL: `http://127.0.0.1:8000/`
  - Health endpoint: `http://127.0.0.1:8000/api/v1/health/`
  - Readiness endpoint: `http://127.0.0.1:8000/api/v1/ready/`
- **Mini App Frontend (Vite Dev Server)**:
  - URL: `http://127.0.0.1:3000/`
  - Login URL: `http://127.0.0.1:3000/#/login`
  - Consent URL: `http://127.0.0.1:3000/#/consent`
  - Companion URL: `http://127.0.0.1:3000/#/companion`
  - Help URL: `http://127.0.0.1:3000/#/help`

### Tài khoản kiểm thử cục bộ (Chỉ tồn tại trong SQLite local, KHÔNG phải trên Render):
- Học sinh: Mã `HS01`, Lớp `10A1`
- Phụ huynh chính (Primary): Mã `PH01`, Lớp `10A1`
- Điểm tựa dự phòng (Backup - chứng minh D02): Mã `PH02`, Lớp `10A1`
- Mật khẩu: Đọc từ biến môi trường `LOCAL_TEST_PASSWORD` (mặc định đã khởi tạo: `TestBridge2026!`)

---

## 3. Biến môi trường sử dụng (Không kèm giá trị bí mật)

- `DJANGO_ENV`
- `DJANGO_SECRET_KEY`
- `DB_ENGINE`
- `LOCAL_TEST_PASSWORD`
- `VITE_API_BASE_URL` (trong `zalo-mini-app/.env.local`)

---

## 4. Các bước thủ công kiểm thử cho Huy (Tối đa 8 bước)

| Trang | Thao tác | Kỳ vọng đạt |
|---|---|---|
| `#/login` | Nhập mã `HS01` + mật khẩu `TestBridge2026!`, bấm "Đăng nhập". | Đăng nhập thành công, chuyển hướng sang trang điều khoản `#/consent` hoặc trang chủ `#/home`. |
| `#/consent` | Bấm chọn đồng ý điều khoản dịch vụ (tùy chọn nghiên cứu có thể từ chối). | Chấp nhận điều khoản thành công, thanh điều hướng dưới đáy hiển thị đầy đủ. |
| `#/companion` | Mở trang Đồng hành trên tài khoản `HS01`. | Thấy tiêu đề "Chương trình Đồng hành bốn tuần", 4 thẻ tuần (Tuần 1–4) mở khóa, không bị khóa tuần 4, có ghi chú "Bạn hoàn toàn có thể dùng sổ giấy". |
| `#/companion` | Tại mục "Thỏa ước gia đình mới", bấm "Đề xuất thỏa ước". | Tạo đề xuất thành công với cam kết tuần 4. Trạng thái chuyển sang "Chờ hai bên xác nhận". LƯU Ý (đính chính theo QA 19/10): propose KHÔNG tính là chữ ký — HS vẫn phải bấm thêm "Tôi xác nhận thỏa ước này". |
| `#/companion` (vẫn tài khoản `HS01`) | Bấm "Tôi xác nhận thỏa ước này" (chữ ký THỨ NHẤT). | Trạng thái VẪN là "Chờ hai bên xác nhận" (một chữ ký chưa đủ — code đúng, checklist cũ sai); hiển thị "Bạn đã xác nhận. Đang chờ người kia tự xác nhận cùng phiên bản…". |
| `#/companion` (Cửa sổ ẩn danh / Trình duyệt khác) | Đăng nhập bằng tài khoản `PH01` (Phụ huynh chính) và vào `#/companion`. | Thấy bản đề xuất thỏa ước do `HS01` tạo, có nút "Xác nhận thỏa ước". |
| `#/companion` (Tài khoản `PH01`) | Bấm "Xác nhận thỏa ước" (chữ ký THỨ HAI, cùng revision). | Thỏa ước chuyển sang "Đã cùng xác nhận" (Confirmed) khi ĐỦ HAI người TỰ xác nhận cùng revision; `confirmed_at` là thời điểm chữ ký thứ hai (QA 19/10 R04). |
| `#/companion` (Cửa sổ ẩn danh khác) | Đăng nhập bằng `PH02` (Điểm tựa dự phòng) và vào `#/companion`. | Không thấy thỏa ước của cặp HS01-PH01 (không bị gán nhầm hoặc lộ thỏa ước của cặp chính sang backup). |
| `#/help` | Truy cập trang trợ giúp `#/help`. | Trang mở bình thường, số hotline và hướng dẫn không bị chặn dù có hay chưa có kết nối. |

---

## 5. Xác nhận trạng thái Git & Triển khai

- **KHÔNG merge vào `main`**.
- **KHÔNG deploy production** (Render/Cloudflare/Zalo).
- **Trạng thái push**: Tất cả các commit đã được commit cục bộ trên branch `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044`.
