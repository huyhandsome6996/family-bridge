# ANTIGRAVITY-DEPLOY-HANDOFF — Deploy Zalo Mini App Testing (2026-10-16)

Người viết: coding agent (Phần A + Phần B). Người THỰC HIỆN deploy:
**Antigravity** (theo phân công của Huy). Coding agent KHÔNG tự deploy Zalo.

## 1. Hai nguồn phát hành tách biệt

| Bản thử | Nguồn build | Phải chứa | Không được làm |
| --- | --- | --- | --- |
| A — Kết nối HS/PH | **exact main SHA `72930ae3fb6530235efa21d8f64b6ae3bd853af1`** (hoặc mới hơn nếu main đã được push có kiểm soát) | Login HS/PH hiện hành + đường đi home → đề xuất ghép đôi (Phần A). KHÔNG chứa F02 | Không tuyên bố bản này có chương trình bốn tuần |
| B — Trải nghiệm F02 | **exact head nhánh `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` = `ae837b33c62882452c9e235cbee2144e79cf97d9`** (hoặc mới hơn sau khi docs commit — lấy SHA thật khi fetch) | Phần A (vì main `72930ae` là ancestor) + F02 đầy đủ (wiring/thỏa ước/UI /companion) | Không tự merge F02 vào main chỉ để deploy; không deploy artifact main cũ rồi nói là F02 mới |

Khuyến nghị: deploy thẳng **bản B** (đã chứa phần A) để Huy test cả hai nhóm
tính năng trên một bản Testing. Nếu nội dung F02 chưa được thầy publish thì
bản B vẫn dùng được cho kết nối (Phần A) + chương trình hiển thị trung thực
"chưa có nội dung phát hành" — KHÔNG fake.

## 2. Thông tin build

- Repo: `https://github.com/huyhandsome6996/family-bridge`
- Thư mục build: `zalo-mini-app/` (KHÔNG build từ `web/`, không đụng web/Render)
- Node: dùng phiên bản đã kiểm chứng CI (22); lệnh:
  ```bash
  cd zalo-mini-app
  npm ci                 # theo lockfile, không upgrade
  npm test               # 305 test happy-dom phải PASS
  npm run build          # vite build + verify-build (Zalo app-config + manifest + assets)
  ```
- Env public build-time: `VITE_API_BASE_URL` trỏ backend thực đang phục vụ
  bản thử (hiện `https://family-bridge-backend.onrender.com`). KHÔNG đặt
  secret vào VITE_*.
- Mini App ID: `3411096375330044972`; đích **Testing**; description ghi nguồn
  (A/main hoặc B/F02) + short SHA + giờ Việt Nam. KHÔNG submit public review.

## 3. Backend mà bản F02 cần

- Backend đang chạy Render (production) CHƯA có code F02 phần B + migration
  `0002`. Build frontend từ nhánh F02 **không tự deploy backend**.
- Hành vi trung thực khi backend chưa có F02 mới: `/companion` gọi
  `/api/v1/program/*` → endpoint cũ không có agreement/agreement overview →
  404 → trang vẫn dùng được phần tuần/catalog nếu backend cũ có endpoint
  program (có); các nút thỏa ước sẽ báo lỗi thật (không fake success). Đây là
  hành vi chấp nhận được cho Testing; KHÔNG trỏ mock để né.
- Muốn F02 full: cần release backend có kiểm soát (merge F02 sau review +
  migrate `0002` + seed + publish nội dung) — outside scope của task này,
  owner backend quyết định.

## 4. Checklist trước/sau upload

Trước upload:
- [ ] `git fetch` — xác nhận head nhánh F02 vẫn là SHA ghi ở mục 1 (nếu đã
  đổi: kiểm tra diff, chạy lại `npm test` + `npm run build`, cập nhật mô tả).
- [ ] Working tree sạch, build từ commit (không code local chưa commit).
- [ ] Manifest/dynamic chunks đầy đủ (verify-build tự kiểm tra).
- [ ] Không credential trong bundle (CI đã scan; kiểm tra lại nếu build local).

Sau upload:
- [ ] Ghi lại version ID + deep link + QR của bản Testing VỪA deploy (không
  dùng QR version 2 cũ trong docs/zalo-hs-ph-release làm bằng chứng bản mới).
- [ ] Mô tả rõ nguồn A/main hay B/F02 trong biên bản của Antigravity.
- [ ] Báo lại Huy: SHA đã build, version ID, cách test (checklist ở
  `docs/handover/f02-four-week-program/handover.md` mục 6 và
  `docs/handover/hs-ph-connection-part-a/report.md`).

## 5. Rollback

- Rollback Zalo: upload lại bản Testing trước đó (version đã lưu ở mục 4)
  hoặc build lại từ main `4884c83` (bản cũ trước Phần A nếu cần).
- KHÔNG reset database/tài khoản/consent; không tự hủy kết nối người dùng đã
  xác nhận; không drop data.

## 6. Trạng thái bằng chứng của coding agent

- **"Đã chuẩn bị bàn giao Antigravity, CHƯA deploy Zalo"** — coding agent
  không upload bản mới; mọi version/QR mới chỉ do Antigravity ghi sau khi
  upload + xác minh thành công.
- Zalo device test: NOT_RUN (không có thiết bị/runtime trong task này).
