# F15 — scope/test/manual (vòng 3; chi tiết trong report.md + api.md)

## Phạm vi

- Policy service deny-by-default + grant provider registry; production
  adapters cho F07/F08 (connection generation binding).
- Deletion workflow trung thực (cutoff snapshot, checkpoint, duplicate guard)
  + ledger append-only + restore replay fail-closed.
- API privacy owner-only, không admin bypass; verify/process qua handler
  authorizer B16 `privacy.case` (fail-closed); consent withdraw qua port
  production (F01 + F14 research mapping).
- Mini App: route `/privacy` chính thức (page-core dùng chung), session
  bridge F01, states đầy đủ, guard double-submit, unknown-outcome reconcile.

## Test case chính — backend harness (SQLite), 60/60 PASS

| Nhóm | Case | Kết quả |
| --- | --- | --- |
| Access (lab) | Không grant / sai revision / sai recipient / revoked / provider chưa đăng ký → deny, không leak body | PASS |
| Access (lab) | Ledger append-only (sửa event bị chặn) | PASS |
| Wiring session | Boot thật + Session F01 synthetic → 200; hết hạn/revoked/token lạ → 401; không lab resolver | PASS |
| Grant adapter | Share X → chỉ X mở, Y private; stranger deny; stale revision deny | PASS |
| Grant adapter | Same pair generation mới → grant cũ vẫn deny (không hồi sinh) | PASS |
| Grant adapter | Reader thiếu → deny fail-closed; journal provider wired | PASS |
| Overview | Cursor 7 mục qua trang 3 không mất mục; connections từ reader; shape mới | PASS |
| Revoke API | Owner revoke → chặn đọc mới + ledger; stranger 404 không ledger | PASS |
| Revoke API | expected_revision lệch → 409 revision_conflict; idempotent lần 2 revoked=false, đúng 1 event | PASS |
| Connection revoke | Grants 2 chiều chết cùng transaction; ledger 2 phía (payload scope connection identity+generation, O(1) byte — R08) | PASS |
| Connection revoke | Reconnect generation mới không hồi sinh; gọi lặp không spam event; stranger → 404 | PASS |
| Consent | Withdraw research → 200 dứt khoát + F01 withdrawn + F14 withdrawn + F14 submit chặn consent_required + ledger | PASS |
| Consent | AI withdrawal → has_active_consent False; chưa có đồng ý → declined được ghi nhận; unwired → 503 riêng | PASS |
| Consent | Rút research không khóa F13 help (DEC-08) | PASS |
| Deletion | verify/process KHÔNG authorizer → 503; actor thiếu capability → 404 (kể cả owner) | PASS |
| Deletion | verify + process với hook thật → completed; detail/list có revision; list stranger rỗng | PASS |
| Deletion | Duplicate: idempotent + covers_requested_categories=false khi khác ý định | PASS |
| Deletion | Hook fail → failed_needs_action; retry chỉ chạy lại category lỗi; mục tạo sau cutoff SỐNG SÓT | PASS |
| Restore | Replay re-revoke grant sau "backup restore" | PASS |
| Restore | Replay connection event hai phía + consent re-withdraw | PASS |
| Restore | Provider thiếu → incomplete fail-closed; truncated → incomplete + next_after_seq; replay idempotent, không viết event mới | PASS |

## Regression vòng 3 — 20 ca (R01–R12, `test_f15_regression.py`)

| Nhóm | Case | Kết quả |
| --- | --- | --- |
| R01/R02 | Withdraw nhiều version → acceptance cũ không hồi sinh; accept mới sau rút vẫn hiệu lực; ledger lỗi → rollback consent | PASS |
| R05/R08 | Restore revoke ROW connection; truncated refs fail-closed; 40/50 grants unlink được; replay KHÔNG đụng grant của connection KHÁC (isolation); watermark seq không bỏ event | PASS |
| R04/R06/R07/R09/R12 | Overview đủ 125/125 qua cursor; actor handler xuyên view→service (2 lần gọi đúng actor); crash processing → recovery completed; replay giữ cutoff gốc; domain revoke có ledger; cursor UUID hỏng → 400; connections hook giữ session sau cutoff + giữ consent/provider identity | PASS |
| R10 | F01 revoke endpoint thật → 2 event connection_revoked; F07/F08 fallback session F01 thật → 200 | PASS |

## Frontend

| Suite | Case | Kết quả |
| --- | --- | --- |
| zalo-mini-app DOM (8) | Page contract; chưa có phiên → thông báo thật + không gọi API; có phiên → hiện mục + nút thu hồi; lỗi mạng → offline + Tải lại; cấu hình lỗi → thông báo cấu hình | 8/8 PASS |
| zalo-mini-app DOM | Double-click thu hồi → đúng 1 POST; timeout → 1 GET đọc lại, không retry POST; destroy → response muộn không render | PASS |
| package page-core (10) | classifyError 2 hình dạng lỗi; busy guard; confirm hủy; receipt một lần; destroy semantics; 401 → no_session | PASS |
| package page-core regression (11) | R03 logout/đổi actor/no_session/destroy dọn private state; R12 reconcile deletion status; duplicate scope mismatch; loadMore cursor; unlink API thật + confirm; status map tiếng Việt; lỗi list không nuốt | PASS |
| package contract (3 cũ) | api wrapper paths + empty-body revoke-all + factory export | PASS |
| miniapp artifact R11 (3) | Build có session.js tổng hợp → module BUNDLED + serve HTTP 200 (không 404); build không session.js → xanh + bridge null; nguồn bridge sạch pattern cũ | PASS |
| zalo-mini-app toàn app | 115/115 PASS | PASS |
| Build | `npm run build` OK, bundle /privacy xuất hiện, verify-build PASS | PASS |

## Regression các domain bị tác động (SQLite)

f01 46 PASS + 2 SKIP (MySQL-gated) · f05 27 · f07 19 · f08 17 · f10 15 ·
f14 17 · admin_core 13 — tất cả PASS.

## Manual review checklist (chờ Huy/reviewer + thiết bị)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Owner | Hồ sơ → Quản lý chia sẻ & đồng ý | Mở /privacy; chưa login → thông báo thật |
| 2 | Owner | Thu hồi 1 mục | Confirm; list cập nhật; người nhận đọc lại 404 |
| 3 | Owner | Gửi yêu cầu xóa | Receipt một lần; list hiện trạng thái requested + nút hủy |
| 4 | Owner | Hủy yêu cầu trước xử lý | Thành công; sau processing → báo không hủy được |
| 5 | Owner | Rút đồng ý research | F01+F14 withdrawn; khảo sát chặn; help vẫn mở |
| 6 | Handler (khi B16 sẵn) | verify/process | Chỉ actor có privacy.case; sai → 404; chưa cấu hình → 503 |
| 7 | Admin thường | Thử mở deletion case người khác | 404, không có đường đọc body |
