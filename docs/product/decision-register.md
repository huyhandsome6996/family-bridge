# Sổ quyết định Family Bridge

Ngày đối chiếu: 10/10/2026. Nguồn chốt: yêu cầu trực tiếp người dùng trong đợt workflow/admin, [scope](../project-scope.md), [backlog snapshot](../project/backlog-snapshot.json). CHỐT là yêu cầu phải giữ, không trạng thái code; ĐỀ XUẤT phải được duyệt trước áp dụng; OPEN là điều kiện chưa chốt, không cho admin tự điền tùy ý. Main tại baseline cbc40a402d2fcdaeb8be7f0eed3910299148dce8 chỉ có template Mini App và docs; PR #1 vẫn tách riêng.

## Yêu cầu đã chốt

| ID | Quyết định | Nguồn / hệ quả |
| --- | --- | --- |
| DEC-01 | React/Vite + zmp-sdk/zmp-ui, Django/DRF + MySQL; admin trong Mini App | Scope; không chuyển stack hoặc tạo web/RN trong đợt này |
| DEC-02 | 15 feature, giáo trình baseline 4 tuần; 4 chủ đề giữ mục đích hiện có | Scope/F02; admin sửa nội dung theo version, không tự thay số tuần/phạm vi nghiên cứu |
| DEC-03 | Pause tự chọn, cố định 300 giây server; hết giờ vẫn nháp | Scope/F06; US-034 cũ có quyền đổi khoảng chờ được supersede; không auto-send |
| DEC-04 | Item/recipient/revision grants, riêng tư mặc định, explicit send | F03/F04/F07/F08/F15; admin không sửa/đọc tâm sự thay gia đình |
| DEC-05 | System Administrator có toàn bộ capability quản trị được cấp rõ ở scope hệ thống | Yêu cầu mới; không tự mở rộng admin cũ, is_staff/superuser không bypass |
| DEC-06 | Một người có thể edit + review + publish bằng bước riêng có audit | Nhóm nhỏ; không đòi hai người thường trực, nhưng vẫn cần phê duyệt chuyên môn/pháp lý thật |
| DEC-07 | Brand: logo mẫu 03 hai lời thoại; #C65B43/#E4AB56/#FFF4E8/#713D32 | Yêu cầu mới; palette UI xanh cũ chỉ là đề xuất, thay bằng brand đã chốt; asset nguồn chưa có trong repo |
| DEC-08 | Không trì hoãn help, không auto-forward; hoạt động/survey tự nguyện | F02/F10/F11/F13/F14; module flags/quota không được cắt đường help |
| DEC-09 | Admin nghiên cứu chỉ aggregate an toàn kể cả System Administrator | F14/SEC-23; không raw response/mapping, không tùy ý hạ suppression |
| DEC-10 | Published/version tham chiếu bất biến; rollback có lịch sử và tái validation | Yêu cầu lifecycle; enrollment pin version, legal consent không tự chấp nhận |
| DEC-11 | Đợt này chỉ docs/rules/skills/checker; push trực tiếp main | Quyền riêng đợt workflow; không merge PR #1, migration/dependency/UI/deploy |

## Quyết định còn mở và phương án an toàn

| ID | Vấn đề / phương án đề xuất | Chủ thể chốt / gate | Khi chưa chốt |
| --- | --- | --- | --- |
| DEC-12 | Retention/xóa từng loại: nháp, AI/provider, thư đã gửi, survey, audit, backup; chưa chọn ngày mặc định | Thầy/đơn vị phụ trách quyền riêng tư + vận hành; trước dữ liệu thật | Không thu thật, không UI tự chọn lưu vĩnh viễn |
| DEC-13 | Tin sau unlink: MVP đề xuất recipient mất quyền body, sender giữ bản mình; reconnect không hồi sinh lịch sử | Thầy + owner US-023/004; trước giao tiếp thật | Fail-closed nội dung người khác, giải thích chính sách chưa nghiệm thu |
| DEC-14 | Session revoke/refresh, step-up cho admin: cơ chế hỗ trợ thực tế của Zalo, TTL, lost-account recovery | Owner US-011/012/014 + đơn vị; trước cấp admin thật | Không kích hoạt action nhạy cảm bằng UI fake step-up |
| DEC-15 | Suppression floor k, complementary suppression, filter/export chống differencing, paired-report policy | Phụ trách nghiên cứu + reviewer privacy US-010/025/045 | Không xuất report cohort; k=null không phải k=0 |
| DEC-16 | AI provider/model allowlist, xử lý/lưu/training, quota tiền/token, giới hạn an toàn min/max | Đơn vị thanh toán + security/US-008/025/029 | AI off, viết tay/help vẫn dùng; không nhập URL/key qua admin |
| DEC-17 | Baseline validation catalog (độ dài, số mục, TTL, rate, lô) là ĐỀ XUẤT cần chốt US-004 | Owner domain + UX/DSA; trước endpoint tương ứng | Giữ default-deny, không giới hạn vô hạn hoặc silently truncate |
| DEC-18 | Người sở hữu dịch vụ, staff tiếp nhận, consent đầu mối, RPO/RTO/backup cadence/billing/recovery | Thầy/đơn vị + operator US-006/018/046 | Không hứa 24/7, không bật hẹn khi thiếu operator |
| DEC-19 | Nhắc lịch trong app, opt-in, quiet hours, hạn mức; Zalo notification nằm US-019 riêng | Thầy + chủ US-019/044; trước scheduler | Không gửi ngoài app hoặc nhắc tự động chưa duyệt |
| DEC-20 | Cơ chế thay program pin cho người đang tham gia nếu có lỗi chuyên môn nghiêm trọng | Thầy + owner US-036/044, privacy | Retire nội dung nguy hiểm và hướng dẫn; không âm thầm migrate enrollment |
| DEC-21 | Upload logo/ảnh/attachment là mở rộng ngoài MVP; threat model/scan/storage trước | Security + owner US-004/014, quyết định riêng | Chọn asset đã kiểm tra trong build; không upload thực thi/file tùy ý |
| DEC-22 | Bổ sung schema typed config, lifecycle records và API quản trị sâu | US-004/014/020/024/025; cập nhật Task/ước lượng trước code | Docs không tạo migration/API hoặc thêm US ID giả |
| DEC-23 | Mức định danh/tuổi, đồng ý tham gia học sinh và quy trình trường | Thầy/đơn vị chuyên môn/privacy US-005/010/052 | Không tuyên bố tự hợp pháp hóa bằng checkbox |
| DEC-24 | Chế độ ghép cặp do quản trị cấp (admin-provisioned pairs, 18/10/2026): admin có CAP-23 `classroom.provision` cấp cặp tài khoản HS↔PH; LƯU tạo Connection ACTIVE ngay (canonical pair, generation mới, provenance `source=admin_provisioned`), HS/PH KHÔNG cần xác nhận ghép đôi hai phía qua /proposal | Huy (quyết định 18/10/2026); phạm vi: chỉ chế độ cấp phát lớp học F16 | Supersede mệnh đề "hai bên tự xác nhận mới thành kết nối" (project-scope bổ sung 16/10/2026) và WF-08 cho ĐÚNG phạm vi này; luồng invite/proposal tự nguyện giữ nguyên; admin không đọc nội dung riêng, không ghi consent hộ, không tự sinh grant, revoke/unlink vẫn theo FL-20; kết nối lại sau unlink là hành động admin riêng (generation mới, grant cũ không hồi sinh) |

## Quản lý quyết định

Mỗi quyết định mới ghi owner thật, ngày, lý do, tài liệu/phạm vi tác động, version và evidence khử dữ liệu; hiện chỉ ghi vai trò vì chưa được phân công tên. Không sửa lịch sử để giả vờ đã chốt. Thay DEC-01..11 cần chỉ dẫn riêng và review các invariants. Gắn điểm OPEN vào acceptance và gate trước pilot; không mark US Done/SEC VERIFIED từ bản sổ này.
