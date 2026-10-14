# Sở hữu US — toàn bộ 52 US Trello (quy hoạch 15/10/2026)

Nguồn hiện hành về phân công. Board: https://trello.com/b/UHuo0vGw
Nguyên tắc: một US chính không có hai người sửa cùng file trên hai nhánh khác nhau;
nhóm hỗ trợ (nền tảng/nội dung/admin/vận hành/kiểm thử) không bị mất khi xóa nhánh.

## 1. US thuộc 15 tính năng (owner = owner nhánh tương ứng, xem branches.json)

| US | Tính năng | Nhánh | Owner |
|---|---|---|---|
| US-011, US-013 | F01 | `tinh-nang/f01-dang-nhap-va-ket-noi-us011-us013` | Huy (lead) |
| US-036, US-044 | F02 | `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044` | unassigned |
| US-027 | F03 | `tinh-nang/f03-the-cam-xuc-us027` | unassigned |
| US-029, US-033 | F04 | `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033` | unassigned |
| US-021, US-028 | F05 | `tinh-nang/f05-hop-thu-va-phan-hoi-us021-us028` | Bạn 2 (US-021 trước, sau đó US-028) |
| US-030, US-034 | F06 | `tinh-nang/f06-ban-nhap-va-tam-dung-us030-us034` | unassigned |
| US-015, US-026 | F07 | `tinh-nang/f07-tam-trang-va-chia-se-us015-us026` | unassigned |
| US-016, US-031 | F08 | `tinh-nang/f08-nhat-ky-rieng-va-song-hanh-us016-us031` | unassigned |
| US-037 | F09 | `tinh-nang/f09-hoat-dong-va-bai-hoc-ngan-us037` | unassigned |
| US-032 | F10 | `tinh-nang/f10-can-duoc-lang-nghe-us032` | unassigned |
| US-022, US-035 | F11 | `tinh-nang/f11-diem-tua-du-phong-us022-us035` | unassigned |
| US-038, US-046 | F12 | `tinh-nang/f12-ho-tro-nha-truong-va-lich-hen-us038-us046` | unassigned |
| US-039 | F13 | `tinh-nang/f13-tim-tro-giup-us039` | Bạn 1 |
| US-040, US-045 | F14 | `tinh-nang/f14-khao-sat-va-bao-cao-us040-us045` | unassigned |
| US-012, US-017, US-023 | F15 | `tinh-nang/f15-quyen-rieng-tu-va-xoa-du-lieu-us012-us017-us023` | Huy (lead) |

Liên kết giữa US và US: US-028 thuộc F05 chính; F03 dùng kết quả phản hồi qua contract.
US-044 thuộc F02 chính; F08 có hướng dẫn sổ giấy nhưng không giành owner US-044.
US-034: yêu cầu hiện hành là 300 giây do máy chủ quyết, không auto-send (DEC-03) —
tiêu đề thẻ cũ nói "thầy chỉnh khoảng chờ" không dùng để lập trình.

## 2. Quản lý và nền tảng — US-001/002/003/004

| US | Nội dung | Owner hiện tại | Ghi chú |
|---|---|---|---|
| US-001 | Quản trị dự án | Huy (lead) | |
| US-002 | Nền tảng repo/CI | Huy (lead) | |
| US-003 | Nền tảng backend + Mini App | đã tích hợp (PR #3/#4, nằm trong main) | công việc còn lại tách theo feature |
| US-004 | Schema/contracts nhất quán MySQL/TiDB | Huy (lead) — điều phối qua nhánh `bao-tri/chong-trung-mysql-tidb-us004` | W036 là **liên hệ** schema/contracts, không hoàn thành toàn US-004; patch tác động US-013/022/037/014 |

## 3. Nội dung / thầy xác nhận — US-005/006/007/008/009/010

Owner: cần người nội dung/admin — **chưa gán**. Nhánh feature không tự nghiệm thu nhóm này:
F13 không tự nghiệm US-006/024; F14 không tự duyệt US-010; gate nội dung, đồng ý, danh bạ
và retention/research policy giữ trung thực (admin xuất bản content cho F02/F03/F08/F09,
reply templates F05, danh bạ F12/F13, forms/policy F14).

| US | Nội dung |
|---|---|
| US-005 | Nội dung giáo viên/thầy xác nhận (cơ sở) |
| US-006 | Xác minh danh bạ trợ giúp |
| US-007 | Nội dung thẻ cảm xúc |
| US-008 | Nội dung bài học ngắn |
| US-009 | Nội dung khảo sát |
| US-010 | Duyệt policy/báo cáo tổng hợp |

## 4. Admin — US-014/020/024/025/041

Owner: admin_core có owner riêng ghi rõ (hiện Huy (lead) điều phối); không rải ownership
admin cho các nhánh feature chỉ vì feature cần content.

| US | Nội dung |
|---|---|
| US-014 | Quản trị kết nối/hỗ trợ (liên hệ W036) |
| US-020 | Quản trị nội dung xuất bản |
| US-024 | Quản trị danh bạ trợ giúp |
| US-025 | Quản trị khảo sát |
| US-041 | Báo cáo quản trị |

## 5. Vận hành / nghiên cứu thông báo — US-018/019

Owner: **chưa gán** — tạo nhánh nhiệm vụ ngắn khi có task cụ thể (không tính vào 15 F).

| US | Nội dung |
|---|---|
| US-018 | Vận hành thông báo |
| US-019 | Nghiên cứu/đánh giá |

## 6. Kiểm thử / nghiệm thu / phát hành / thử nghiệm — US-042/043/047/048/049/050/051/052

Owner: Huy (lead) điều phối; US-049 cần thiết bị Zalo thật (kịch bản hai tài khoản đã có
trong `docs/handover/f01-login-connections/two-account-script.md`). Test vài màn không
hoàn thành US-049; gate MySQL/TiDB và Zalo device giữ trung thực.

| US | Nội dung |
|---|---|
| US-042 | Kiểm thử tích hợp |
| US-043 | Nghiệm thu tính năng |
| US-047 | Kiểm thử hồi quy |
| US-048 | Chuẩn bị phát hành |
| US-049 | Thử nghiệm thiết bị thật (Zalo) |
| US-050 | Thử nghiệm người dùng thật |
| US-051 | Chốt phiên bản |
| US-052 | Vận hành sau phát hành |
