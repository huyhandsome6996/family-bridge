# Hướng dẫn coding agent trong repo

Mỗi tác vụ bắt đầu bằng đọc [AGENTS.md](../../AGENTS.md) và [phạm vi](../project-scope.md), sau đó hai skill và rule bắt buộc:

1. [family-bridge-dsa](../../.agents/skills/family-bridge-dsa/SKILL.md) + [DSA rules](dsa-rules.md).
2. [family-bridge-security](../../.agents/skills/family-bridge-security/SKILL.md) + [security rules](../security/security-rules.md).
3. Trước nhiệm vụ UI đọc [family-bridge-ui](../../.agents/skills/family-bridge-ui/SKILL.md) và [UI rules](ui-rules.md); đọc [Taste upstream](../../.agents/skills/design-taste-frontend/SKILL.md) trước khi dùng advice liên quan, cùng [nguồn/giới hạn](taste-skill-integration.md). Quy tắc Family Bridge ưu tiên hơn Taste v2 thử nghiệm.
4. Đọc tài liệu/US liên quan: [luồng 4 tuần](../product/four-week-flow.md), [ERD](../data/erd.md), [admin](../product/admin-capabilities.md), threat model và API contract.

Agent phải nêu tài liệu đã áp dụng, invariant và giới hạn; PR mã nguồn hoặc bản ghi commit tài liệu phải có DSA/SEC evidence. Không cần đọc lại nguyên file không đổi nhiều lần trong cùng tác vụ. Khi resume hoặc đổi scope, đọc phần thay đổi/liên quan. Không coi tài liệu là tính năng đã có.

## Entry point theo công cụ

| Công cụ | Entry point trong repo | Cách sử dụng |
| --- | --- | --- |
| Agent hỗ trợ AGENTS.md | AGENTS.md ở gốc | Đọc trước tác vụ và nested instructions phù hợp |
| Agent có repo skills | .agents/skills/family-bridge-dsa và family-bridge-security | Gọi $family-bridge-dsa / $family-bridge-security nếu hỗ trợ; nếu không đọc trực tiếp SKILL.md |
| GitHub Copilot | .github/copilot-instructions.md | Repository instructions; khả năng áp dụng phụ thuộc tính năng/cấu hình Copilot |
| Cursor | .cursor/rules/family-bridge.mdc | alwaysApply rule; kiểm tra rule được bật trong môi trường đang dùng |
| Agent khác | AGENTS.md + các đường dẫn trên | Yêu cầu đọc trực tiếp; không mặc định agent tự tìm mọi file |

Đây là skill được version hóa trong repo, không tuyên bố đã cài global cho mọi tài khoản/IDE. Bộ hướng dẫn đã được đưa trực tiếp vào main ngày 11/10/2026; checkout main mới nhất để sử dụng. Nội dung rule + review + CI tăng khả năng tuân thủ, không có file nào bảo đảm agent luôn obey hoặc hệ thống không bị hack.

## Ngoại lệ đợt Taste integration

Đợt chore/taste-skill-integration bắt đầu từ origin/main mới nhất, chỉ skill/tài liệu/checker tối thiểu, commit/push nhánh rồi mở Draft PR vào main và dừng review. Không lấy code nhánh chưa duyệt, push main, merge, auto-merge hoặc force-push. Chỉ merge khi review đạt và có chỉ dẫn merge riêng. Ngoại lệ này ưu tiên hơn quy ước tài liệu bên dưới.

## Quy ước đưa tài liệu lên main

Theo yêu cầu trực tiếp ngày 11/10/2026, các lần tạo/sửa skill, rule và tài liệu chỉ cần kiểm tra phù hợp rồi commit/push thẳng main, không mở PR hoặc hỏi xác nhận lại. Quy ước nguồn ở AGENTS.md. Bao gồm công cụ kiểm tra tối thiểu phục vụ tài liệu; không gộp runtime code, dependency, migration hoặc cấu hình triển khai vào commit tài liệu. Cập nhật trên main mới nhất, không force-push hoặc bỏ qua branch protection, không ghi đè thay đổi của người khác.

PR #1 vẫn giữ phần nền tảng Django/Mini App để review riêng. Khi chưa có backend/manage.py và workflow nền tảng trong main, các hướng dẫn chạy backend/kiểm thử app mô tả nhánh feat/us-003-kt01, không phải chức năng đã có trên main.

## Kiểm tra và nghiệm thu

Từ gốc repo chạy:

```bash
python scripts/check_agent_docs.py
```

CI có job agent-docs: required files, local links, frontmatter/skill metadata, adapter wiring, đủ SEC-01..30 và mapping F01..15. Script không đọc mọi secret trong repo, không xác minh public links/render Mermaid hoặc security/performance runtime. Các kiểm tra Mermaid và skill validator được chạy riêng khi soạn bộ tài liệu; không thêm thư viện render vào app chỉ để phục vụ tài liệu.

Khi triển khai feature, áp dụng [verification plan](../security/verification-plan.md), cập nhật [control register](../security/control-register.json) bằng bằng chứng thật, chạy checks tương ứng; không mark VERIFIED chỉ vì pipeline nền tảng xanh. Template PR có chỗ ghi complexity, bounds, query/payload, ACL/SEC, evidence và giới hạn.

Các phần cần chốt ở US-004/US liên quan: lịch sử sau unlink/reconnect, retention/provider AI, session revoke/step-up, cursor contract, suppression báo cáo và quy trình hỗ trợ trường. ERD nêu đề xuất, không tự tạo policy pháp lý hay dữ liệu nghiên cứu.

Nguồn định dạng: [AGENTS.md](https://agents.md/), [Copilot instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions), [Cursor rules](https://cursor.com/docs/rules).
