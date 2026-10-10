# Nhận diện Family Bridge

Yêu cầu đã chốt DEC-07 trong đợt workflow/admin. Đây là hợp đồng nhận diện, chưa thay UI/assets. [UI rules](../engineering/ui-rules.md), [catalog E](../product/admin-configuration-catalog.md) và [lifecycle](../product/content-lifecycle.md) điều khiển áp dụng.

## Logo

Logo **mẫu 03: hai biểu tượng lời thoại**, gợi giao tiếp và lắng nghe hai chiều. Không tự đổi thành icon khác, ảnh gia đình stock hoặc logo trắng/đen làm nhận diện chính. File nguồn logo mẫu 03 chưa có trong repo ở baseline; chỉ có logo template Zalo, không gọi đó là asset Family Bridge đã được duyệt. Cần đơn vị cung cấp file nguồn có quyền sử dụng, kiểm tra tỉ lệ/khoảng trống/độ rõ và đưa vào approved asset registry trong nhiệm vụ asset riêng. Không tái tạo từ mô tả rồi coi đúng mẫu đã chốt; screenshot/mockup không evidence upload đã hoàn tất.

## Tokens đã chốt và màu chức năng

| Token | Giá trị chốt | Dùng |
| --- | --- | --- |
| brand-primary | #C65B43 | Nhận diện đất cam ấm, logo/chi tiết brand; không ép thành nền CTA chữ trắng nếu thiếu contrast |
| brand-accent | #E4AB56 | Điểm nhấn vàng ấm, với chữ đủ đậm; không dùng chữ trắng nhỏ |
| brand-background | #FFF4E8 | Nền sáng ấm dễ đọc |
| brand-text | #713D32 | Chữ trên nền sáng; accent cần functional text khi chưa đạt |

Functional success/error/warning/info/disabled/focus là semantic tokens riêng, không bị single-accent rule của Taste cấm. Giữ nhãn/icon, không gán màu good/bad cho cảm xúc. CTA và focus có thể dùng dẫn xuất accessible như #A84733 trên #FFF4E8 sau preview/duyệt, không sửa brand-primary gốc để giấu khác biệt. Không dùng palette đề xuất xanh trong UI docs cũ làm brand dự án.

## Tương phản và preview

Luminance sRGB tính từ hex solid, tỷ lệ không bằng kết quả mọi màn hình thực:

| Pair foreground/background | Tỷ lệ gần đúng | Kết luận |
| --- | --- | --- |
| #713D32 / #FFF4E8 | 8.01:1 | Đủ body >=4.5:1 |
| #713D32 / #E4AB56 | 4.25:1 | Không giả định body đạt; điều chỉnh functional text khi cần |
| #FFF4E8 / #C65B43 | 3.89:1 | Không dùng body/CTA text thường nếu dưới 4.5 |

Các số trên được tính local bằng công thức luminance sRGB/contrast từ màu solid. #FFF4E8 trên functional action background #A84733 đạt khoảng 5.36:1; dùng chữ functional đậm #0F172A cho nền accent nếu body cần (solid ratio 8.72:1), vẫn kiểm tra pair render thực. Brand gốc vẫn giữ. Chữ thường >=4.5:1, chữ lớn >=3:1, control/focus >=3:1. Kiểm tra state/overlay/disabled/opacity/ảnh nền thực, không chỉ hex. Contrast validator không được cho bypass SYS. Preview student/caregiver/admin, consent/help, loading/error và 320px/200% chữ; text không clipping dấu Việt. Publish/rollback theo P3, giữ bản fallback đã đạt và history. Config không được che/ẩn trợ giúp hoặc làm unreadable consent; reject release sai, không auto sửa ý người dùng.

## Assets và upload ngoài MVP

Hiện chọn approved asset build registry, không URL/file tùy ý. Nếu đề xuất upload: DEC-21 cần quyết định riêng, threat model SEC-12/13/19/25/30. Baseline đề xuất: PNG/WebP <=512KiB, <=1024x1024, decode/validate magic/dimensions và re-encode server, strip metadata, random storage keys, scoped ownership, quarantine trước public release, MIME/extension không đủ. SVG/HTML/JS/archive/external URL từ user không chấp nhận ở MVP; SVG được trusted developer review/build có quy trình riêng. Scan không gửi dữ liệu user ra dịch vụ ngoài mặc định. Chống bombs/path traversal/overwrite/SSRF, bounded processing, riêng quyền upload/publish và audit refs, cache/version/hash/copyright provenance. Storage/retention và scanner phải chốt; docs không bật upload, không thêm dependency hoặc giả có asset.
