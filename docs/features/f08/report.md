# Report — F08 Nhật ký riêng và nhật ký song hành (B08)

- Feature ID / nhánh / US: F08 / feat/f08-private-shared-journals / US-016, US-031
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Trang riêng owner-only**: title/content/search/count đều chỉ chủ sở hữu
  đọc được (search icontains scoped theo owner); không analytics, không log
  body; teacher/sysadmin 404 (test).
- **Prompt published-only** qua prompt provider port (B16 content ở B18;
  double TEST-ONLY labgrants): trang lưu topic_code tham chiếu; topic chưa
  publish/không tồn tại bị chặn 400.
- **Revision guard cho nháp/offline** (US-016): PATCH bắt expected_revision;
  lệch → 409 revision_conflict "page_changed_elsewhere" — không ghi đè mù
  khi reload/đồng thời; mobile hiện hướng dẫn tải lại.
- **Share từng trang + revision** (US-031): grant (page, recipient,
  revision hiện hành) + connection generation lúc share (UNIQUE); sửa trang
  bump revision → tự ẩn khỏi người nhận tới khi share lại; không có đường
  share cả lịch sử.
- **Song hành (JournalReply)**: responder viết phản hồi trên grant CÒN
  hiệu lực; 1 reply/(page, responder), sửa in-place; reply KHÔNG mở đường
  đọc trang revoke/sửa (read path re-check mọi điều kiện, fail-closed 404);
  owner đọc replies trên trang MÌNH (context của mình).
- **Delete sạch**: xóa trang cascade shares + replies (test 0 orphan);
  apply_user_deletion hook cho F15/WF-21.
- **Mobile**: journal.js (prompts dropdown, revision-guarded editor, label
  riêng/chia sẻ rõ, share flow từng trang) + journal-shared.js (đọc trang
  được chia sẻ + soạn phản hồi + my-replies); textContent mọi dữ liệu động.
- Registry F08 routes "" (urls mang prefix journal/); harness carry-forward.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f08_journal
node --test packages/family_bridge_mobile/f08_journal/tests/f08.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f08_journal python manage.py test harness labgrants family_bridge_features.f08_journal
```

Kết quả: f08 17/17 backend PASS; suite rộng 45/45 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Index (owner, updated_at, id) cursor keyset; search icontains trên 2
  cột có index owner prefix; share index (recipient/owner, created_at);
  reply UNIQUE (page, responder) + index (page, created_at); delete dùng
  CASCADE DB-level (không quét application-level).

## Security/privacy

- SEC-03/04: private-by-default; owner-only mọi đường; admin/teacher 404.
- SEC-05: bounds (content 8000, title 120, reply 4000, search 100);
  unknown fields reject; không truncate.
- WF-04/DEC-04: per-page grant revision-bound; sửa không tự share;
  revoke không mở qua reply path (test).
- Không scan/upload bắt buộc — wording khuyến khích sổ giấy.
- Không log body; error details không chứa nội dung (core sanitizer).

## Kết quả

- PASS: 17 backend f08 + 45/45 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL race share/edit/reply (không DB).
- BLOCKED: none trong phạm vi module; prompt provider thật (B16 sau US-009
  duyệt) + ConnectionReader thật (F01) + grant provider đăng ký vào F15
  policy (B18).

## Còn lại / Input cần

- B18: wire prompt provider thật; register JournalShareService grant
  provider (item_type="journal_page") vào F15 policy registry; nối
  ConnectionReader thật; hướng dẫn sổ giấy là nội dung B16.
