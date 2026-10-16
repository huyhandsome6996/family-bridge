# F02 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Catalog published-only | đúng | PASS |
| Enroll pin revision; re-publish không migrate thầm | pin giữ nguyên, catalog ra rev mới | PASS |
| Re-enroll tường minh sang revision mới | re-pin chủ động | PASS |
| Enroll revision lạ/không tồn tại | 404 | PASS |
| Opt-out → weeks 404 trung thực; rejoin được | đúng | PASS |
| Cả 4 tuần view được, locked=false, suggested chỉ mang tính thông tin | không khóa | PASS |
| Progress own-only (stranger 404) + reset xóa | đúng | PASS |
| Activity không thuộc chương trình pin | 400 | PASS |
| Accept idempotent cùng revision (UNIQUE) | created True→False | PASS |
| Mỗi người tự accept (không endpoint ký hộ — participant_id → 400) | đúng | PASS |
| Template sửa → re-enroll → phải accept lại | đúng | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 6 path; wording tự nguyện + "mỗi người tự đồng ý"
+ sổ giấy + (gợi ý); textContent.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Tham gia | Pin revision; tự nguyện rõ ràng |
| 2 | Học sinh | Xem tuần 3, 4 trước | Vẫn xem được (không khóa theo tiến trình) |
| 3 | Học sinh | Tick hoạt động / bỏ qua / reset | Chỉ ảnh hưởng mình |
| 4 | Cả hai | Đồng ý thỏa ước | Mỗi người tự ký; ai chưa ký thấy rõ |
| 5 | B16 | Sửa template | Revision mới; acceptance cũ không áp dụng |
| 6 | Học sinh | Nghỉ chương trình | Không áp lực; quay lại được |

## Bổ sung 2026-10-16 (wiring + family agreement + revision pin)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Provider chỉ surface published; draft/malformed/retired không lộ | đúng | PASS |
| Provider validate đúng 4 tuần (1..4, không trùng) + bounds | đúng | PASS |
| WeekProgress pin revision — activity_key tái dụng rev mới không kế thừa status | đúng | PASS |
| Thỏa ước: propose 201 proposed; re-propose idempotent | đúng | PASS |
| Thỏa ước: hai actor KHÁC nhau xác nhận cùng revision → confirmed (2 timestamp) | đúng | PASS |
| Thỏa ước: confirm lặp/đã confirmed → 400 sạch | đúng | PASS |
| Thỏa ước: người lạ 404; người ngoài cặp không confirm được | đúng | PASS |
| Thỏa ước: counterpart pin revision khác → revision_mismatch chặn | đúng | PASS |
| Thỏa ước: withdraw chỉ proposer; sau withdrawn, confirm bị chặn | đúng | PASS |
| Generation mới (unlink/reconnect) → instance mới riêng, không tái dùng | đúng | PASS |
| E2E local production wiring: connect→enroll→weeks→progress→F09→agreement→opt-out | 44/44 | PASS |

E2E script: `scripts/f02_e2e_flow.mjs` (env `FB_E2E_CLASS_PASSWORD`, không
hardcode mật khẩu; runner bash ngoài repo: migrate → provision cặp synthetic
→ seed draft → publish mô phỏng admin → runserver → flow → DB inspect:
FamilyAgreement confirmed 2 timestamp, WeekProgress rev1 hai người độc lập).

## Bổ sung 2026-10-16 (vòng 2): regression cho 4 lỗi audit R1–R4

Port assertion từ probe audit độc lập (2 probe backend + 2 probe DOM, cả 4
đã PASS lại trên head mới) vào suite repo:

- Backend: `packages/family_bridge_features/f02_program/tests/
  test_f02_audit_regressions.py` (10 case)
- Mini App: `zalo-mini-app/tests/companion-audit-fixes.test.mjs` (8 case)

| Lỗi | Case regression | Kết quả |
| --- | --- | --- |
| R1 | weeks response CHỈ có `activities`, không field ma `joint_activity_keys` | PASS |
| R1 | invite cần revision PUBLISHED thật (rev sai → `content_not_published`); hai chiều, invitee-only, không duplicate | PASS |
| R1 | UI: payload thật (không `joint_activity_keys`) vẫn hiện nút "Mời cùng làm"; revision từ catalog F09 (3), không hardcode 1 | PASS |
| R1 | UI: hoạt động ngoài catalog → nút mời KHÓA kèm lý do trung thực | PASS |
| R2 | v1 confirmed → propose v2 chưa ai ký → v1 VẪN confirmed | PASS |
| R2 | withdraw v2 / v2 chỉ một người ký → v1 vẫn confirmed | PASS |
| R2 | v2 đủ HAI xác nhận → v1 mới superseded | PASS |
| R2 | overview tách `effective_agreement` (confirmed) và `pending_proposal`; `agreement` = bản authoritative | PASS |
| R2 | re-propose revision đã superseded dưới bản confirmed còn hiệu lực → từ chối `agreement_revision_outdated` | PASS |
| R2 | propose mới chỉ supersede PENDING cũ (state machine Proposed→Superseded) | PASS |
| R3 | 25 chương trình published, pin rev 1 (tràn cửa sổ catalog 10/provider 20) → weeks vẫn đọc đúng | PASS |
| R3 | provider list bounded 20, service catalog bounded 10 (không bỏ giới hạn) | PASS |
| R3 | re-enroll tường minh mới đổi pin; tiến độ rev cũ không kế thừa | PASS |
| R3 | retired → pin fail-closed `program_not_published` | PASS |
| R4 | UI: lỗi mạng khi lưu tiến độ → hiện lỗi thật + "thử lại", nút bật lại chủ động | PASS |
| R4 | UI: đang gửi → nút khóa, bấm lặp chỉ 1 call | PASS |
| R4 | UI: phản hồi phiên cũ sau logout/đổi actor không cập nhật UI phiên mới | PASS |
| R4 | UI: propose bị chặn `agreement_revision_outdated` → hiện đúng lý do | PASS |
