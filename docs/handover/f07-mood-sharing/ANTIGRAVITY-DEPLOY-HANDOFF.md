# ANTIGRAVITY-DEPLOY-HANDOFF — F07 (chỉ khi có chỉ thị deploy)

Trạng thái: **KHÔNG tự deploy trong đợt này** (đúng giới hạn bàn giao). Tài
liệu này là checklist cho Antigravity/Huy khi được duyệt deploy Testing.

## Source & schema

- Nhánh: `tinh-nang/f07-tam-trang-va-chia-se-us015-us026` — head xem
  `git rev-parse HEAD` sau merge PR (không suy từ docs).
- **Không có migration mới** (schema F07 không đổi) — deploy an toàn về schema.
- Wiring mới chạy tại Django startup (`apps.py ready()`): KHÔNG cần bước thủ
  công; nếu F15/F01 thiếu trong build, F07 sharing fail-closed (503/404) —
  không âm thầm mở quyền.

## Env cần có trên Render Testing (names, không giá trị)

- `DJANGO_ENV`, `DJANGO_SECRET_KEY` (≥50 ký tự), `DJANGO_ALLOWED_HOSTS`,
  `MYSQL_*` (đã có sẵn theo blueprint hiện hành).
- Không thêm biến mới nào cho F07; KHÔNG đặt secret vào VITE_*.
- Mini App build: `VITE_API_BASE_URL` trỏ backend Testing; label thử nghiệm
  tùy chọn `VITE_TEST_LABEL` + `VITE_MANUAL_LOGIN_TEST=1` chỉ cho build test
  đăng nhập thủ công (không dùng cho release công khai).

## Thứ tự deploy đề xuất

1. Merge PR F07 vào main sau review (người thật merge, không auto).
2. Deploy backend Testing → `/api/v1/health/`, `/api/v1/ready/` 200.
3. Chạy smoke: `python3 scripts/f07_local_e2e.py --base https://<testing-host>`
   (fixture script phải trỏ DB Testing và chỉ tạo tài khoản E2E riêng —
   KHÔNG chạy fixtures trên DB production).
4. Build Mini App Testing → upload Zalo theo quy trình hiện hành của
   Antigravity (không đổi app-config ngoài base URL).
5. Device test theo HUY-TEST-F07.md (Android/iOS thật, safe-area, keyboard VI).

## Kiểm tra sau deploy (checklist)

- [ ] HS tạo mục hôm nay → dữ liệu MySQL (không SQLite), entry_date đúng ngày VN.
- [ ] Hai request tạo trùng ngày đồng thời → 1 row, loser 400 (MySQL thật).
- [ ] Share → PH đọc → revoke từ thiết bị khác → mở lại bị chặn.
- [ ] F15 overview thấy grant mood; revoke từ đó chặn F07.
- [ ] Connection admin_provisioned (invite NULL) share/đọc được.
- [ ] Log không chứa note/token (SEC-22/27).

## Rollback

- Không migration → revert image backend về commit trước là đủ; client build
  Testing revert bằng bundle cũ. Grant/ledger không mất (không đổi schema).
