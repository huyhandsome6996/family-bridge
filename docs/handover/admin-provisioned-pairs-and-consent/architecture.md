# Kiến trúc: nguồn sự thật của cặp + provenance

## Đường đi đầy đủ

```
Admin web (#/admin-provision)
  → POST /api/v1/classroom/admin/pairs-preview | pairs-apply  (Bearer session)
    → FBSDSessionAuthentication (f16) → request.user
    → AdminCapabilityService.has_capability("classroom.provision", scope)  [LỌC THẬT]
    → f16.services.admin_provision (validate → savepoint từng hàng)
      → Connection.objects.create(source="admin_provisioned", source_admin, source_batch)
      → đóng CompanionProposal cùng cặp (nếu đang mở) outcome_reason="admin_provisioned"
      → PairProvisionBatch (batch_ref unique — idempotency)
      → audit (admin_core AuditEvent, chỉ refs)
  → ConnectionReader (f01 InviteService) phục vụ mọi consumer:
    F03 cards, F05 inbox, F07 mood, F08 journal, F09 activities, F10 signal,
    F15 privacy, F02 (trên nhánh riêng) — đọc qua ConnectionView, không đổi.
```

## Mô hình provenance

- `f01.Connection` thêm 3 trường (migration `0003_connection_admin_provenance`):
  - `source` = `user_invite` (mặc định, dữ liệu cũ) | `admin_provisioned`;
  - `source_admin` = UUID admin actor (chuỗi);
  - `source_batch` = `batch_ref` của đợt (tham chiếu `f16.PairProvisionBatch`).
- `invite` chuyển **nullable**: kết nối do admin cấp KHÔNG có invite —
  không giả hành động xác nhận của ai. Luồng tự nguyện vẫn tạo invite thật.
- `ConnectionView`/`ConnectionReader` KHÔNG đổi — mọi consumer đọc qua view
  nên nullable invite không ảnh hưởng (đã rà từng consumer; xem test-report).

## Idempotency & đồng thời

- `batch_ref` (UUID do client tạo) là khóa idempotency: gửi lại CÙNG mã →
  trả kết quả ĐÃ LƯU của `PairProvisionBatch` (`replayed: true`), không
  xử lý lại. Chế độ timeout/network: client GIỮ nguyên mã đợt và cho phép
  gửi lại để máy chủ đối chiếu.
- Nghiệp vụ lặp (batch_ref khác) trên cặp đã active → `already_active`,
  không nhân đôi (unique `uniq_active_pair` là lớp cuối).
- Reconnect sau unlink: CHỈ khi hàng có `allow_reconnect=true` (admin tick
  chủ ý) → Connection mới `generation = last + 1`; bản cũ vẫn `revoked`;
  grant cũ của generation cũ KHÔNG hồi sinh.

## Scope lọc thật (sửa khoảng trống cũ)

`AdminCapabilityService.has_capability` TRƯỚC ĐÂY bỏ qua `scope_type`/
`scope_ref` (chỉ lọc user+capability+revoked). Nay:

- yêu cầu `global` → chỉ grant `global` thỏa;
- yêu cầu `school` + ref X → grant `global` thỏa, grant `school` chỉ thỏa
  khi `scope_ref == X` chính xác.

Grant cấp bằng `POST /api/v1/admin/capabilities/grant` (người có
`caps.grant`); không có đường self-grant (final-admin guard giữ nguyên).

## Consent & boot flow sau A

- Đăng nhập HS/PH → `consents_required` trả như cũ; thiếu service consent →
  màn Consent (mới theo Stitch) → sau đó home/role-select. Ghép đôi KHÔNG
  tạo consent — B06 trong test-report.
- Home/Người đồng hành/tín hiệu đọc `GET /api/v1/connections` — cặp admin
  cấp hiển thị như kết nối active thật; /proposal chỉ còn ý nghĩa với
  luồng tự nguyện (không ép qua /proposal với cặp đã cấp).

## Biên import (đã kiểm tra tự động)

- Shared `packages/family_bridge_shared` không chứa DOM/SDK/storage.
- web không import zalo-mini-app và ngược lại
  (`node scripts/check_import_boundaries.mjs` — exit 0).
- Trang admin chỉ có trên web; Mini App không thêm trang admin.
