# Quy hoạch nhánh Family Bridge — 15 tính năng + 1 bảo trì

Ngày áp dụng: **15/10/2026**. Quyết định bởi Huy qua prompt quy hoạch; thực hiện bởi lead coding agent.
Tài liệu này là **nguồn hiện hành** về phân công nhánh; các manifest/instruction ngày 11/10/2026
(`docs/project/full-build/plan.md`, `ownership.md`, `branch-manifest.json`) chỉ còn giá trị lịch sử
ở phần liên quan nhánh — xem ghi chú dated supersede trong từng file.

## 1. Cấu trúc nhánh hiện hành

- `main` — nhánh tích hợp. Chỉ nhận code qua PR đã review. Docs-only có thể push trực tiếp
  theo chính sách đã cấp (AGENTS.md), sau checks và fast-forward guard.
- 15 nhánh `tinh-nang/fxx-...` — đơn vị giao việc của 15 tính năng F01–F15.
- 1 nhánh `bao-tri/chong-trung-mysql-tidb-us004` — nhánh bảo trì **tạm thời** giữ patch W036
  (chống trùng MySQL/TiDB, liên hệ US-004, tác động US-013/022/037/014). KHÔNG phải F16,
  không phải US mới. Xóa theo quy trình sau khi tích hợp hợp lệ.

Danh sách đầy đủ, SHA gốc, owner, lock: `branches.json`.

## 2. Nhóm nhận việc

- **Huy / lead**: F01, F15, bảo trì W036, mọi tích hợp shared files (`shared-integration.md`).
- **Bạn 1**: F13 / US-039.
- **Bạn 2**: F05 / US-021, sau đó US-028.
- **Các nhánh khác**: `unassigned` — ghi trong `branches.json`. Nhánh đã tạo sẵn nhưng
  **tạo nhánh không có nghĩa tính năng đã được dựng lại** — code đã nằm trong main từ đợt
  PR #23/#24; việc còn lại là nối API/thiếu danh sách trong `docs/project/full-build/plan.md`
  (phần không bị supersede) và các phát hiện audit mới.

## 3. Vòng đời một nhánh tính năng

1. Checkout nhánh `tinh-nang/fxx-...` tương ứng (đã tạo sẵn từ cùng SHA main `f8fc6a4`).
2. Chỉ sửa **own paths** của mình (`branches.json`). Shared files → đề xuất cho lead,
   lead ghép bằng PR tích hợp nhỏ (`shared-integration.md`).
3. Chạy checks documented trong nhánh (tests, build, `check_agent_docs.py` khi đụng docs).
4. Mở **Draft PR về main** khi có diff thực. Không mở PR rỗng để "có vẻ đang làm".
5. Review → merge (squash/merge thường tùy lead) → **xóa branch sau merge**.
6. Nhiệm vụ tiếp theo (nếu cùng feature) tạo nhánh nhiệm vụ mới từ main đã cập nhật.
   Nhánh tính năng không phải nhánh song song tồn tại vĩnh viễn.

## 4. Quy tắc bắt buộc (giữ nguyên từ governance cũ)

- Không force-push, không ghi đè lịch sử người khác, không reset/clean worktree người khác.
- Một US chính không được có hai người sửa cùng file trên hai nhánh khác nhau.
- Lock files tạm thời (PR #32/#33/#34) liệt kê trong `branches.json` — nhánh bị tác động
  **không sửa các file đang khóa** cho tới khi người điều phối tích hợp.
- Không nhân đôi bảng Message/Connection/grants, không tạo API thứ hai cùng nhiệm vụ,
  không đưa `labgrants`, token cố định, dữ liệu test riêng tư hay policy lỏng vào runtime.
- Quy tắc nghiệp vụ giữ nguyên: consent/send tường minh, grant theo từng item, xác nhận
  hai chiều, **300 giây do máy chủ quyết / không auto-send**, help mở ngay, chương trình
  và khảo sát tự nguyện, admin không bypass dữ liệu riêng tư.
- Mock chỉ chứng minh phần module; nghiệm thu cần backend settings thật; MySQL/TiDB và
  Zalo thiết bị thật không được thay bằng SQLite/mock trong bằng chứng.
- US-034: tiêu đề cũ nói "thầy chỉnh khoảng chờ" — yêu cầu hiện hành vẫn **300 giây máy chủ,
  không auto-send** (DEC-03); không lập trình theo tiêu đề cũ.

## 5. PR và review

- Draft PR mô tả: tác dụng, phạm vi file, cách chạy test, giới hạn chưa kiểm chứng.
  Không chép PASS cũ thành PASS mới; bằng chứng CI gắn SHA.
- PR thay thế do quy hoạch: #32 (F01, thay #31), #33 (F15, thay #27), #34 (W036, thay #28)
  — cùng head SHA với PR cũ, lịch sử review giữ nguyên ở PR cũ.
- Không auto-merge. Không merge code/migration/dependency của PR đang review chỉ để dọn nhánh.

## 6. Xóa nhánh sau merge

Sau khi PR merge vào main: xóa branch remote (GitHub), xóa branch local trong clone của mình
khi không còn checked-out/dirty work. Không giữ tên legacy chỉ để lưu trữ; lịch sử nằm trong
main và PR history. Nhánh ngoài danh sách quy hoạch phát sinh mới → tự phân loại trước khi
xóa, không xóa theo tên.
