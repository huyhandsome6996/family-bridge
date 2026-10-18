# Verification report — F07 (18/10/2026)

Quy ước: PASS = quan sát thực trong môi trường ghi rõ; NOT_RUN = chưa có môi
trường/phạm vi, kèm lý do; không gán kết quả cũ cho commit mới. Suite chạy trên
exact final SHA (xem branch-compatibility-report.md).

## Môi trường

| Môi trường | Ghi chú |
| --- | --- |
| Harness SQLite (`tests/feature-lab`, DJANGO_ENV=test, Django 5.2.18 như CI) | module + integration + QA |
| Backend thật local (config.settings, DJANGO_ENV=development, DB_ENGINE=sqlite, runserver) | E2E HTTP 21 bước + browser |
| Browser thật (agent-browser Chromium, viewport 390×844) | Mini App Vite dev → API local, 2 tài khoản |
| MySQL/TiDB | **NOT_RUN** — không có container MySQL trong môi trường này |
| Zalo thiết bị thật | **NOT_RUN** — không có runtime/quyền device |

## Kết quả suite (exact final SHA)

| Suite | Lệnh | Kết quả |
| --- | --- | --- |
| Backend module F07 (19 cũ + 23 mới) | `bash tests/feature-lab/scripts/test_feature.sh f07_mood` | 42 PASS, 2 skip(MySQL-gated) |
| Full CI harness (tất cả feature) | manage.py test harness labgrants f01..f16 | **523 tests OK** (11 skip MySQL-gated) |
| Mobile package | `node --test packages/family_bridge_mobile/f07_mood/tests/*.test.mjs` | 3 PASS |
| Shared adapter | `node --test packages/family_bridge_shared/tests/*.test.mjs` | 37 PASS |
| Mini App QA | `cd zalo-mini-app && npm test` | 306 PASS (gồm 10 test UI F07) |
| Mini App build | `npm run build` | OK + verify-build OK |
| Web consumer (KHÔNG sửa web) | `cd web && npm test && npm run build` | 227 PASS + build OK |
| Import boundaries | `node scripts/check_import_boundaries.mjs` | SẠCH exit 0 |
| Agent docs | `python scripts/check_agent_docs.py` | OK |
| E2E HTTP thật | `python3.13 scripts/f07_local_e2e.py --base http://127.0.0.1:8000` | **21/21 PASS** |
| MySQL race twins (create/share) | `FB_TEST_DB=mysql ... test_race_mysql.py` | **NOT_RUN** — cần MySQL |
| Zalo device | — | **NOT_RUN** |

## Ma trận nghiệm thu 03-F07-ACCEPTANCE (F07-01..F25)

| Mã | Thử | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| F07-01 | Login thật class-session, role từ server | PASS (local thật) | E2E login 3 tài khoản 200 + token; browser login form thật |
| F07-02 | Mở từ navigation thật | PASS | routes /mood, /mood-shared; profile card "Tâm trạng & chia sẻ"; home link; browser snapshot |
| F07-03 | Tạo mục + ghi chú, riêng tư | PASS | E2E 201 + UI "Chỉ mình bạn" (ảnh 01,02) |
| F07-04 | Đăng nhập lại còn dữ liệu | PASS | E2E list sau login; DB lưu (SQLite) |
| F07-05 | Trùng ngày + đồng thời | PASS local / race MySQL **NOT_RUN** | 400 business; regression mock-race; twin MySQL skip có lý do |
| F07-06 | Sửa mục đúng owner, revision mới | PASS | PATCH 200 rev2; cross-user 404; E2E step 11 |
| F07-07 | Ngày VN/bounds/Unicode/note 2000 | PASS | test_f07 date boundary + note bounds; E2E validation |
| F07-08 | Lịch sử/summary/phân trang | PASS | cursor 2 kích thước E2E; query-count test không N+1 |
| F07-09 | Tài khoản khác/admin đổi ID | PASS | E2E stranger 404; admin 404 cả GET/PATCH (test + integration) |
| F07-10 | Chưa kết nối vẫn ghi riêng; share bị chặn có giải thích | PASS | share không connection → 404/400 envelope; UI thông điệp dẫn kết nối |
| F07-11 | admin_provisioned invite NULL | PASS | integration test + fixtures tạo connection source=admin_provisioned, share/đọc bình thường |
| F07-12 | Chọn 1 mục, 1 người, preview đúng | PASS | UI sheet (ảnh 03) preview đủ note+revision; test shape |
| F07-13 | Sửa sau preview rồi confirm cũ | PASS | 409 stale_revision; v2 không lọt (regression + E2E step 12) |
| F07-14 | Xác nhận share → grant đúng item/recipient/revision/generation | PASS | grant_view status active; E2E step 8; rebind gen 2 (integration) |
| F07-15 | Người nhận đọc/list chỉ mục được cấp | PASS | E2E step 9; regression IDOR; metadata không leak sau unlink |
| F07-16 | Thu hồi 1 mục/người nhận | PASS | E2E step 14; browser chéo thiết bị (ảnh 07) |
| F07-17 | Thu hồi rồi share lại | PASS | re-share → active, không trả row revoked (regression + E2E step 15) |
| F07-18 | Sửa mục đã share | PASS | stale 404 + status stale_revision; share lại v2 mới đọc được |
| F07-19 | Hủy kết nối/kết nối lại | PASS (local) | integration gen 2; E2E step 17; reconnect không hồi sinh |
| F07-20 | Provider/reader thiếu hoặc lỗi | PASS | fail-closed 503 (regression mock reader None) |
| F07-21 | F15 overview/revoke với provider thật | PASS | provider đăng ký ready(); revoke F15 chặn F07 (integration + E2E step 16) |
| F07-22 | Yêu cầu xóa/lifecycle | PASS (hook thật) | deletion hook idempotent integration test; "requested ≠ purge" giữ nguyên |
| F07-23 | Logout/đổi actor/phản hồi muộn/resume | PASS (local) | session generation guard sẵn; reload → login (browser); stale_session kind |
| F07-24 | Mất mạng/timeout/bấm lặp | PASS (UI states) | kind timeout/network message; double-submit disable; không tự retry ghi |
| F07-25 | Màn 320/390/430, chữ lớn, focus, logo, help | PASS một phần (390px thật) | browser 390×844 ảnh; 320/430 + 200% chữ + thiết bị: **NOT_RUN** |

## Ma trận mission §15.1 (F07-T01..T30) — ánh xạ nhanh

T01→E2E 2-4; T02→caregiver scope test; T03→regression mock-race + MySQL NOT_RUN;
T04→date boundary tests; T05→E2E validation + envelope tests; T06→pagination
tests + E2E; T07→edit tests; T08→summary tests; T09→integration real reader +
E2E; T10→E2E share; T11→shares list status test + UI; T12→Finding6 + E2E 12;
T13→share self/unconnected tests; T14→IDOR regressions + E2E 10; T15→revoke
scoped test; T16→Finding4 + E2E 15; T17→edit-share tests + E2E 11-13; T18→
integration gen2 + E2E 17; T19→Finding2 fail-closed; T20→admin deny tests +
integration; T21→F15 revoke integration + E2E 16; T22→deletion hook test;
T23→session generation (sẵn) + browser reload; T24→browser chéo thiết bị;
T25→offline cache: UI không storage private content (NOT_RUN device offline);
T26→double-share race MySQL NOT_RUN + idempotent revoke; T27→textContent
QA rule + suite cấm innerHTML; T28→shared list pagination + post-filter;
T29→UI error states tests; T30→hai client cùng API = E2E/browser dùng cùng
backend thật.

## Ảnh UI (synthetic content)

| Ảnh | Nội dung |
| --- | --- |
| 01-mood-page-hs.png | Trang /mood sau login HS thật (chips + editor + history) |
| 02-mood-saved.png | Thông báo máy chủ đã ghi nhận (riêng tư) |
| 03-share-sheet.png | Sheet preview (ngày/note/revision) + chọn người nhận |
| 04-share-grants.png | Badge "Đang chia sẻ" + nút thu hồi |
| 05-shared-list-ph.png | Danh sách phía nhận (PH thật) |
| 06-shared-detail-ph.png | Chi tiết mục đọc được |
| 07-revoked-blocked.png | Sau revoke từ thiết bị khác: "Không còn xem được", nội dung cũ gỡ |

## Rủi ro còn lại

1. MySQL/TiDB: unique-race + khóa hàng chưa đo thật (script + test sẵn, cần
   FB_TEST_DB=mysql).
2. Zalo thiết bị thật (SDK/safe-area/keyboard) chưa chạy.
3. Render production chưa xác minh lại sau thay đổi (không được phép deploy).
4. Màn 320/430 + chữ 200%: kiểm bằng CSS tokens sẵn của app, chưa đo thiết bị.
