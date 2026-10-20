# F11 / F12 — Chẩn đoán trên môi trường Render (Giai đoạn 0–1)

- Ngày: 2026-10-20 · Nhánh: `tinh-nang/f11-f12-render-fix` (cắt từ `origin/main` `73bf129`)
- Người lập: PM agent · Đóng góp: QA agent (`docs/F11-F12-qa-report.md`)
- Phạm vi: F11 Điểm tựa dự phòng (US-022/US-035), F12 Hỗ trợ nhà trường & lịch hẹn (US-038/US-046)
- Tài liệu áp dụng: `AGENTS.md`, `docs/project-scope.md`, `docs/engineering/dsa-rules.md`,
  `docs/security/security-rules.md`, `docs/product/admin-capabilities.md` (CAP-09/CAP-10),
  `docs/product/access-sharing-matrix.md` (R-STAFF), `docs/engineering/workflow-rules.md`.

> Trạng thái: **Giai đoạn 1 — chẩn đoán từ code + probe production không đăng nhập.**
> Kiểm thử end-to-end có đăng nhập trên Render CHƯA chạy (chờ tài khoản test qua agent secrets).
> Không có kết luận nào dưới đây dựa trên đoán; mỗi dòng có bằng chứng.

## 1. Bản đồ tính năng

| Tính năng | Frontend (web) | API endpoint | Backend | DB / bảng |
|---|---|---|---|---|
| F11 | `web/src/pages/supporters/index.js` (route `#/supporters`, `web/src/app/router.js:45`) | `/api/v1/supporters/roles[/<id>[/respond\|revoke\|contact]]`, `/api/v1/supporters/commitments` | `packages/family_bridge_features/f11_supporters/` + `F11InviteConnector` (`backend/core/wiring.py`) | `f11_supporters_*`, `f01_identity.Connection` |
| F12 | `web/src/pages/appointments/index.js` (route `#/appointments`, `router.js:46`) | `/api/v1/appointments/directory`, `/requests[/<id>[/claim\|slots\|.../accept\|decline\|cancel\|complete]]`, `/queue` | `packages/family_bridge_features/f12_appointments/` + `ProductionStaffDirectory`, `ProductionSchoolDirectory` (`backend/core/wiring.py`) | `f12_appointments_*`, `admin_core.AdminCapabilityGrant` |

## 2. Giả thuyết và kết quả

| # | Giả thuyết | Kết luận | Bằng chứng |
|---|---|---|---|
| D-01 | Frontend gọi `localhost` / thiếu `VITE_API_BASE_URL` | **Loại trừ** | Bundle production `assets/index-B7WgjvvI.js` chứa `https://family-bridge-backend.onrender.com`; `localhost` chỉ xuất hiện trong whitelist cho phép http khi dev |
| D-02 | Mixed content HTTP/HTTPS | **Loại trừ** | Client từ chối base URL không phải HTTPS (cùng đoạn bundle) |
| D-03 | SPA thiếu rewrite khi refresh | **Loại trừ** | Hash router (`#/…`), `render.yaml` ghi rõ không cần rewrite; refresh mất token là hành vi SEC-10 có chủ đích |
| D-04 | Route F11/F12 chưa đăng ký ở frontend | **Loại trừ** | `router.js:45-46`, tile ở `pages/home/index.js:622-636, 877-891` |
| D-05 | Backend không chạy / không đọc `$PORT` | **Loại trừ** | `GET /api/v1/health/` 200, `/api/v1/ready/` 200; `Dockerfile` bind `0.0.0.0:${PORT}` |
| D-06 | Endpoint F11/F12 không tồn tại trên production | **Loại trừ** | Mọi route F11/F12 trả **401 `not_authenticated`** (không phải 404) khi không có token |
| D-07 | Test tự động đỏ | **Loại trừ** | Local `main@73bf129`: feature-lab F11+F12 34/34 OK (`FB_FEATURES=f11_supporters,f12_appointments`), web 331/331 pass. SQLite only — MySQL chưa chạy |
| D-08 | **F12: không thể cấp quyền CAP-10 `appointment.handle` qua admin API → mọi lệnh gọi F12 trả 503 `scheduling_no_staff`** | **Xác nhận (code)** — chờ xác nhận runtime bằng tài khoản HS | `admin_core/models.py:44` `KNOWN_CAPABILITIES` không có `appointment.handle`/`appointment.assign`; `admin_core/admin.py:73` và `admin_core/api.py:191` từ chối capability lạ. `f12_appointments/services/appointments.py:41-45,101,142,148` chặn tạo/list/queue khi không có handler |
| D-09 | **F12 web đọc sai trường lỗi → không hiển thị thông báo trung thực "chưa có nhân sự"** | **Xác nhận (code)** | `web/src/pages/appointments/index.js:110,366` đọc `e.data.reason`; `ApiError` (`packages/family_bridge_shared/src/api/client.mjs:13-24`) chỉ có `code`/`details`; backend trả `{"error":{"code":"module_unavailable","details":{"reason":"scheduling_no_staff"}}}`. Các trang khác đọc `details.reason` (mood, settings, login) |
| D-10 | **Lỗ hổng phạm vi: staff lookup bỏ qua scope của grant** | **Xác nhận (code)** | `backend/core/wiring.py:84-110` lọc theo capability, không xét `scope_type/scope_ref`; tài liệu yêu cầu CAP-10 "assigned + school match" (`admin-capabilities.md` CAP-10, `access-sharing-matrix.md` R-STAFF). `queue_for_handler` trả mọi request `submitted` không lọc trường |
| D-11 | Web nuốt lỗi directory/queue thành danh sách rỗng | **Xác nhận (code)** | `appointments/index.js:108,115` `.catch(() => [])` — lỗi mạng/cold start hiển thị như "không có dữ liệu" |
| D-12 | F12 directory production chỉ có 1 liên hệ hardcode | **Xác nhận — theo thiết kế MVP**, không sửa trong đợt này | `backend/core/wiring.py:113-130` (`sch-counselor-01`) |
| D-13 | Backend production chạy code cũ hơn `main` | **Chưa rõ** | `render.yaml` backend `autoDeployTrigger: 'off'`; không có endpoint version. Cần user xác nhận commit deploy trên dashboard |
| D-14 | F11 lỗi trên production | **Chưa rõ** | Không thấy lỗi ở code/test; F11 cần kết nối F01 ACTIVE giữa HS và người hỗ trợ — chờ E2E |

## 3. Nguyên nhân gốc (theo mức độ chắc chắn)

1. **D-08 (cao):** F12 bị khóa vĩnh viễn trên production vì không cách nào cấp CAP-10 qua API có audit → gate trung thực trả 503 cho mọi người dùng.
2. **D-09 + D-11 (cao):** Web không phản ánh đúng trạng thái đó — hiện form đặt lịch đang bật + lỗi chung chung, hoặc danh sách rỗng giả.
3. **D-10 (cao, bảo mật):** Nếu chỉ sửa D-08, staff của trường A sẽ thấy hàng đợi trường B → phải sửa cùng lúc (quyết định của user 2026-10-20).
4. **D-13 / D-14 (chưa rõ):** cần E2E có đăng nhập + thông tin deploy.

## 4. Quyết định của user (2026-10-20)

- Nhánh `tinh-nang/f11-f12-render-fix` (theo quy ước AGENTS.md 2026-10-15, thay cho `fix/f11-f12` trong prompt).
- Sửa code: cho phép cấp CAP-09/CAP-10 qua admin API **và** thực thi school scope trong cùng PR.
- Sửa web F12 đọc đúng `details.reason` trong cùng PR.
- User tự deploy thủ công trên Render và chia sẻ log.

## 5. API contract

Hợp đồng cho Giai đoạn 2: `docs/F11-F12-api-contract.md` (cùng nhánh).
