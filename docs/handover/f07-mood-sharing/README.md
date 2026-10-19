# Bàn giao F07 — Ghi nhận tâm trạng, lịch sử và chia sẻ từng mục (US-015/US-026)

Ngày: 18/10/2026 (UTC+7). Nhánh: `tinh-nang/f07-tam-trang-va-chia-se-us015-us026`.
Draft PR vào `main` kèm theo nhánh này (không merge, không deploy).

## Trạng thái thật (ngắn)

- 8 lỗi nghi vấn trong bàn giao được **tái hiện bằng test trên baseline** trước
  khi sửa, sau đó vá nguyên nhân và khóa bằng regression test (backend 42 PASS
  trên SQLite harness; 2 case race MySQL-gated NOT_RUN).
- Wiring production còn thiếu đã lắp: ConnectionReader (F01 thật), F15 grant
  provider `mood_entry` + hook xóa `mood` — đăng ký tại `apps.py ready()`.
- Mini App chính thức có đường đi thật: `/mood` (người viết) và `/mood-shared`
  (người nhận), qua shared adapter (8 method mới, 74→82) gọi API Django thật.
- E2E HTTP thật cục bộ: 21/21 PASS (`scripts/f07_local_e2e.py`).
- UI trình duyệt thật (Vite + API local, 2 tài khoản): ghi nhận → chia sẻ qua
  preview/xác nhận → người nhận đọc → thu hồi từ "thiết bị khác" → lần đọc mới
  bị chặn và nội dung cũ gỡ khỏi màn. 7 ảnh trong thư mục này (ảnh chụp có
  nội dung synthetic "E2E", không dữ liệu người thật).
- **Chưa chạy (NOT_RUN trung thực):** MySQL/TiDB concurrency thật, Zalo thiết bị
  thật, deploy Render. Xem `verification-report.md`.

## Thứ tự đọc

1. `README.md` (file này) — trạng thái, cách chạy, những gì đã/không đã kiểm.
2. `reading-map.md` — nguồn đã đọc, yêu cầu → test map.
3. `team-and-ownership.md` — báo cáo agent thực tế (không bịa), phạm vi file.
4. `architecture-and-contracts.md` — call path, payload shape, thay đổi contract.
5. `privacy-lifecycle.md` — riêng tư mặc định, preview/re-share/revoke/unlink/reconnect, cache/UI timing.
6. `review-rounds.md` — từng lỗi: tái hiện → nguyên nhân → vá → bằng chứng rerun.
7. `verification-report.md` — ma trận nghiệm thu F07-01..F25 + lệnh + môi trường.
8. `branch-compatibility-report.md` — refs, sync main, phạm vi diff, consumer.
9. `HUY-TEST-F07.md` — bước tự kiểm tra cho Huy (fixture synthetic, không secret).
10. `ANTIGRAVITY-DEPLOY-HANDOFF.md` — những gì Antigravity cần khi có lệnh deploy.
11. `next-agent.md` — kiến thức cần để tiếp tục, điểm cấm.

## Cách chạy cục bộ từ checkout sạch

```bash
# 0) backend (SQLite local — không phải bằng chứng MySQL)
cd backend
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py migrate

# 1) fixture synthetic (3 tài khoản E2E + connection admin_provisioned)
DJANGO_ENV=development DB_ENGINE=sqlite python ../scripts/f07_local_fixtures.py

# 2) chạy server + E2E (21 bước PASS/FAIL in ra màn hình)
DJANGO_ENV=development DB_ENGINE=sqlite python manage.py runserver 127.0.0.1:8000
python3 scripts/f07_local_e2e.py --base http://127.0.0.1:8000

# 3) test suites
bash tests/feature-lab/scripts/test_feature.sh f07_mood          # backend module
node --test packages/family_bridge_mobile/f07_mood/tests/*.test.mjs
node --test packages/family_bridge_shared/tests/*.test.mjs
cd zalo-mini-app && npm ci && npm test && npm run build

# 4) Mini App thật gọi API local
cd zalo-mini-app
VITE_API_BASE_URL=http://127.0.0.1:8000 VITE_MANUAL_LOGIN_TEST=1 npm run start
# → mở http://localhost:3000/#/login, đăng nhập HSZE2E01 / mật khẩu fixture
```

Mật khẩu fixture nằm trong `scripts/f07_local_fixtures.py` (chỉ dùng cho tài
khoản synthetic E2E local, không phải secret người thật).

## Giới hạn

- SQLite local + harness: không thay bằng chứng MySQL/TiDB (race, unique index,
  locking). Các case MySQL-gated skip có lý do rõ.
- Trình duyệt không thay thiết bị Zalo thật (SDK, safe-area, keyboard).
- Production Render chưa chạy lại bằng chứng nào trong đợt này.
