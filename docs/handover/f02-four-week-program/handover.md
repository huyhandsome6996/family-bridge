# F02 bàn giao — Đồng hành bốn tuần (nhánh `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044`)

Ngày: 2026-10-16. Người bàn giao: coding agent (Phần B). Người nhận tiếp:
agent sau / Antigravity (deploy) / Huy (duyệt nội dung + test thiết bị).

## 1. Nguồn build

| Mục | Giá trị |
| --- | --- |
| Nhánh | `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` |
| Base (main chứa Phần A) | `72930ae3fb6530235efa21d8f64b6ae3bd853af1` — ancestor trực tiếp của head (yêu cầu 2.1.4 đạt) |
| Head Phần B (code) | `ae837b33c62882452c9e235cbee2144e79cf97d9` |
| Vòng sửa audit R1–R4 (2026-10-16) | commit ngay trên `b482c5c1485dc1d1a381c11dfc4c29391e678785` — head nhánh sau push là nguồn build mới nhất; xem `git log` |
| Commit chỉ đồng bộ main | KHÔNG có commit riêng — nhánh placeholder cũ (`f8fc6a4`) là ancestor của main, sync = fast-forward (giữ lịch sử, 0 conflict) |

Phân biệt: commit Phần A nằm ở main (`f14666c` code + `72930ae` docs);
commit Phần B nằm trên nhánh F02 (`ae837b3` + commit docs); không có commit
trộn. KHÔNG merge F02 vào main — Draft PR để review.

## 2. Luồng hiện hành — đọc từ đâu, chạy thế nào

- Backend F02: `packages/family_bridge_features/f02_program/` — service
  (`services/program.py`), wiring production (`wiring.py` + `apps.py`),
  models (`models.py`: Enrollment/WeekProgress/AgreementAcceptance/
  FamilyAgreement), API (`api.py` + `urls.py`), seed nội dung draft
  (`management/commands/seed_f02_draft_program.py`).
- Provider production: B16 ContentItem `kind=f02_program` status=published,
  body JSON `{weeks[4], agreement{revision,title,commitments}}`. Fail-closed.
- UI Mini App: `zalo-mini-app/src/pages/companion/index.js` (route
  `#/companion` đã có sẵn — không đổi router). Adapter methods nằm ở
  `packages/family_bridge_shared/src/adapter/` (contract 81 method).
- Contract weeks (sau sửa R1): response mỗi tuần chỉ có
  `activities:[{activity_key,status}]` — UI dựng lời mời + tiến độ từ nguồn
  này; revision/tiêu đề/thời lượng hoạt động chung lấy từ
  `GET /api/v1/activities/catalog` (F09) — KHÔNG hardcode revision.
- Contract thỏa ước (sau sửa R2): overview trả `agreement` (authoritative —
  confirmed trước nếu có) + `effective_agreement` (confirmed đang hiệu lực)
  + `pending_proposal` (đang chờ hai bên); propose mới chỉ supersede đề xuất
  PENDING cũ, bản confirmed giữ hiệu lực đến khi bản mới đủ hai xác nhận.
- Mobile module API wrappers: `packages/family_bridge_mobile/f02_program/api.js`.

Chạy local E2E (mô phỏng đúng wiring production):

```bash
# ngoài repo (runner): migrate → provision cặp synthetic → seed draft →
# publish mô phỏng admin → runserver :8002 → node scripts/f02_e2e_flow.mjs
# mật khẩu synthetic qua env FB_CLASS_INITIAL_PASSWORD / FB_E2E_CLASS_PASSWORD
```

## 3. Việc còn thiếu (tên owner rõ ràng)

| Việc | Owner | Chi tiết |
| --- | --- | --- |
| Duyệt + publish nội dung 4 chủ đề | Thầy/người có `content.publish` (Huy điều phối) | Draft đã có trong B16 nếu chạy seed; xem `docs/features/f02/report.md` mục blocker. Không dùng nội dung synthetic làm bản production |
| Chạy migration `0002` trên MySQL thật | Owner backend | Runbook: backup → `manage.py migrate f02_program` → verify UNIQUE mới. DDL: add nullable column + đổi constraint. Chỉ chạy khi có chỉ thị release riêng |
| Deploy Zalo Testing | **Antigravity** | Xem `docs/handover/f02-four-week-program/ANTIGRAVITY-DEPLOY-HANDOFF.md` |
| Test thiết bị Zalo thật | Huy + Antigravity | NOT_RUN trong task này; checklist ở mục 6 |
| Respond invite UI tách riêng F09 (trang activities) | Owner F09 | Hiện accept/decline nằm trong `/companion` ở mức tối thiểu; trang F09 riêng chưa route trong mini app |

## 4. Những gì KHÔNG được làm (giữ nguyên bất biến)

- Không tự publish nội dung thay thầy; không gắn nhãn approved cho draft.
- Không merge F02 vào main nếu chưa qua review; không deploy backend nhánh
  F02 lên Render trong task này.
- Không reset/tác động dữ liệu thật (100 accounts/50 proposals không đụng).
- Không phá pin revision: bản mới publish không tự migrate enrollment.

## 5. Kiến trúc quyết định chính (ADR tóm tắt)

1. **Provider đọc trực tiếp B16 ContentItem** (1 row = 1 revision bất biến,
   clone_draft → rev+1) thay vì bảng nội dung riêng — đúng lifecycle
   WF-15, không nhân bảng, không đụng ownership admin_core (chỉ READ).
2. **FamilyAgreement là instance mới**, không tái biến đổi
   AgreementAcceptance (giữ tương thích API/web cũ); hai tầng rõ ràng:
   acceptance cá nhân (template) vs thỏa ước gia đình của cặp.
3. **Role pair trong agreement chỉ mang tính hiển thị**, lấy từ F16
   ClassAccount nếu có, fallback an toàn; quyền không phụ thuộc role này
   (confirm gate = membership + generation + revision).
4. **UI /companion thay vì trang /program mới** — route sẵn có, home đã
   trỏ tới, tránh đụng `router.js` (F15 đang dùng).

## 6. Checklist test thiết bị (cho Huy, sau khi Antigravity deploy)

1. HS đăng nhập → `/companion` → thấy chương trình (sau khi nội dung được
   publish) → "Tham gia chương trình" → xác nhận.
2. Xem tuần 4 TRƯỚC tuần 1 — mọi tuần mở được.
3. HS tick "Tôi đã làm" hoạt động tuần 1 → tải lại vẫn đúng; PH tick riêng
   của PH → hai bên KHÔNG thấy tiến độ của nhau.
4. "Bỏ qua"/"Đặt lại" hoạt động đúng; nghỉ chương trình (opt-out) rồi tham
   gia lại được.
5. Tuần 4: HS "Đề xuất thỏa ước" → HS xác nhận (dialog) → PH xác nhận trên
   máy PH → trạng thái "Cả hai đã cùng xác nhận".
6. "Mời cùng làm" hoạt động tuần 1 → PH thấy "Chấp nhận cùng làm" → accept.
   (Sau sửa R1: nút mời hiện trên payload backend thật; lời mời dùng revision
   từ catalog F09; nếu hoạt động chưa publish thì nút khóa kèm lý do.)
7. Ẩn máy mạng/bật lại: lỗi load hiện ErrorState "Thử lại", không fake
   thành công; đăng xuất vào lại không mất trạng thái máy chủ.
8. (R4) Bật chế độ máy bay rồi bấm "Tôi đã làm": hiện thông báo chưa lưu
   được + nút bật lại cho thử lại chủ động; tắt máy bay bấm lại → lưu được.
   Bấm liên tục khi đang gửi chỉ gửi đúng một lần.
9. (R2) Hai bên xác nhận thỏa ước rev 1 xong, một bên đổi sang nội dung rev
   mới và "Đề xuất": bản rev 1 vẫn hiện "đang hiệu lực" kèm bản rev mới "đang
   chờ hai bên"; rút đề xuất thì rev 1 vẫn nguyên.
10. (R4) Đăng xuất ngay sau khi bấm lưu (trước khi máy chủ trả lời): phản
   hồi muộn KHÔNG hiện lên phiên của người đăng nhập sau.
