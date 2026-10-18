# Report — F07 Ghi nhận tâm trạng và chia sẻ từng mục (B07)

- Feature ID / nhánh / US: F07 / feat/f07-mood-history-sharing / US-015, US-026
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **MoodEntry**: 1 mục/người/ngày (UNIQUE), entry_date là ngày VN
  (Asia/Ho_Chi_Minh) do server quyết định khi client bỏ trống; chặn tương
  lai >1 ngày, quá khứ >730 ngày; emotion allowlist 7 nhãn mô tả (Vui,
  Bình an, Mệt, Buồn, Lo lắng, Bực bội, Khó nói) — không score, không
  valence, không suy từ AI; note ≤2000, Unicode giữ nguyên.
- **Edit → revision mới chưa shared**: PATCH bump revision; MoodShare
  bind approved_revision nên nội dung sửa tự ẩn khỏi người nhận tới khi
  share lại tường minh (test stale → 404; re-share revision 2 → đọc được).
- **Per-entry sharing** (US-026): share = (entry, recipient, revision
  hiện hành) + connection generation lúc share; UNIQUE constraint; không
  có bất kỳ đường "chia sẻ cả lịch sử" nào (wording + test); share cần
  connection ACTIVE qua ConnectionReader (F01 port).
- **Đọc người nhận fail-closed mỗi lần**: grant unrevoked + revision còn
  hiện hành + connection còn active generation hiện hành — drift nào cũng
  404; không có layer cache để lỗi thời; revoke hiệu lực NGAY và scoped
  theo từng share (test: revoke mục 1, mục 2 vẫn đọc được).
- **Summary mô tả**: đếm theo nhãn trong cửa sổ ≤365 ngày, owner-only,
  response chỉ {emotion,label,count} — test chặn mọi field khác.
- **Authorization**: owner-only CRUD; stranger/caregiver/admin 404 cả
  đọc lẫn PATCH; pagination cursor (entry_date desc) lọc DB trước,
  query count page20 ≈ page50 (không N+1, có test CaptureQueriesContext).
- **Mobile**: mood.js (chips radiogroup a11y, note, summary đếm mô tả,
  lịch sử cursor + tải thêm, share flow từng mục với wording rõ),
  mood-shared.js (danh sách nhận được, đọc chi tiết re-check server),
  toàn bộ text qua textContent.
- Harness: carry-forward chuẩn; ConnectionReader dùng double
  labgrants.TestConnectionReader (TEST-ONLY).

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f07_mood
node --test packages/family_bridge_mobile/f07_mood/tests/f07.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f07_mood python manage.py test harness labgrants family_bridge_features.f07_mood
```

Kết quả: f07 19/19 backend PASS; suite rộng 47/47 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Index (owner, entry_date) UNIQUE cho rule 1 mục/ngày; cursor keyset
  entry_date desc O(page); share index (recipient, created_at) và
  (owner, created_at); đọc share theo pk + select_related entry (1 query).
- Summary: 1 aggregate query values_list trên cửa sổ date — không full scan.

## Security/privacy

- SEC-03/04: owner-only; per-entry grant; admin không có đường đọc
  (404 test); stranger revoke/đọc 404.
- SEC-05: bounds + unknown fields reject; note không truncate.
- WF-04/DEC-04: grant (item, recipient, revision, generation); sửa nội
  dung không tự chia sẻ revision mới; revoke/generation fail immediate.
- Không điểm "ngoan"/xếp hạng/so sánh — summary chỉ đếm mô tả (test).
- Note là dữ liệu nhạy cảm: không log, không hiện trong list người khác.

## Kết quả

- PASS: 19 backend f07 + 47/47 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL race share/edit đồng thời (không DB).
- BLOCKED: none trong phạm vi module; ConnectionReader thật (F01) +
  đăng ký MoodShareService làm grant provider trên F15 policy (B18).

## Còn lại / Input cần

- B18: wire ConnectionReader thật; register mood grant provider vào F15
  policy registry (item_type="mood_entry"); nhãn cảm xúc chính thức cần
  Thầy duyệt (US-005) — hiện là nhãn DEC-17 provisional.

## Cập nhật 18/10/2026 — đợt kiểm thử/sửa/hoàn thiện (nhánh tinh-nang/f07-tam-trang-va-chia-se-us015-us026, sync main 571abcb)

Sửa 8 lỗi được tái hiện bằng test trước khi vá (không vá mù):

1. `MoodEntrySharesView` gọi `get_own(author_id=...)` — kwarg sai → 500 cho
   chính owner. Sửa: `owner_id=`.
2. `read_shared()` bỏ qua kiểm tra connection khi thiếu reader (fail-open).
   Sửa: thiếu reader → `ModuleUnavailable` (fail-closed) ở MỌI path chia sẻ/đọc.
3. Grant không bind connection identity/generation hiện hành. Sửa: đọc so
   `connection_id` + `generation` với connection active hiện tại; reconnect
   generation mới không hồi sinh grant cũ.
4. `share()` `get_or_create` trả row revoked như thành công và không rebind
   connection sau reconnect. Sửa: re-share là hành động tường minh — kích hoạt
   lại đúng row đó kèm re-validate connection + rebind id/generation.
5. `/mood/shared` không phân trang + không recheck connection (metadata leak
   sau unlink). Sửa: cursor pagination (`page_size`, `next`) + recheck
   connection per-row trên trang bounded.
6. Share không pin bản đã xem trước. Sửa: nhận `expected_revision` (validation
   `validate_revision`); lệch bản → `PreviewStale` 409 `stale_revision`; grant
   bind đúng bản được xác nhận. Client Mini App luôn gửi `expected_revision`.
7. Shared adapter gửi query `limit` trong khi API đọc `page_size` — phân trang
   bị bỏ qua im lặng. Sửa: map `limit` (tên tham số caller giữ nguyên) →
   `page_size`; thêm test bắt URL fetch thật.
8. Create `.exists()` rồi insert — race thật → IntegrityError 500. Sửa: bọc
   transaction + `IntegrityError` → 400 `entry_already_exists_use_edit`
   (cùng recovery path với duplicate tuần tự). Race thật MySQL: NOT_RUN
   (tests/test_race_mysql.py chạy khi FB_TEST_DB=mysql).

Wiring production (trước đây chỉ test mới có): `f07_mood/apps.py ready()`
đăng ký F01 `InviteService` làm ConnectionReader, đăng provider grant
`mood_entry` + hook xóa `mood` vào F15 registry (pattern F16, guarded import,
không bao giờ che lỗi của module hiện diện).

Mini App chính thức: routes `/mood` + `/mood-shared` mount 2 trang mới theo
page contract (chips radiogroup, preview đủ nội dung + revision, xác nhận
tường minh với expected_revision, quản lý/thu hồi từng grant với badge trạng
thái thật, phía nhận recheck mỗi lần đọc + gỡ nội dung cũ khi lần đọc mới
bị chặn); shared adapter thêm 8 method (74→82, update contract test);
home/profile có đường đi rõ; không đụng `web/**` (regression 227 PASS).

Bằng chứng đầy đủ: `docs/handover/f07-mood-sharing/` (bàn giao) — verification
report từng nghiệm thu, lệnh chạy, SHA.
