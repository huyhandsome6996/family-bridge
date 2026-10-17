# Hướng dẫn kiểm thử cho Huy (tiếng Việt)

## Chuẩn bị

- Có tài khoản admin đã được cấp `classroom.provision` (xem admin-runbook §1
  — người có `caps.grant` cấp qua `POST /api/v1/admin/capabilities/grant`).
- Mật khẩu khởi tạo nếu muốn tạo tài khoản mới trong lúc test.

## Đường đi trên bản chính thức (Render — sau khi CI xanh)

| Vào đâu | URL |
| --- | --- |
| Web đăng nhập | `https://family-bridge-web.onrender.com/#/login` |
| Web Consent (mới theo Stitch — sau khi PR B merge) | `.../#/consent` |
| **Trang admin bảng hai cột** | `.../#/admin-provision` |
| Trang chủ / Người đồng hành | `.../#/home`, `.../#/companion` |
| Quyền riêng tư / Cài đặt | `.../#/privacy`, `.../#/settings` |

(Lưu ý: phiên web nhớ login lại sau mỗi refresh — token chỉ trong bộ nhớ,
không lưu storage — đây là hành vi bảo mật đã chọn, không phải lỗi.)

## Bài kiểm thử chính

| Vào đâu | Làm gì | PASS khi |
| --- | --- | --- |
| `#/admin-provision` (admin) | Chọn lớp → nhập 1 hàng PH001/HS001 → "Kiểm tra trước khi cấp" | Mỗi hàng có trạng thái rõ; chưa ghi gì |
| `#/admin-provision` | Bấm "Cấp tài khoản và kết nối" → xác nhận | Kết quả từng hàng xanh "Đã kết nối", kèm generation |
| Hai tab riêng | HS001 đăng nhập 1 tab, PH001 tab kia → Trang chủ/Người đồng hành | Thấy đúng nhau ngay, KHÔNG bị đẩy qua /proposal xác nhận |
| Consent | Đăng nhập tài khoản mới: chỉ tick Điều khoản, bỏ AI/Nghiên cứu | Tiếp tục được; không ai tick hộ từ lúc cấp cặp |
| `#/admin-provision` | Nhập hàng đảo vai (HS sang cột PH), thiếu mã, tài khoản khóa | Báo đỏ đúng hàng; không có hàng nào bị ghi nửa chừng |
| `#/admin-provision` | Lưu CÙNG cặp lần nữa | "Đã kết nối từ trước" — không nhân đôi, không reset mật khẩu đã đổi |
| `#/admin-provision` | Thẻ "Chuyển cặp đang chờ": Xem danh sách → Chuyển | Có số liệu trước khi chuyển; sau chuyển báo số đã active; chạy lại không nhân đôi |
| Quyền riêng tư | Đăng nhập PH xem phần riêng của HS | KHÔNG thấy nhật ký/tâm sự/AI riêng chỉ vì được ghép sẵn |
| Hủy kết nối rồi nạp lại | HS hủy kết nối → admin chạy lại backfill/bảng | KHÔNG tự hồi sinh; nối lại cần tick chủ ý → generation mới |
| Consent màn rộng | Mở 1280–1440px | Hai cột 5/7 hợp lý, không còn khung điện thoại hẹp giữa màn |
| Consent màn điện thoại | 320/390px, cuộn, zoom 200% | Không tràn ngang, checkbox ≥44px, CTA không bị che |

## Chuyển đổi bộ mẫu 100 tài khoản / 50 cặp (production)

Agent không truy cập được DB production (TiDB) — cần bạn hoặc người quản
trị DB chạy (máy có quyền kết nối TiDB, sau khi `migrate` theo runbook):

```
python manage.py backfill_class_pairs --admin-code <MA_ADMIN> --json   # xem trước, không ghi
FB_ADMIN_PROVISION_BATCH_REF=$(python -c "import uuid;print(uuid.uuid4())") \
python manage.py backfill_class_pairs --admin-code <MA_ADMIN> \
  --batch-ref-env FB_ADMIN_PROVISION_BATCH_REF --apply --json          # áp dụng
```

Hoặc làm trên web `#/admin-provision` → thẻ "Chuyển cặp đang chờ".
PASS khi: JSON báo `activated` = số cặp đủ điều kiện; đăng nhập thử vài cặp
thấy nhau ngay; chạy lại → `already_active` = toàn bộ, không nhân đôi.

## Nếu số thực tế khác 100/50

Báo lại số before/after in ra JSON (không tạo/xóa tài khoản để ép số).
Lệnh không bao giờ chạm cặp đã hủy/tài khoản khóa — chúng nằm ở
`blocked_pairs` kèm lý do.
