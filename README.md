# Family Bridge

Zalo Mini App được đề xuất để hỗ trợ giao tiếp giữa học sinh THPT và cha mẹ/người chăm sóc, với công cụ bày tỏ cảm xúc và chương trình đồng hành tự nguyện 4 tuần.

## Trạng thái main

Ngày 11/10/2026, main đã có bộ skill, rule và tài liệu chuẩn triển khai. Backend trên main còn trống và Mini App còn template ban đầu. Khung Django/DRF, MySQL/Render và màn hình Mini App gọi API nằm trong [PR #1](https://github.com/huyhandsome6996/family-bridge/pull/1), nhánh feat/us-003-kt01, chưa merge. 15 tính năng nghiệp vụ chưa triển khai; chưa deploy Render/phát hành Zalo hoặc kiểm thử trên điện thoại thật.

## Coding agent phải đọc

Đọc [AGENTS.md](AGENTS.md), [phạm vi](docs/project-scope.md), hai repo skills DSA/security và rule bắt buộc trước mỗi tác vụ. Theo yêu cầu người dùng, thay đổi chỉ về skill/rule/tài liệu được kiểm tra rồi push thẳng main; mã nguồn và runtime/deployment dùng nhánh/PR riêng. Riêng đợt chore/taste-skill-integration dùng nhánh/Draft PR và chờ review theo ngoại lệ trong AGENTS.md. Trước nhiệm vụ UI đọc [family-bridge-ui](.agents/skills/family-bridge-ui/SKILL.md); đọc Taste upstream khi áp dụng advice liên quan. Xem [hướng dẫn agent](docs/engineering/agent-guide.md).

- [UI rules](docs/engineering/ui-rules.md) và [Taste v2 pin/giới hạn/cập nhật](docs/engineering/taste-skill-integration.md)
- [DSA rules và ngân sách tài nguyên](docs/engineering/dsa-rules.md)
- [Security rules, threat model và nguồn](docs/security/security-rules.md)
- [Luồng đồng hành 4 tuần](docs/product/four-week-flow.md)
- [ERD và ràng buộc quyền dữ liệu](docs/data/erd.md)
- [Khả năng và giới hạn admin](docs/product/admin-capabilities.md)
- [Kiến trúc Django/DRF + MySQL + React Zalo Mini App](docs/architecture.md)
- [Hợp đồng API nền tảng](docs/contracts/api-foundation.md)
- [Hướng dẫn chạy khung code của PR #1](docs/development.md)
- [Trello audit](docs/project/trello-audit.md) và [52 US/phụ thuộc](docs/project/backlog-snapshot.json)
- [Bằng chứng và giới hạn kiểm tra](docs/validation.md)

Từ gốc repo kiểm tra tài liệu:

```bash
python scripts/check_agent_docs.py
```

CI trên main chỉ kiểm tra bộ hướng dẫn. Không suy ra runtime/security đã nghiệm thu từ job tài liệu đạt. Repo public: không commit secret/PAT, nhật ký, tâm sự hoặc khảo sát thật.
