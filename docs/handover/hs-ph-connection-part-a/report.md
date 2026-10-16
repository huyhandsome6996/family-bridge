# Phần A — Luồng kết nối HS/PH: báo cáo bàn giao (2026-10-16)

Nhiệm vụ: kiểm tra và hoàn thiện luồng kết nối HS/PH (đề xuất ghép đôi từ lớp
học — F16) trên Mini App, kiểm thử có bằng chứng, push trực tiếp `origin/main`
theo quyền Huy đã cấp cho phần A. **Không** chứa thay đổi F02, không sửa
`web/**`, không sửa backend.

## Snapshot đã kiểm tra

| Mục | Giá trị |
| --- | --- |
| Baseline main được audit | `4884c832c6a3596e76b536f8e75285716cd00270` (2026-10-16 15:56 +0700) |
| Commit Phần A (code) | `f14666ce877f9152002adaf275baa0aed273211e` trên `main` |
| Commit docs (báo cáo này) | xem `git log` — commit kế tiếp commit trên |
| Dữ liệu thật (Render, 16/10 19:47 +0700, file audit kèm task) | 100 ClassAccount (50 HS, 50 PH); 50 CompanionProposal đều `proposed`, `first_confirmed_role=null`; **0 kết nối active**; 0 F02 enrollment |
| Hành động trên dữ liệu thật | **KHÔNG có** — không xác nhận hộ, không seed, không reset. Cặp thật chỉ active khi hai người tự bấm |

## Đã đúng sẵn (không làm lại)

- **Backend F16** (`packages/family_bridge_features/f16_classroom/`): đăng nhập
  lớp, đề xuất hai bước (`proposed → awaiting_confirmation → connected` qua
  InviteService F01 trong cùng transaction), decline/cancel có lý do,
  `expected_revision` chống stale, membership gate 404 không leak, consent gate,
  kiểm tra `already_connected`/open-invite. Đã có 71+ test; suite xanh.
- **Trang `/proposal` của Mini App**: danh sách proposal của chính mình, checkbox
  tự nguyện khóa nút xác nhận (không tự gửi khi tải trang), dialog từ chối
  `wrong_pair`, hiển thị tên đối tác kèm nhãn "tên tự khai báo" (không nhận
  danh huyết thống/giám hộ), trạng thái refresh từ server sau mỗi thao tác.
- **Kết nối nhìn từ home**: `listConnections` — trạng thái "đã kết nối" đọc từ
  kết nối active hiện tại, không dựa status lịch sử của proposal.

## Lỗi thật đã sửa (đây là phần "thiếu" của phần A)

1. **Không có đường đi tới trang xác nhận** (root cause khiến 50 cặp "treo" dù
   backend sẵn sàng): route `#/proposal` tồn tại nhưng không bất kỳ nơi nào điều
   hướng tới. Người dùng sau login chỉ thấy home và luồng mã mời classic —
   không bao giờ biết lớp đã ghép cặp cho mình.
   - **Sửa** (`zalo-mini-app/src/pages/home/index.js`): khi chưa có kết nối
     active, home tải thêm `listClassProposals` (1 request, limit 20, song song
     với dữ liệu khác) và hiện thẻ nổi bật "Lớp học đã ghép cặp cho bạn" + CTA
     "Xem và xác nhận ghép đôi" → `#/proposal`. Không có proposal → home giữ
     nguyên; lỗi tải → ghi chú trung thực "Chưa kiểm tra được…" kèm lối xem trực
     tiếp (không giả bộ "chưa có đề xuất"); demo mode không gọi API thật;
     đã kết nối → không hiện thẻ.
2. **Thiếu hành động hủy theo API**: hợp đồng có `POST .../cancel` nhưng UI
   không có nút. **Sửa** (`zalo-mini-app/src/pages/proposal/index.js`): nút
   "Hủy đề xuất này" qua dialog destructive cho cả thẻ actionable và thẻ trạng
   thái `awaiting_confirmation`; sau thao tác luôn reload từ server.
3. **Map lỗi sai envelope backend thật**: UI so `error.code` với các mã cụ thể
   (`proposal_not_confirmable`, `already_connected`,
   `proposal_blocked_by_open_invite`, `account_inactive`) nhưng backend thật
   trả `code=input_invalid|not_authorized|not_found` và mã cụ thể nằm ở
   `details.reason` (đã xác chứng bằng E2E HTTP thật — xem dưới). Hệ quả: các
   thông điệp hướng dẫn riêng (mở trang consent, mở mục Người đồng hành…)
   không bao giờ hiển thị trên backend thật. **Sửa**: đọc ưu tiên
   `details.reason`, fallback `error.code`; bổ sung thông điệp cho
   `proposal_not_found`/`proposal_not_open`.

## Bằng chứng kiểm thử (môi trường local synthetic — KHÔNG đụng dữ liệu thật)

| Bộ | Kết quả | Ghi chú |
| --- | --- | --- |
| Mini App suite (`npm test` trong `zalo-mini-app/`) | **297/297 pass** (288 baseline + 9 case mới `tests/proposal-entry.test.mjs`) | happy-dom; Node 24 local |
| Backend feature-lab (đúng lệnh CI `tests.yml`) | **475 tests OK (skipped=9)** | baseline trước khi sửa — backend không đổi |
| Shared package tests | 34/34 | không đổi |
| Web tests + build (`web/`) | 187/187 + build OK | web không đổi — chạy lại để bảo đảm push main không làm đỏ CI web |
| Import boundary (`scripts/check_import_boundaries.mjs`) | CLEAN | web ↔ mini ↔ shared |
| Mini App build + verify manifest (`npm run build`) | OK | Zalo app-config + assets đầy đủ |
| **E2E API thật** (`scripts/f16_e2e_flow.mjs`, backend local sqlite, 3 cặp synthetic HS901/PH901, HS903/PH903, HS904/PH904) | **30/30 checks pass** | login → consent `service-v1` → list → confirm bước 1 (vẫn 0 connection) → PH confirm → `connected` + Connection **active/primary/gen 1**; DB inspect: đúng 2 UUID của HS901 (student) + PH901 (caregiver); confirm lặp → `input_invalid/proposal_not_confirmable`; `expected_revision` sai → 409 `revision_conflict`; actor lạ (HS903) confirm proposal cặp khác → 404 `proposal_not_found`; list chỉ trả proposal của mình; hủy → `canceled` + confirm lại bị chặn; decline `wrong_pair` → `declined` |

Limitations trung thực: SQLite không chứng minh MySQL race (đã có 2 case MySQL
có điều kiện trong F16, NOT_RUN khi không có MySQL); chưa chạy trên thiết bị
Zalo thật (NOT_RUN — Antigravity deploy Testing từ SHA main này rồi Huy test);
không chạy UI web (web của Huy, không sửa).

## Hướng dẫn Huy test thật (2 tài khoản, 2 thiết bị)

1. Antigravity build/deploy bản Testing từ **SHA main chứa commit `f14666c`**
   (đã gồm bản sửa này). Mini App ID `3411096375330044972`.
2. Đăng nhập **HS001** (mật khẩu lớp riêng của HS001) → đồng ý dịch vụ nếu được
   hỏi → **Trang chủ** sẽ hiện thẻ "Lớp học đã ghép cặp cho bạn" với tên PH001 →
   bấm "Xem và xác nhận ghép đôi" → tích ô tự nguyện → "Đúng người, tôi đồng ý
   kết nối" → trạng thái chuyển "Đang chờ phía kia xác nhận".
3. Đăng nhập **PH001** trên thiết bị khác → home hiện thẻ tương tự → xác nhận →
   cả hai bên thấy "Kết nối đã được xác nhận hai phía"; home chuyển sang trạng
   thái đã kết nối với tên nhau.
4. Thử luồng phụ: từ chối (sai cặp), hủy đề xuất, hoặc để một bên chưa xác
   nhận — trạng thái hai bên phải luôn khớp nhau sau khi tải lại trang.
5. Lưu ý dữ liệu thật hiện có 50 cặp `proposed` chưa ai xác nhận — đúng nghiệp
   vụ, KHÔNG cần can thiệp dữ liệu; sau khi bản Testing được cài, mỗi cặp tự
   xác nhận hai phía là kết nối active.

## Việc còn lại / NOT_RUN

- Deploy Zalo Testing + kiểm tra thiết bị: **Antigravity** (xem
  `docs/handover/zalo-hs-ph-release/` và runbook của họ).
- MySQL thật cho 2 case race F16: owner backend khi có `FB_TEST_DB=mysql`.
- Web UI có cùng lỗi map envelope (trang proposal của `web/` viết cùng mẫu) —
  **owner là Huy**; không sửa trong nhiệm vụ này vì `web/**` ngoài phạm vi.
