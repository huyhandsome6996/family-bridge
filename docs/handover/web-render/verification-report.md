# Verification report — Web Render Task 2 (M5b + M6)

Nhánh: `tinh-nang/web-render-task2`. Báo cáo kiểm chứng **trung thực**: chỉ ghi
những gì đã chạy thật trong repo; phần chưa chạy liệt kê ở NOT_RUN.

## 1. Đã chạy (commands + kết quả)

| Hạng mục | Lệnh | Kết quả |
| --- | --- | --- |
| Suite web/miniapp | `cd zalo-mini-app && npm test` | **274/274 PASS** (47 suites; gồm M3/M4/M5a/M5b + QA; tăng từ 245 đầu M5b: +12 settings, +9 privacy, +1 pin profile cập nhật, +7 qa-web-invariants) |
| Build production | `cd zalo-mini-app && npm run build` | **OK** (`vite build` + `verify-build.mjs`, output `www/`) |
| Blueprint spec | parse YAML `render.yaml` | **OK** — 2 services: `family-bridge-backend` (docker), `family-bridge-web` (static) |
| Secret scan | `grep -rE "FamilyBridge2026|ghp_[A-Za-z0-9]+" zalo-mini-app/src docs/render*.md render.yaml` | **0 matches** |
| Whitespace | `git diff --check` | **sạch** |
| Docs guard | `python scripts/check_agent_docs.py` | **PASS** (liên kết local resolve; không đổi registries DEC/CAP/WF) |
| QA bất biến web | `node --test zalo-mini-app/tests/qa-web-invariants.test.mjs` | **PASS** (banned CDN/CDN-font/googleusercontent; không setInterval trong file web mới; .env.example sạch; render.yaml có static service + VITE_API_BASE_URL sync:false; icon-only button có aria-label; cấm "Đã gửi/Đã lưu/Đã chia sẻ" trong 7 trang web) |

## 2. Phạm vi M5b đã kiểm tự động

- `#/settings`: đổi mật khẩu gửi đúng body hợp đồng; success đếm
  `sessions_revoked_other` từ máy chủ; 403 reauth_failed → "Mật khẩu hiện tại
  chưa đúng."; weak_password → render `details.messages`; same_password copy;
  404 hoặc capabilities `change_password=false` → thẻ DISABLED "chưa được bật
  trên máy chủ" (không fake success); đổi mã → "Đã đổi mã đăng nhập thành {code}.";
  lỗi định dạng/trùng mã inline; đổi tên không cần mật khẩu; 401 → login redirect.
- `#/privacy`: revoke qua dialog confirm → `revokeGrant` đúng tham số → refetch;
  empty state trung thực; tạo yêu cầu xóa (≥1 phạm vi) + biên nhận một lần;
  hủy yêu cầu (`expectedRevision`, 409 → refetch, không tự retry); nhãn trạng
  thái Vietnamese đúng `DeletionRequest.STATUSES`; rút đồng ý theo purpose +
  copy hậu quả; cấm over-claim ("Đã gửi/Đã lưu/Đã chia sẻ/xóa sạch").

## 3. NOT_RUN — chưa kiểm chứng, owner cần làm

| Hạng mục | Lý do NOT_RUN |
| --- | --- |
| Apply Blueprint service `family-bridge-web` trên Render thật | không có quyền Render Dashboard (chỉ owner Huy) |
| Set `VITE_API_BASE_URL` + `VITE_TEST_LABEL` thật | env thật nằm trên Dashboard (`sync:false`) |
| CORS thật từ origin web → backend | cần origin thật sau khi apply + sửa `CORS_ALLOWED_ORIGINS` |
| MySQL/TiDB thật cho luồng ghi (đổi mật khẩu/mã, privacy) | suite backend MySQL-gated đã skip; không có DB thật trong đợt này |
| Thiết bị Zalo thật (webview trong mini app host) | chưa có thiết bị; web desktop đã kiểm bằng happy-dom |
| Đăng nhập thật bằng mã lớp provisioned | cần backend thật + dữ liệu Task 1 |
| Bật `autoDeployTrigger` sau verify | chờ owner verify lần đầu theo checklist |

## 4. Rủi ro còn mở

- Cold start backend free tier ~1 phút — UI đã có copy + timeout 60s, nhưng
  trải nghiệm lần đầu phụ thuộc owner bật service đúng thứ tự checklist.
- Nếu owner quên thêm origin web vào `CORS_ALLOWED_ORIGINS`, mọi API từ site
  web sẽ bị chặn CORS — hiện rõ ngay ở bước đăng nhập (không fallback giả).
