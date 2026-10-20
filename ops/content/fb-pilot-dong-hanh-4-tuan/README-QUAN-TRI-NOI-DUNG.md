# Quản trị nội dung hoạt động — hướng dẫn cho người phụ trách

Tài liệu dành cho người có quyền `content.manage` / `content.publish` (do chủ
dự án cấp qua cơ chế capability của B16 — không ai tự cấp được cho chính mình).
Mọi thao tác đều đi qua lifecycle thật và ghi audit trail (không có đường tắt SQL).

## Nội dung hiện có

Bundle `fb-pilot-dong-hanh-4-tuan` (catalog `family-bridge-real-content-2026-10-20`):
1 chương trình 4 tuần + 16 hoạt động chung + 8 bài đọc một phút = 25 ContentItem.
Nguồn sự thật: `ops/content/fb-pilot-dong-hanh-4-tuan/content-items.json`
(bản biên soạn; hash canonical được in trong báo cáo import mỗi lần chạy).

## Import lần đầu hoặc máy mới (idempotent — chạy lại an toàn)

```bash
cd backend
# 1) Dry-run (MẶC ĐỊNH — không ghi gì, chỉ báo kế hoạch):
python manage.py import_content_bundle \
  --source ../ops/content/fb-pilot-dong-hanh-4-tuan/content-items.json \
  --actor <UUID-user-có-cap> --json

# 2) Apply (tạo 25 DRAFT):
python manage.py import_content_bundle ... --apply --json

# 3) Apply + Publish (24 item phụ trước, chương trình sau cùng):
python manage.py import_content_bundle ... --publish --json
```

Kết quả kỳ vọng ở bước 3 (khối `verify`):
`activities_in_catalog: 16, lessons_in_catalog: 8, lesson_minutes_ok: true,
program_parsed: true, program_weeks: 4, program_week_refs_total: 16,
program_refs_resolvable: true`.

Ý nghĩa outcome từng key:
- `created_draft` / `published` — vừa tạo/just phát hành
- `exists_same` / `already_published` — đã có sẵn, KHÔNG ghi gì (chạy lại an toàn)
- `conflict_payload_diff` / `conflict_pending_draft` / `conflict_retired` —
  KHÔNG tự ghi đè; xem kỹ trước khi xử lý bằng lifecycle (clone → sửa → publish)

## Sửa một hoạt động thường ngày (không cần đụng source JS)

1. Clone bản published thành bản nháp mới:
   `POST /api/v1/admin/content/<content_id>/clone` (cần `content.manage`)
2. Đóng gói payload mới (body là CHUỖI JSON, không phải object) và tạo draft
   key mới nếu muốn thay hoàn toàn: `POST /api/v1/admin/content`
3. Review nội dung, rồi phát hành:
   `POST /api/v1/admin/content/<content_id>/publish` với
   `{"expected_revision": <revision>}` (cần `content.publish`)
4. Thu hồi: `POST /api/v1/admin/content/<content_id>/retire` với
   `{"expected_revision": ..., "reason": "..."}` — người dùng đã pin revision cũ
   vẫn đọc được theo đúng chính sách (exact lookup), không rewind DB.

## Quy tắc bất biến (không được phá)

- KHÔNG tạo/tự cấp capability cho chính mình; grant chỉ từ operator khác.
- KHÔNG sửa status bằng SQL; chỉ qua create_draft/publish/retire/clone.
- KHÔNG seed tài khoản/enrollment/tiến độ/thư/tâm trạng/consent — importer chỉ
  tạo ContentItem.
- Body ≤ 8000 ký tự (mục tiêu ≤ 4000); title ≤ 120; key ≤ 64; minutes là số
  nguyên dương (micro-lesson = 1).
- Publish item phụ trước, chương trình sau; chương trình chỉ đọc được khi
  toàn bộ 16 tham chiếu đã published.

## Rollback nội dung

Không xóa published/history. Dùng `retire` đúng key/revision theo manifest,
giữ pin của người đã tham gia. Muốn quay về nội dung cũ làm mặc định:
clone bản cũ → review → publish revision mới theo lifecycle.
