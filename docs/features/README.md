# docs/features/ — báo cáo và hồ sơ từng feature

Mỗi nhánh feature (B01..B17) tạo thư mục `docs/features/<fxx>/` gồm:

| Tệp | Nội dung |
| --- | --- |
| `scope.md` | Phạm vi nhánh: US/FL/AF liên quan, ranh giới, những gì KHÔNG làm |
| `api.md` | Endpoint schema cụ thể (bổ sung openapi.yaml phần của mình), lỗi map |
| `test.md` | Danh sách case + lệnh chạy + môi trường |
| `report.md` | Báo cáo bắt buộc (mẫu dưới) |
| `manual-review.md` | Checklist nghiệm thu thủ công: actor, thao tác, kỳ vọng |
| `manifest.json` | Machine-readable: endpoints, screens, models, policy/deletion hooks, deps |

## Mẫu report.md (bắt buộc theo PROMPT TỔNG §13.1)

```markdown
# Report — Fxx <tên>

- Feature ID / nhánh / US: ...
- Baseline SHA (B00) / head SHA: ...
- PR URL: ...

## Đã có
- Models/services/endpoints/screens: ...
- Expected vs actual: ...

## Lệnh kiểm tra từ môi trường sạch
```bash
# backend
bash tests/feature-lab/scripts/test_feature.sh <app_label>
# (nếu có MySQL) FB_TEST_DB=mysql ... ghi môi trường
# frontend
node --test packages/family_bridge_mobile/<label>/tests/
```

## Tài khoản synthetic / cách vào preview
- ...

## Migration/settings/dependency cần bước tích hợp
- ...

## DSA
- Bounds, cấu trúc dữ liệu, thời gian/bộ nhớ phụ trợ, query/index/pagination/payload, bằng chứng (Q20/Q50 khi có)

## Security/privacy
- SEC IDs áp dụng, access matrix, race/current-grant, secret evidence

## UI
- Trạng thái/màn đã làm vs mock, chưa có Stitch asset

## Kết quả
- PASS / FAIL / NOT_RUN / BLOCKED + môi trường + lệnh + expected/actual
- Tests skip và cases chưa chạy hiện RÕ

## Còn lại / Blocker / Input cần
- ...
```

## Nguyên tắc trung thực

- Test dùng mock chỉ chứng minh hợp đồng với mock — không chứng minh provider
  thật/Zalo thật/tích hợp thật.
- SQLite không chứng minh MySQL/race/locking; suite MySQL phải chạy với
  `FB_TEST_DB=mysql` và được ghi NOT_RUN khi chưa có MySQL.
- Không tự gán "Đã nghiệm thu/Zalo verified/Thầy duyệt".
