# Trello update queue — TRELLO_NOT_UPDATED

Không có Trello token/connector trong môi trường này ⇒ KHÔNG thẻ nào
được sửa/tick. Queue dưới đây là các cập nhật CHỜ (Huy hoặc agent có
token thực hiện theo mẫu ở master prompt §11). KHÔNG tự tick các mục
"Huy/Thầy duyệt", "Zalo thật", "nội dung đã duyệt".

| US | Thao tác chờ | Nội dung cốt lõi |
| --- | --- | --- |
| US-004 (B00) | Comment tiến độ + move Chờ kiểm tra | PR #5; core packages/harness/OpenAPI; baseline frozen cc6ade2 |
| US-011/013 (B01) | Task checklist tick phần đã làm + PR link | PR #6; 46 backend tests PASS (2 MySQL-gated NOT_RUN) |
| US-012/017/023 (B15) | Như trên | PR #7; deny-by-default + deletion ledger |
| US-021/028 (B05) | Như trên | PR #8; single transport; 55/55 harness suite |
| US-027 (B03) | Như trên | PR #9 |
| US-029/033 (B04) | Như trên | PR #10; AI off vẫn dùng được |
| US-030/034 (B06) | Title/AC US-034 supersede fixed300 (giữ lịch sử) + PR | PR #11 |
| US-015/026 (B07) | Như trên | PR #12 |
| US-016/031 (US-038 cũng liên quan F12 riêng) | Như trên | PR #13 |
| US-032 (B10) | Như trên | PR #14 |
| US-022/035 (B11) | Như trên | PR #15 |
| US-039 (B13) | Như trên | PR #16 |
| US-038/046 (B12) | Như trên + ghi scheduling conditional | PR #17 |
| US-037 (B09) | Như trên | PR #18 |
| US-036/044 (B02) | Như trên | PR #19 |
| US-040/045 (B14) | Như trên + DEC-15 gate | PR #20 |
| US-014/020/024/025/041 (B16) | Như trên + scope primitives | PR #21 |
| US-018/019/051 (B17) | Như trên + note CI template cần token workflow scope | PR #22 |
| US-042/043/047/048 | B18 evidence comment | PR #23; regression 333/333 |
| US-049/050/051/052 | KHÔNG tick — chờ Antigravity/Huy/Thầy | Chỉ ghi "chuẩn bị xong" |

Quy tắc: move "Đang thực hiện"→"Chờ kiểm tra" (không Done); mỗi comment
dùng mẫu Nhánh/Đã làm/Còn lại/Vướng/Kiểm thử/PR/Trạng thái.
