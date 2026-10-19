# next-agent.md — cho agent tiếp tục sau đợt F07 này

> **Cập nhật 19/10/2026 (dated supersede theo quyết định Huy trong PROMPT-COPY-F07):** F07 phải có UI gọi backend thật trên CẢ web và Zalo Mini App. Phần web F07 đã triển khai trên nhánh này (`web/src/pages/mood/`, `web/src/pages/mood-shared/`, router, profile/home, tests). Xem `docs/handover/web-miniapp-separation/route-feature-parity.md` cho 2 route mới.

## Luồng auth đang dùng (đừng đoán lại)

- Mini App chính thức: login form class-session (`POST /api/v1/auth/class-session`,
  F16) → Bearer persisted (SessionIssuer F01, hash SHA-256, TTL, revoke).
  Zalo SDK login DORMANT — không bật lại trong F07.
- Backend session resolver mặc định: `family_bridge_core.sessions.
  resolve_identity_session` (fallback F01 identity session). f07 registry cho
  phép test đăng resolver riêng (labgrants) — production dùng fallback.

## Bản đồ owner (ngắn)

| Vùng | Owner | Ghi chú |
| --- | --- | --- |
| `f07_mood/**` + mobile F07 + docs F07 | F07 (nhánh này) | schema không đổi trong đợt này |
| `f07_mood/apps.py` wiring | F07 | đăng ký reader/provider/hook; đổi protocol phải cùng F01/F15 owner |
| `packages/family_bridge_shared/**` | lead phối hợp | 82 methods; mọi thay đổi cần contract test + mock + web regression |
| `zalo-mini-app/src/app/*`, main.js | lead mini app | route additive; không phá page contract |
| `web/**` | contributor web | **Supersede 19/10/2026 (Huy, USER-DECISION-WEB-PARITY): web được sửa TRONG PHẠM VI F07** trên nhánh F07 — pages `/mood`, `/mood-shared`, router/profile/home entry points, CSS mood reflow, textarea component, tests; vẫn bảo toàn phần web ngoài F07 và contributor changes. Mệnh đề "KHÔNG sửa web" dưới đây chỉ còn giá trị cho phần ngoài F07. |
| f01/f15/f02/f16 internals | owner tương ứng | chỉ đăng ký theo protocol công khai |

## Đang thiếu / ai phụ trách

1. **MySQL race thật** (create/share concurrent): test sẵn
   `tests/test_race_mysql.py` — cần môi trường MySQL (`FB_TEST_DB=mysql`) →
   Huy/Antigravity hoặc CI service container.
2. **Zalo device evidence**: checklist trong ANTIGRAVITY-DEPLOY-HANDOFF.md.
3. **Màn hẹp 320/430 + chữ 200%**: kiểm bằng thiết bị/emulator khi release.
4. **Deploy Testing**: đợi chỉ thị — xem ANTIGRAVITY-DEPLOY-HANDOFF.md.
5. Production backfill 50 cặp: KHÔNG liên quan code F07; thiếu DB access
   (theo bàn giao) — việc vận hành, không phải code.

## Chạy từ checkout sạch

```bash
git fetch origin
git checkout tinh-nang/f07-tam-trang-va-chia-se-us015-us026
pip install "Django>=5.2,<6" djangorestframework python-dotenv django-cors-headers
bash tests/feature-lab/scripts/test_feature.sh f07_mood   # 42 PASS, 2 skip MySQL
# E2E local: xem HUY-TEST-F07.md
```

## Điểm KHÔNG được làm

- Không merge/push main, không force-push, không deploy Render/Zalo, không đụng
  dữ liệu người thật (fixtures E2E chỉ đụng tài khoản `e2e:*` local).
- Không bật silent SDK login, không thêm auto-send/polling tự động, không
  đưa note/token vào log/URL/telemetry.
- Không "resurrect" grant: mọi phục hồi quyền phải qua hành động chia sẻ tường
  minh của owner với connection hiện hành.
- Không chép snapshot `sources/main/` trong gói ZIP lên checkout ứng dụng.
