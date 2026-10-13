# F01 — Đăng nhập Zalo & kết nối hai phía: bàn giao (Agent Lead, 2026-10-13)

## 1. Branch, baseline, PR

- Repo: https://github.com/huyhandsome6996/family-bridge
- Nhánh làm việc: `feat/f01-zalo-connections` (KHÔNG tạo nhánh mới; không force push).
- Baseline: nhánh cũ `c134c70` là ancestor của main → đã **fast-forward** lên
  `origin/main` = `0253595` rồi commit thay đổi lên trên (xem head SHA trong PR).
- PR về main: (điền URL khi mở PR — chỉ một PR, không mở trùng; PR #6 cũ đã
  CLOSED và base khác nên không tính).
- Không merge nhánh `review/full-product-integration` (W036 của Antigravity).

## 2. Bản đồ hiện trạng trước khi sửa (đã kiểm chứng bằng code, không đoán)

- Backend: đủ endpoint F01 (`auth/session`, `auth/logout`, `consents`,
  `connections/invites*`, `connections`, `connections/{id}/revoke`) đã mount thật
  trong `backend/config/urls.py` (khác mô tả cũ "chưa đăng ký" trong
  `docs/features/integration/report.md` — bất nhất đã ghi).
- LỖI LỚN NHẤT của verifier cũ `services/zalo_provider.py`: gửi `access_token`
  trong **query string**, **không gửi appsecret_proof**, `app_secret` chưa dùng.
- `services/identity.py` cũ: provider HTTP call nằm TRONG `@transaction.atomic`
  (vi phạm WF-11); đăng nhập đồng thời lần đầu có thể IntegrityError → 500.
- Frontend `zalo-mini-app`: chưa import zmp-sdk; `zalo-adapter` ném 501 cho
  `getConnectionStatus`/`getProfile`; chưa có màn login/consent/connect.
- `packages/family_bridge_mobile/f01_identity`: UI tham khảo tồn tại nhưng KHÁC
  contract (innerHTML, setInterval 30s, ApiError code-model) — KHÔNG port
  nguyên trạng; chỉ dùng làm tham chiếu luồng.

## 3. Đã làm (files thay đổi)

Backend (không đụng models.py/migrations/invites.py — khu W036 của Antigravity):

- `packages/family_bridge_features/f01_identity/services/zalo_provider.py`
  - Gọi `GET https://graph.zalo.me/v2.0/me?fields=id` với **headers**
    `access_token` + `appsecret_proof` (HMAC-SHA256 hex của token với secret).
  - Token KHÔNG còn nằm trong URL. Chỉ host allowlist (`graph.zalo.me`,
    `oauth.zalo.me`), HTTPS bắt buộc, timeout 10s, giới hạn 16KiB,
    redirect bị chặn nếu đích không thuộc allowlist
    (`_AllowlistedRedirectHandler`).
  - Phân loại lỗi: `-216`→wrong_app_id (400); `-100/-102/-212/-213` và
    **`452` (live-verified 2026-10-13: session key invalid/revoked)** →
    token_invalid_or_expired (401); còn lại → provider_rejected (401);
    HTTP lỗi có JSON error → vẫn đọc body giới hạn để map; không thể đọc →
    provider_unreachable (503).
- `packages/family_bridge_features/f01_identity/services/identity.py`
  - Tách provider call RA KHỎI transaction (WF-11): verify → `_resolve_user`
    (transaction ngắn, bắt `IntegrityError` khi mất race và re-fetch user
    thắng — không trùng user, không 500) → `_issue_session` (transaction riêng).
- `packages/family_bridge_features/f01_identity/tests/test_identity_session.py`
  - +8 test: shape request (headers/token-không-vào-URL), proof = HMAC-SHA256
    hex đúng secret, secret khác → proof khác, fail-closed thiếu credentials,
    452 live-verified mapping, 0 DB query trong lúc gọi provider (WF-11),
    concurrent first login recovery (mô phỏng miss-read + IntegrityError),
    giữ nguyên 46 test cũ (helper mới đọc token từ header).
- `backend/.env.example`: thêm `ZALO_APP_ID=`, `ZALO_APP_SECRET=` (placeholder).

Frontend (`zalo-mini-app/`):

- `src/core/session.js` (mới): phiên **in-memory only** (token, userId,
  expiresAt, consentsRequired) — KHÔNG storage; `clearSession()` khi logout/401.
- `src/core/policy.js` (mới): mục đích đồng ý + phiên bản chính sách
  (`service-v1`, `ai-v1`, `research-v1`); service bắt buộc, 2 mục còn lại tùy chọn.
- `src/core/api/client.mjs`: ApiError thêm `code`/`details` đọc từ envelope
  `{"error":{"code","details"}}` (giữ nguyên hợp đồng `kind` cũ — backward compatible).
- `src/core/adapter/zalo-adapter.js`: +12 method F01:
  `loginWithZaloToken` (assertZaloHost → dynamic import zmp-sdk →
  getAccessToken → POST /auth/session → setSession), `trySilentLogin`
  (một lần/launch, không lặp), `logout`, `listConsents`, `recordConsent`,
  `createInvite`, `listInvites`, `claimInvite`, `confirmInvite`
  (optional expected_revision), `declineInvite`, `cancelInvite`,
  `listConnections`, `revokeConnection`. Mọi call authed tự clearSession khi 401.
  zmp-sdk chỉ import động trong adapter này, chỉ trong Zalo thật.
- `src/core/adapter/mock-adapter.js`: cùng method surface cho demo (?demo=1),
  dữ liệu fixture có nhãn, mã demo cố định `DEMODEMO1234` cho luồng claim.
- `src/core/adapter/adapter.js`: `ADAPTER_METHODS` mở rộng (tên tránh regex
  auto-send của QA).
- `src/app/router.js`: +3 route `/login`, `/consent`, `/connect`.
- Pages mới:
  - `src/pages/login/index.js` (`f01-login`): giải thích → đang đăng nhập →
    thành công/thất bại/thử lại; ngoài Zalo hiện hướng dẫn mở trong Zalo
    (KHÔNG login giả); banner `?reason=expired|logged-out`; đã có phiên → đi tiếp.
  - `src/pages/consent/index.js` (`f01-consent`): 3 checkbox KHÔNG precheck;
    service bắt buộc mới mở nút; khôi phục đúng trạng thái đã chấp nhận cùng
    phiên bản; ghi sổ cái chỉ khi thay đổi so với server; lỗi có Thử lại.
  - `src/pages/connect/index.js` (`f01-connect`): tạo mã (hiện MỘT lần + hạn
    từ server), nhập mã (filter bảng mã, sai/hết hạn báo rõ), danh sách lời
    mời + hủy/từ chối/xác nhận (theo vai trò thật của API), kết nối đang hoạt
    động + hủy kết nối qua dialog destructive, Làm mới THỦ CÔNG (không polling),
    chống double-click, mất response sau ghi → báo "chưa xác định" + làm mới.
- Pages cập nhật: `home` (production: chưa đăng nhập → mời login; đã đăng nhập
  → listConnections thật; lỗi → ErrorState, KHÔNG fallback mock; demo giữ
  nguyên fixture), `profile` (trạng thái đăng nhập + Đăng xuất qua dialog +
  Quản lý kết nối), `how-to-use` (bước 1 = đăng nhập, bước 2 = mã mời thật),
  giữ nguyên `welcome`/`help` (trợ giúp luôn truy cập được khi chưa đăng nhập).
- `src/main.js`: silent re-login MỘT lần khi mở lại app trong Zalo thật.
- `zalo-mini-app/.env.example`: `APP_ID=3411096375330044972` (Mini App ID —
  KHÁC Zalo App ID cha `3813524408107862261` phía backend), 
  `VITE_API_BASE_URL=https://family-bridge-backend.onrender.com`.
- Tests: `tests/f01-flows.test.mjs` (25 test mới) + `tests/pages.test.mjs`
  cập nhật contract 14 pages + 4 test home production mới.

## 3b. Đợt sửa theo review (PR #26 — 2026-10-13, sau head 968d418)

Reviewer đã chỉ 5 lỗi; tất cả đã sửa kèm test tái hiện. Phạm vi vẫn tránh
`models.py`, `migrations/`, `services/invites.py` (khu W036 của Antigravity).

1. **XÁC NHẬN ĐÚNG NGƯỜI** — hai bên kiểm tra được ai trước khi chấp nhận/
   xác nhận/hủy kết nối:
   - Backend MỚI (view-layer, không đụng models): `GET/PUT /api/v1/auth/me`
     (tên gọi TỰ KHAI BÁO lưu vào cột `auth_user.first_name` có sẵn — không
     migration); `POST /api/v1/connections/invites/preview` — đọc mã
     read-only để xem ai tạo mã TRƯỚC khi đồng ý (dùng chung budget rate
     limit với claim, cùng mã lỗi anti-enumeration).
   - Mọi read trả thêm `counterpart: {display_name, identity_basis:
     "self_declared"}` (không UUID, không provider_subject; batch 1 query).
   - Frontend: thẻ "Tên gọi của bạn" (nhãn rõ không phải Zalo xác minh);
     nhập mã 2 bước (Kiểm tra mã → thấy tên người tạo → Đồng ý kết nối);
     dialog xác nhận của A nêu tên người nhập mã; dialog hủy kết nối nêu tên
     người kia; danh sách lời mời/kết nối hiện tên + nhãn tự khai báo.
     KHÔNG xin SĐT/GPS, KHÔNG ép quyền tên/avatar Zalo.
   - `revision`: GET invites/claim/confirm/decline/cancel trả `revision` →
     frontend confirm gửi `expected_revision` thật (trước đó null vì
     `display_for` không có revision — đã bù ở view layer, giữ nguyên models).
2. **PHỤC HỘI SAU LỖI MẠNG** (`src/pages/connect/index.js`): refresh lỗi
   KHÔNG còn xóa ô nhập mã — claimArea được dựng lại từ `claimState`
   (giữ mã đã gõ, giữ trạng thái preview/claimed); Thử lại thành công khôi
   phục đúng trạng thái; KHÔNG tự replay thao tác ghi (claim/confirm/revoke
   chỉ chạy khi bấm nút).
3. **MÃ MỜI HẾT HIỆU LỰC**: mã vừa tạo được đối chiếu backend theo
   `invite_id` sau mỗi refresh (`reconcileCreatedInvite`): còn pending +
   chưa hết hạn → giữ hiển thị (không mất mã hợp lệ); canceled/expired/
   đã có người nhập/biến mất → ngừng hiển thị như còn dùng, trả nút tạo mã
   mới/phù hợp.
4. **CÔ LẬP REQUEST THEO PHIÊN** (`src/core/session.js` + `zalo-adapter.js`):
   thêm session generation (số tăng mỗi lần setSession/clearSession).
   `authed()` chỉ `clearSessionIfUnchanged(generation)` khi 401 — request
   của phiên cũ KHÔNG xóa phiên mới; `loginWithZaloToken` capture generation
   trước POST và BỎ kết quả lỗi thời (logout không bị response đăng nhập
   chậm khôi phục phiên); `logout` chốt cặp (token, generation) và chỉ xóa
   phiên của mình. Trang connect chỉ đá về /login khi phiên THẬT SỰ chết.
   (Bổ sung đợt sau: `logout` vô hiệu hóa NGAY khi gọi, `authed` bỏ cả
   response thành công của thế hệ cũ — xem 3c.)
5. **LỖI TRANSPORT ZALO** (`services/zalo_provider.py`): mapping lỗi
   transport đặt tại `_fetch_token_info` — `URLError`, `socket.timeout`/
   `TimeoutError`, `OSError` → 503 `temporarily_unavailable` /
   `provider_unreachable` cho CẢ transport mặc định lẫn injected double;
   KHÔNG cấp token, KHÔNG tạo user khi verify thất bại; KHÔNG catch-all
   (lỗi lập trình vẫn lan lên). Giữ nguyên HTTPS, allowlist, giới hạn 16KiB,
   timeout 10s, header proof.

## 3c. Đợt sửa review vòng 2 (cùng phiên trên head 8733561a)

Củng cố cô lập phiên theo thế hệ cho CẢ luồng đăng nhập và THÀNH CÔNG của
request (đợt trước chỉ chặn 401 + kết quả đăng nhập chậm). Phạm vi: chỉ
`src/core/api/client.mjs` + `src/core/adapter/zalo-adapter.js`; test deferred
promises điều khiển chính xác thứ tự async (6 test mới trong `f01-flows`).

1. **`loginWithZaloToken`**: chốt generation TRƯỚC bước await ĐẦU TIÊN
   (SDK `getAccessToken`) — logout/đổi phiên trong lúc SDK chờ ⇒ luồng cũ
   chết ngay khi SDK trả: KHÔNG phát hành (không POST access token), KHÔNG
   cài phiên; kiểm tra lại sau POST trước `setSession`.
2. **`logout`**: vô hiệu hóa NGAY LẶC TỨC khi gọi (không đợi response thu
   hồi) — mọi luồng đăng nhập/request bắt đầu trước logout đều mất hiệu lực
   từ thời điểm đó; vẫn gửi thu hồi ĐÚNG token cũ đã chụp (option `token`
   từng request trong `client.mjs` — vẫn in-memory, không vào URL/storage);
   response thu hồi cũ (kể cả lỗi) KHÔNG đụng vào phiên mới do người dùng
   chủ động đăng nhập sau logout.
3. **`authed`**: response THÀNH CÔNG thuộc thế hệ đã hết hiệu lực cũng bị
   BỎ — dữ liệu actor cũ không trả cho UI phiên mới; response lỗi (kể cả
   401) của thế hệ cũ bị thay bằng `stale_session`, không dùng để xóa phiên
   mới; KHÔNG tự retry ghi; thông báo giữ bất định “máy chủ có thể đã xử lý
   trước khi phiên đổi” — UI kiểm tra lại trạng thái trước khi thử lại.

## 4. Kiểm thử + kết quả

| Bộ | Lệnh | Kết quả |
|---|---|---|
| Backend F01 (SQLite) | `cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test FB_FEATURES=f01_identity PYTHONPATH=. python manage.py test family_bridge_features.f01_identity` | **88 tests: 84 pass + 4 skip (MySQL-gated: 2 race confirm/claim + 2 race login đồng thời)** |
| Backend toàn harness (SQLite) | `... FB_FEATURES="f01_identity,f15_privacy,...,admin_core" python manage.py test harness labgrants family_bridge_features.*` | **373 tests OK, 4 skip** |
| Frontend full | `cd zalo-mini-app && npm test` | **155/155 pass** (trong đó: 45 test f01-flows gồm 6 test deferred-promise của review vòng 2) |
| Mobile packages | `node --test packages/family_bridge_mobile/*/tests/*.test.mjs` | 16/16 file OK |
| Build | `cd zalo-mini-app && npm run build` | OK + `Verified Zalo app-config and all referenced assets` |
| Docs checker | `python scripts/check_agent_docs.py` | OK (files/links, skills, wiring, SEC register, FL/AF/CAP/WF/DEC/CFG mapping) |
| `git diff --check` | trên toàn working tree | CLEAN |

**Phân loại môi trường kiểm chứng (bắt buộc đọc trước khi tin kết quả):**

| Môi trường | Chứng minh được | KHÔNG chứng minh được |
|---|---|---|
| SQLite local (đã chạy) | logic nghiệp vụ, error mapping, view-layer enrichment, session generation, UI state | row-lock/unique race thật, charset/collation MySQL, latency/device |
| MySQL CI 8.4 (`mysql-checks` job, chạy sau khi push) | migration thật + 4 test race (2 confirm/claim + 2 login đồng thời: 1 identity/1 user, không mồ côi, không 500) | hành vi TiDB (Render dùng TiDB — tiếng nói MySQL nhưng không 100% giống) |
| TiDB trên Render | chỉ smoke health/ready đã thấy trước đó | race semantics — phải quan sát log/số liệu thật khi chạy thử |
| Thiết bị Zalo thật | SDK getAccessToken, verify token thật, hiển thị webview | chưa chạy — Antigravity theo `two-account-script.md` |

Không được dùng kết quả SQLite để tuyên bố MySQL/TiDB PASS, và không có bất kỳ
tuyên bố Zalo device PASS nào từ đợt này.

## 5. Chính sách Zalo (nguồn → ngày → yêu cầu → triển khai → bằng chứng)

| Nguồn (URL cuối) | Ngày đọc | Yêu cầu áp dụng | Triển khai | Bằng chứng |
|---|---|---|---|---|
| https://miniapp.zaloplatforms.com/documents/intro/authen-user/ (28/1/2026) | 2026-10-13 | getAccessToken (SDK) → gửi token về server → server gọi `graph.zalo.me/v2.0/me` GET với **headers access_token + appsecret_proof** (bắt buộc từ 01/01/2024); proof = HMAC-SHA256(token, app_secret) hex | Đúng spec trong `zalo_provider.py` | test shape + live smoke 452 |
| https://docs.zaloplatforms.com/docs/MA/api/user/user-information/getAccessToken (27/9/2026) | 2026-10-13 | SDK 2.35.0+: lấy token không cần xác nhận, chỉ xuất được ID; tên/avatar cần authorize scope.userInfo | F01 chỉ lấy ID tối thiểu; KHÔNG gọi getUserInfo (localhost trả mock cứng) | không có getUserInfo trong src |
| https://miniapp.zaloplatforms.com/documents/intro/request-permission/ (28/1/2026) | 2026-10-13 | Chỉ xin quyền đúng ngữ cảnh; màn mở đầu không xin quyền nhạy cảm | Không xin SĐT/vị trí/followOA; không getPhoneNumber | grep src sạch |
| https://miniapp.zaloplatforms.com/documents/zalo-mini-app-developer-program-agreement/ (25/9/2026) | 2026-10-13 (đợt US-003) | Không tuyên bố được Zalo duyệt; dữ liệu trẻ em 14–16 cần đồng ý của trẻ và người giám hộ; xử lý trong VN | Copy không claim duyệt; consent từng mục đích | docs copy |
| https://miniapp.zaloplatforms.com/documents/intro/zalo-mini-app-design-guidelines/ (27/9/2026) | 2026-10-13 (đợt US-003) | Loading/error hiển thị rõ; vùng chạm 7–9mm; giữ nút back trái; bottom bar ≤4 tab (discrepancy 5 tab đã ghi từ US-003, không đổi trong đợt này) | Dùng lại component hệ US-003; loading/error/retry đầy đủ | screenshots |

Lưu ý: không tự gửi xét duyệt/publish; không tuyên bố "được Zalo duyệt".

## 6. An toàn & riêng tư (đối chiếu SEC/DSA)

- Secret chỉ qua env (`ZALO_APP_SECRET`); không vào source/logs/exceptions/
  response/frontend/bundle (scan CLEAN). Bàn giao này không chứa secret.
- Token phiên: memory-only frontend; backend lưu SHA-256 hash, TTL 24h,
  revoke/logout/idempotent; 401 → clearSession + về `/login?reason=expired`.
- Không tin identity/role/is_admin do client gửi: backend chỉ tin identity đã
  verify; role là lựa chọn trải nghiệm (không phải quyền).
- Không auto-retry thao tác ghi; double-click guard; mất response → "chưa
  xác định" + làm mới thủ công; không polling/setInterval trong src (QA chặn).
- Người thứ ba không đọc/xác nhận/hủy lời mời của A/B (backend trả 404 không
  lộ tồn tại — giữ nguyên logic sẵn có, có test).
- Không fake-success: không "Đã gửi/Đã lưu/Đã chia sẻ" trong src (QA chặn);
  trạng thái chưa làm vẫn "Sắp có" + lý do.
- Không tự mở SDK liên tục: silent login đúng 1 lần/launch, thủ công khi thất bại.

## 7. Kịch bản 2 tài khoản Zalo cho Antigravity (thiết bị thật)

Xem `two-account-script.md` cùng thư mục.

## 8. Cấu hình environment (chỉ tên + placeholder, KHÔNG giá trị thật)

Backend (Render env đã có — chỉ xác nhận):
- `ZALO_APP_ID=3813524408107862261` (public, Zalo App ID của ứng dụng cha)
- `ZALO_APP_SECRET=<secret từ credential manager>` (server-only)

Frontend build (`zalo-mini-app/.env` khi build, không commit):
- `APP_ID=3411096375330044972` (Mini App ID)
- `VITE_API_BASE_URL=https://family-bridge-backend.onrender.com`

## 9. Dependency với W036 & tích hợp sau review

- W036 (Antigravity, nhánh `review/full-product-integration`): 4 ràng buộc
  uniqueness có điều kiện. Hiện nhánh đó là ANCESTOR của main (không có
  divergence sống) — các file `f01_identity` byte-identical giữa hai refs.
- Đợt này TỪNG CỐ TÌNH không đụng: `models.py`, `migrations/0001*`,
  `services/invites.py` (uniq_active_pair, chống trùng service) — thuộc
  ownership Antigravity.
- Sau khi W036 được review/merge: cần rebase lại nhánh này nếu có đụng
  `f01_identity`; luồng F01 không đổi contract nên rủi ro thấp.
- Gap đã biết (không làm trong đợt này, cần quyết định riêng): revoke connection
  chưa ghi ledger event `connection_revoked` cho F15 (wiring B16/F15);
  `docs/contracts/api-foundation.md` vẫn viết "JWT" trong khi thực tế dùng
  opaque session token.

## 10. Đã làm / chưa kiểm chứng / cần thao tác bên ngoài

Đã làm: toàn bộ mục 3 + kiểm thử mục 4 + docs này.

Chưa kiểm chứng (cần môi trường thật):
- Đăng nhập Zalo thật trên 2 thiết bị (token thật → verify thật) — Antigravity.
- MySQL/TiDB race tests (`FB_TEST_DB=mysql`) + migration drift trên MySQL.
- Hiệu năng/hiển thị webview Zalo thật (safe-area, keyboard, back button).
- Khi mở lại app: silent re-login dùng SDK thật (browser không chứng minh được).

Cần thao tác bên ngoài (Huy):
- Không yêu cầu thêm gì từ Zalo tại thời điểm này (App ID + secret + Mini App
  ID đã có và đã cấu hình Render theo ảnh môi trường).
- Khi nào cần: màn hình "Đăng ký sử dụng API" của Zalo nếu bật scope.userInfo
  (tên/avatar) ở giai đoạn sau — URL: https://developers.zalo.me/console —
  hiện CHƯA dùng nên không cần.
