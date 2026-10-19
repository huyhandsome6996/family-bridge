# F07 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- 1 entry/người/ngày (UNIQUE owner+entry_date); entry_date thiếu → server
  lấy hôm nay theo Asia/Ho_Chi_Minh; chặn tương lai >1 ngày, quá khứ >730
  ngày (DEC-17); emotion allowlist 7 nhãn mô tả; note ≤2000 Unicode giữ nguyên.
- Edit (PATCH) bump revision — grant cũ bind revision cũ → nội dung sửa
  tự ẩn khỏi người nhận tới khi share lại (tạo grant mới revision mới).
- Share: POST share {recipient_id} — server kiểm connection ACTIVE
  generation hiện hành (ConnectionReader); share_to_self 400; một grant
  (entry, recipient, revision) UNIQUE.
- Đọc phía người nhận: grant unrevoked + revision còn hiện hành +
  connection còn active — drift nào cũng 404 fail-closed, không cache.
- Summary: đếm mô tả theo nhãn trong cửa sổ bounded (≤365 ngày), owner-only,
  không score/ranking/so sánh.
- Mobile: mood.js (chips radiogroup + note + summary + lịch sử cursor +
  share flow từng mục), mood-shared.js (danh sách nhận được + đọc chi tiết),
  mọi text qua textContent.

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Create + detail owner | 201/200, revision 1 | PASS |
| 1 mục/ngày: duplicate | 400 entry_already_exists_use_edit | PASS |
| Date boundary: tương lai >1 ngày / quá khứ >730 / sai format | 400 | PASS |
| Date edge +1 ngày (VN) | 201 | PASS |
| Emotion ngoài allowlist | 400 | PASS |
| Note Unicode/emoji + >2000 | 201 / 400 | PASS |
| Edit bump revision | revision 2 | PASS |
| Owner khác / caregiver / admin đọc + admin PATCH | 404 | PASS |
| Pagination page20 vs page50 query count | bounded (không N+1) | PASS |
| Share 1 mục → grant revision hiện hành | 201 | PASS |
| Share không connection | 404 | PASS |
| Người nhận chỉ đọc mục được chia sẻ (mục kia không lộ) | đúng | PASS |
| Sửa sau share → đọc stale | 404 entry_edited_not_reshared | PASS |
| Share lại sau sửa → revision 2 đọc được | đúng | PASS |
| Revoke 1 mục: mục đó 404, mục khác vẫn 200 | scoped | PASS |
| Unlink → người nhận đọc | 404 fail-closed | PASS |
| Share cho chính mình | 400 | PASS |
| Stranger revoke/đọc share | 404 | PASS |
| Summary đếm đúng, chỉ {emotion,label,count} | không score | PASS |
| Summary days=9999 bounded, owner-only | đúng | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 10 path; factories; wording "không chia sẻ cả
lịch sử" + textContent assertions.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Chọn cảm xúc + lưu | 1 mục/ngày; sửa qua lịch sử |
| 2 | Học sinh | Xem mô tả 3 tháng | Đếm theo nhãn, không điểm/xếp hạng |
| 3 | Học sinh | Chia sẻ 1 mục cho mẹ | Preview rõ chỉ mục đó; mẹ thấy bản đó |
| 4 | Học sinh | Sửa mục đã chia sẻ | Mẹ không còn thấy bản cũ tới khi share lại |
| 5 | Người nhận | Đọc mục được chia sẻ | Chỉ mục được cấp; mục khác không lộ |
| 6 | Học sinh | Thu hồi 1 mục | Người nhận đọc lại 404 ngay; mục khác không ảnh hưởng |
| 7 | Sau unlink | Người nhận đọc | 404 fail-closed |

## Cập nhật 18/10/2026 — đợt hoàn thiện F07 (bằng chứng mới)

### Regression tests tái hiện 8 điểm nghi vấn bàn giao (test_f07_regressions.py)

| Finding (mission 6.1) | Test | Baseline | Sau sửa |
| --- | --- | --- | --- |
| (1) `/shares` gọi sai kwarg `author_id` | test_owner_lists_entry_shares_200 | 500 TypeError | 200 + status thật |
| (2) `read_shared` fail-open khi thiếu reader | test_missing_reader_denies_read | 200 lộ note | 503 fail-closed |
| (3) không so connection ID/generation | test_reconnect_new_generation_blocks_old_grant | 200 (grant cũ sống) | 404 |
| (4) re-share trả row revoked / không rebind | test_reshare_after_revoke_reactivates_grant, test_reshare_after_reconnect_binds_new_connection | revoked:True / binding chết | active + rebind generation mới |
| (5) `/mood/shared` lộ metadata sau unlink + không phân trang | test_shared_list_hides_metadata_after_unlink, test_shared_list_pagination | leak / 3>2 | [] / cursor bounded |
| (6) share không pin revision (stale preview) | test_share_with_stale_expected_revision_rejected | không có semantic | 409 stale_revision, v2 không lọt |
| (7) adapter gửi `limit` thay vì `page_size` | http-endpoints.test.mjs (node) | param bị bỏ qua | map đúng, có test bắt fetch |
| (8) create race IntegrityError → 500 | test_integrity_error_becomes_business_conflict | 500 | 400 business error |

Twin MySQL-gated (NOT_RUN trên SQLite, skip có lý do): tests/test_race_mysql.py —
2 thread create cùng owner/ngày → đúng 1 row + loser InputInvalid; 2 thread share
cùng (entry, recipient, revision) → đúng 1 grant active.

### Integration test với thành phần thật (test_f07_integration.py)

- Wiring production qua apps.py ready(): reader = F01 InviteService thật;
  F15 đăng ký provider `mood_entry` + hook xóa `mood` (không phải fixture lab).
- F07-11: cặp admin_provisioned (invite NULL) share/đọc bình thường, không bị
  hỏi ghép đôi lại.
- F07-21: revoke qua cơ chế F15 (`/privacy/grants/mood_entry/{id}/revoke`) chặn
  đọc F07 ngay — một nguồn grant.
- Hook xóa `mood`: xóa entry của user + revoke grant đã nhận (idempotent, ok=True).
- Vòng unlink → reconnect (generation 2): grant cũ 404; re-share tường minh rebind
  connection mới rồi đọc lại 200.

### E2E HTTP thật (scripts/f07_local_e2e.py — SQLite local, server Django thật)

21/21 PASS: login class-session → tạo mục (server quyết định ngày VN) → trùng
ngày 400 → validation biên → phân trang 2 kích thước → stranger/admin 404 →
share expected_revision → PH đọc → sửa → stale 409 → share lại v2 → revoke →
404 ngay → share lại sau thu hồi → F15 revoke → unlink list rỗng.
Chạy lại: `python3.13 scripts/f07_local_fixtures.py` (tạo/reset fixture
synthetic HSZE2E01/PHZE2E01/HSZE2E99 + connection admin_provisioned) rồi
`python3.13 scripts/f07_local_e2e.py --base http://127.0.0.1:8000`.

### UI Mini App thật (happy-dom + trình duyệt thật qua Vite dev + API local)

- tests/f07-mood.test.mjs: 10 test — riêng tư mặc định, trùng ngày, preview
  đủ note+revision, expected_revision đúng bản xem trước, 409 giữ sheet mời
  xem lại, badge trạng thái thật + thu hồi đúng share_id, phía nhận 404 không
  lộ nội dung, nội dung lần đọc trước bị GỠ khi lần mở mới bị chặn.
- Trình duyệt thật (agent-browser, 390x844): đăng nhập class-session thật →
  #/mood tạo mục → chia sẻ qua sheet (preview/confirm) → đăng nhập PH →
  #/mood-shared đọc → HS thu hồi qua API thiết bị khác → PH mở lại thấy
  "Không còn xem được", nội dung cũ gỡ khỏi màn. Ảnh: bàn giao
  docs/handover/f07-mood-sharing/verification-report.md.
