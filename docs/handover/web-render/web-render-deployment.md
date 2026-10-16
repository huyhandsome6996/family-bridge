# Web Render — triển khai static service `family-bridge-web` (Task 2, M6)

> **SUPERSEDE 2026-10-16 (web-miniapp-separation):** web Render giờ build từ ứng dụng web độc lập `web/` (`buildCommand: cd web && npm ci && npm run build`, publish `web/dist`) — **không còn** build từ codebase `zalo-mini-app`. Các phần mô tả "một codebase duy nhất, không dựng frontend thứ hai" dưới đây chỉ còn giá trị lịch sử/rollback. Cấu hình mới, biến môi trường, CI job `web` và rollback: xem `docs/handover/web-miniapp-separation/deployment.md`.

Nhánh: `tinh-nang/web-render-task2`. Tài liệu này bàn giao phần **triển khai web
Render** của Task 2: một static service Render phục vụ build Vite của
`zalo-mini-app` (một codebase duy nhất, không dựng frontend thứ hai).

**Cập nhật vận hành 16/10/2026:** PR #36 đã merge; website Render đã Live và
đăng nhập HS001 qua API thật tới màn consent. Frontend tự deploy mỗi commit
main sau lần kiểm chứng này; backend vẫn deploy có kiểm soát khi đổi schema.
Xem [biên bản phát hành](release-review-2026-10-16.md) để lấy bằng chứng thực.
Các mục NOT_RUN/checklist bên dưới là bàn giao lịch sử trước lần triển khai.

> [!IMPORTANT]
> **Điều kiện chưa có (NOT_RUN)**: chưa apply Blueprint lần nào cho service web,
> chưa set `VITE_API_BASE_URL` trên Dashboard, chưa sửa CORS backend, chưa verify
> từ site thật. Mọi bước bên dưới là việc của **owner (Huy)** — không agent nào
> tự tuyên bố "đã deploy".

---

## 1. Topology

```
Kho code (main) ── Render Blueprint (render.yaml)
   ├── family-bridge-backend  (docker,  /api/v1/*)  → https://family-bridge-backend.onrender.com
   └── family-bridge-web      (static, zalo-mini-app/www) → https://family-bridge-web.onrender.com
```

- **Một codebase duy nhất**: `zalo-mini-app` build Vite ra `zalo-mini-app/www`
  (`base: "./"`, hash router `#/route`). Cùng một app đóng gói cả Zalo Mini App
  (submit qua zmp-cli) và static web.
- **Hash router → KHÔNG cần SPA fallback**: mọi deep link (`#/mailbox`,
  `#/messages/{id}`…) luôn load `/index.html` rồi router client-side điều hướng.
  Render chỉ phục vụ file tĩnh; không khai báo rewrite nào.
- **runtime: static** — không có process server, không health check path; hợp
  gói Free. Backend vẫn là Docker service như trước (không đổi).
- **Phiên in-memory (SEC-10)**: token chỉ nằm trong bộ nhớ tab; reload = đăng
  nhập lại. Không thêm storage/cookie phía web.
- **Không Tailwind CDN / font CDN**: CSS + font Be Vietnam Pro bundle local
  (bất biến kiểm bởi `zalo-mini-app/tests/qa-web-invariants.test.mjs`).

## 2. Env vars của service web (build-time)

| Biến | Giá trị | Ghi chú |
| --- | --- | --- |
| `NODE_VERSION` | `22.12.0` | khớp `engines` của `zalo-mini-app/package.json` |
| `VITE_API_BASE_URL` | owner set trên Dashboard (`sync: false`) | ví dụ `https://family-bridge-backend.onrender.com` — nhúng vào bundle lúc build, phải HTTPS, không có dấu `/` cuối. KHÔNG bao giờ commit giá trị thật. |
| `VITE_TEST_LABEL` | tùy chọn (`sync: false`) | nhãn hiển thị trên màn đăng nhập khi chạy đợt kiểm thử |

Không có env runtime — static site không chạy server. Đổi `VITE_*` phải build
lại (Manual Deploy) mới có hiệu lực.

## 3. OWNER CHECKLIST — thứ tự bắt buộc

1. **Apply Blueprint service web**: Render Dashboard → Blueprint → "Apply" để
   tạo `family-bridge-web` (service backend hiện có KHÔNG bị đụng tới).
2. **Set `VITE_API_BASE_URL`** = `https://family-bridge-backend.onrender.com`
   (Dashboard → family-bridge-web → Environment).
3. **CORS backend**: Dashboard → family-bridge-backend → Environment →
   `CORS_ALLOWED_ORIGINS` thêm `https://family-bridge-web.onrender.com`
   (danh sách phân tách bằng dấu phẩy, **không wildcard**).
4. **Deploy thủ công lần đầu**: nút "Manual Deploy" trên family-bridge-web.
   `autoDeployTrigger: 'off'` giữ nguyên ở lần đầu để có cơ hội kiểm tra trước
   khi bật deploy tự động.
5. **Verify từ site thật**:
   - Mở `https://family-bridge-web.onrender.com` → `#/login`.
   - Đăng nhập bằng mã lớp + mật khẩu thật (tài khoản provision từ Task 1).
   - Vào `#/settings` đổi tên hiển thị → máy chủ xác nhận.
   - Vào `#/privacy` → overview tải được (không lỗi CORS).
6. **Bật autoDeploy** (nếu muốn): sau khi verify sạch, đổi
   `autoDeployTrigger: 'off'` → deploy trên push main. Ghi lại ngày bật vào
   `verification-report.md` của đợt.

## 4. Rollback

- Render static service giữ các deploy cũ: Dashboard → "Events" → chọn deploy
  trước đó → "Restore". Vì asset là bất biến (`/assets/*` cache 1 năm, immutable)
  và `index.html` `no-cache`, restore là cách quay lại an toàn.
- Mã nguồn quay về bằng git: revert commit trên `main` + Manual Deploy.
- Không cần rollback backend cho thay đổi web (hai service độc lập).

## 5. Cold start & giới hạn

- **Backend Render Free có cold start ~1 phút**: lần request đầu sau một lúc
  không traffic sẽ chậm; UI web đã dùng timeout 60s cho các call đầu (login,
  capabilities, health/ready, profile) và hiển thị copy "máy chủ có thể đang
  khởi động". Static web KHÔNG cold start (file tĩnh).
- Free static service giới hạn băng thông/build theo plan Render; theo dõi
  Dashboard → Metrics.

## 6. Tóm tắt ADR

| Quyết định | Lý do |
| --- | --- |
| Một codebase `zalo-mini-app` cho cả web + mini app | tránh phân mảnh UI/adapter; một bộ test node:test |
| Hash router, không SPA fallback | webview Zalo an toàn + static hosting không cần cấu hình rewrite |
| `runtime: static`, không Docker | không có process server nào cần chạy; free plan |
| Phiên in-memory (SEC-10) | không thêm bề mặt lưu trữ token phía web; reload = logout |
| Không Tailwind CDN / font CDN | không phụ thuộc CDN bên ngoài; bundle local, kiểm tự động |
| buildCommand không chứa `npm test` | tests chạy ở CI `ops/ci/tests.yml` (job miniapp); deploy static không nhân đôi phê duyệt |
| `autoDeployTrigger: 'off'` ban đầu | owner verify thủ công lần đầu trước khi bật tự động |

## 7. Kiểm chứng (trung thực)

Đã kiểm tra trong repo: `render.yaml` parse YAML hợp lệ, 2 service; suite
`zalo-mini-app` node:test toàn xanh (274/274 tại commit M6); `npm run build`
thành công. Chưa kiểm tra (NOT_RUN): apply Blueprint thật, giá trị env thật,
CORS thật, MySQL, thiết bị Zalo — ghi trong
`docs/handover/web-render/verification-report.md`.
