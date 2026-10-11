# Đề xuất quyết định kỹ thuật (provisional) — chờ Huy/Thầy chốt

Các mục dưới đây là lựa chọn kỹ thuật lead áp dụng **chỉ cho môi trường phát
triển synthetic** để các nhánh có thể lập trình và kiểm thử độc lập. Đây
KHÔNG phải phê duyệt pháp lý/chuyên môn, và không áp dụng cho dữ liệu thật
cho tới khi quyết định tương ứng (DEC-xx) được đơn vị phụ trách chốt.

| # | Đề xuất | Liên quan DEC | Giá trị provisional áp dụng | Điều kiện chốt thật |
| --- | --- | --- | --- | --- |
| P-01 | Trang list: default 20 / max 50, cursor (created_at,id) | DEC-17 | đã code trong `family_bridge_core.drf.cursor_paginate` | US-004 nghiệm thu hợp đồng |
| P-02 | Text private/public ≤ 4.000 code point, JSON body ≤ 64 KiB | DEC-17 | đã code trong `family_bridge_core.validation` | UX + DSA đo thực tế |
| P-03 | TTL mã mời kết nối: 7 ngày, single-use, rate limit 30 claim/giờ/actor | DEC-17 | dùng trong F01 tests synthetic | Thầy/owner chốt TTL thật |
| P-04 | Session token ứng dụng: TTL 24h, revoke API, không refresh token trong MVP | DEC-14 | JWT ngắn hạn + bảng session revoke (F01) | Cơ chế thật của Zalo được xác minh |
| P-05 | Idempotency key: client sinh, 8..128 ký tự, lưu vô hạn thời gian? — lưu kèm message, dọn theo retention sau khi DEC-12 chốt | DEC-12/17 | key bắt buộc với mọi send | DEC-12 retention |
| P-06 | AI provider registry: chưa chọn provider ⇒ `ai_enabled=false`, mọi request AI trả `module_unavailable`, viết tay/help luôn dùng được | DEC-16 | off theo mặc định, adapter + fake provider test được | Provider được đơn vị chọn + budget |
| P-07 | Suppression floor: chưa chốt ⇒ KHÔNG xuất bất kỳ báo cáo nào (k=null = fail closed), engine test bằng synthetic policy riêng | DEC-15 | không có endpoint report thật trả dữ liệu tổng hợp ngoài synthetic tests | Phụ trách nghiên cứu chốt k/differencing |
| P-08 | Lịch sử tin sau unlink: fail-closed body người khác; sender giữ bản mình (theo đề xuất MVP ERD) | DEC-13 | code theo fail-closed + ghi rõ hạn chế | Thầy + owner US-023 chốt |
| P-09 | Deletion: có DeletionRequest + ledger tombstone; retention chưa chốt ⇒ chặn thu dữ liệu thật (production gate), không tự xóa nền | DEC-12 | synthetic tests dùng policy 30 ngày ghi nhãn rõ | Privacy owner duyệt retention |
| P-10 | Appointments: module conditional — không có staff/availability thật thì API trả `module_unavailable` cho booking mới, danh bạ/help vẫn mở | DEC-18 | state machine + tests synthetic | Có staff thật |
| P-11 | Notifications ngoài app: KHÔNG triển khai gửi; chỉ ghi điều kiện nghiên cứu US-019 | US-019 | disabled + tài liệu gate | Zalo OA/template/policy thật |
| P-12 | Step-up admin nhạy cảm: trong MVP áp "re-auth fresh session + audit" tối thiểu; KHÔNG tạo nút xác nhận giả | DEC-14 | gate: nếu provider chưa hỗ trợ, action nhạy cảm bị chặn trong production | Đơn vị chốt cơ chế |

Mọi đề xuất khác cần đưa vào đây trước khi code, kèm lý do rủi ro/tải thực.
Không tự quyết thay đơn vị về: retention thật, privacy/legal, nghiên cứu,
staff, billing/AI handling, enrollment migration.
