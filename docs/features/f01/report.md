# Report — F01 Zalo + kết nối chính (B01)

- Feature ID / nhánh / US: F01 / feat/f01-zalo-connections / US-011, US-013
- Baseline SHA (B00) / head SHA: baseline `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / head: xem commit cuối nhánh
- PR URL: https://github.com/huyhandsome6996/family-bridge/pull/[F01-PR] (target chore/full-build-contract-baseline)

## Đã có

- Models: ProviderIdentity (UNIQUE provider+app+subject), Session (hash token,
  TTL, revoke), ConsentRecord (purpose/version/withdraw ledger), ConnectionInvite
  (code_hash, TTL, single-use, revision), ClaimAttempt (rate guard DB), Connection
  (canonical pair, UNIQUE active pair, generation, revoke).
- Services: SessionService (verify→map→issue; resolve; revoke), InviteService
  (create/claim/confirm/decline/cancel/revoke; ConnectionReader port impl),
  ZaloPlatformVerifier (HTTP adapter cho graph.zalo.me, allowlist host, timeout,
  bounded response; fail-closed khi thiếu credentials).
- API: auth/session, auth/logout, consents, connections/invites (+claim/
  confirm/decline/cancel), connections (+revoke). Envelope lỗi chuẩn; unknown
  fields bị reject; anti-enumeration 404 cho mã sai/hết hạn và invite người khác.
- Mobile: onboarding consent (không preselect, help luôn mở), trang kết nối
  (tạo/nhập mã, hiển thị code một lần, poll 30s khi visible, cleanup khi
  unmount), api.js wrappers.
- Tests: 48 backend (46 PASS + 2 SKIPPED MySQL) + 4 node. Chi tiết test.md.

## Expected vs actual

- Kỳ vọng WT-01-01/02/03, WT-02-01/02/03 mức logic+harness: ĐẠT cho phần không
  cần MySQL/Zalo thật; race locks thật: SKIPPED; Zalo thật: NOT_RUN.

## Lệnh kiểm tra từ môi trường sạch

```bash
bash tests/feature-lab/scripts/test_feature.sh f01_identity
node --test "packages/family_bridge_mobile/f01_identity/tests/*.test.mjs"
```

## Tài khoản synthetic / cách vào preview

- Actors tạo bằng fixtures.actors (make_student/make_caregiver). Preview:
  `cd tests/feature-lab/preview && npm install && npm run dev` — MOCK banner,
  chưa nối backend thật (preview shell chỉ phục vụ duyệt UI module).

## Migration/settings/dependency cần bước tích hợp

- app `f01_identity` thêm INSTALLED_APPS; AUTH_USER_MODEL swappable
  (harness=labusers.User; tích hợp=accounts.User của Agent A).
- Settings production cần: ZALO_APP_ID, ZALO_APP_SECRET (env server);
  thiếu → auth/session trả 503 temporarily_unavailable (fail-closed).
- F05/F15 đọc Connection qua protocols.ConnectionReader (đã expose).

## DSA

- Bounds: code 12 ký tự (~57 bit, alphabet loại nhập nhằng), TTL 7 ngày,
  rate 30 claim/h/actor, session TTL 24h, text input 8..2048 cho token.
- Cấu trúc: indexed lookup code_hash UNIQUE (O(log N)); cặp canonical +
  partial unique; ClaimAttempt (actor, time) index; select_for_update trong
  transaction ngắn cho claim/confirm/revoke.
- Query: list connections 1 query; invites list LIMIT 50; không N+1 trong
  happy path; page size không áp dụng cho list invite (≤50, chu kỳ ngắn).
- Chưa đo EXPLAIN MySQL — NOT_RUN (không có DB).

## Security/privacy

- SEC-01: verify server-side; wrong-app/malformed/expired từ chối; subject
  chuỗi; không tin client id/role. SEC-02: TTL+revoke thật; 401 envelope.
  SEC-05: allowlist + reject unknown. SEC-06: code hash, single-use, TTL,
  rate, self-connect, claim race guard, anti-enumeration. SEC-14: rate guard
  DB đa instance. SEC-22: không log token/mã; ClaimAttempt metadata tối thiểu.
- Race: WT-02-03 double-confirm/claim-race viết đầy đủ, SKIPPED khi không
  MySQL — trung thực theo DSA-07.

## UI

- Đã làm: onboarding (consent từng purpose, không preselect, help luôn mở),
  connection page (state pending/active, revoke xác nhận, error/offline).
- Chưa: Stitch asset chưa có; chưa pixel-review; chưa chạy trên Zalo thật.

## Kết quả

- Backend harness (SQLite): PASS 46/48 chạy được, SKIPPED 2 (MySQL).
- Mobile node: PASS 4/4.
- NOT_RUN: MySQL race (không DB), Zalo thật (US-049, chưa có credentials),
  EXPLAIN/index MySQL, preview device.
- BLOCKED: verifier live cần ZALO_APP_ID/SECRET (external-inputs.md #1/#2).

## Còn lại / Blocker / Input cần

- Cần Huy cung cấp ZALO_APP_ID/ZALO_APP_SECRET để chạy verifier thật (khi đó
  chạy lại suite + ghi bằng chứng).
- Tích hợp B18: nối AuditWriter thật, nối ConnectionReader vào F05/F15,
  retarget User sang accounts.User.
