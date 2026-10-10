# Tích hợp Taste Skill cho Family Bridge

Mục lục: [nguồn](#nguồn-và-tính-toàn-vẹn), [giới hạn](#giới-hạn-và-xử-lý-xung-đột), [đọc skill](#tìm-và-đọc-skill), [cập nhật](#cập-nhật-có-review), [nhánh](#đợt-tích-hợp-và-bằng-chứng).

## Nguồn và tính toàn vẹn

- Upstream: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill).
- Commit pin: [717446e07a78d4e6d7918b1fde1a263378eebac9](https://github.com/Leonxlnx/taste-skill/commit/717446e07a78d4e6d7918b1fde1a263378eebac9).
- [README tại commit pin](https://github.com/Leonxlnx/taste-skill/blob/717446e07a78d4e6d7918b1fde1a263378eebac9/README.md) gọi bản mặc định là **v2 (experimental)**, đang phát triển tới v2.0.0 stable; không tuyên bố đây là release stable.
- Chỉ sao chép hai blob bằng git show tại commit pin, không chạy skill.sh, npx installer hoặc cài cả bộ skill.
- Frontmatter upstream giữ nguyên name: design-taste-frontend; nội dung và bytes không chỉnh sửa. Quy tắc bổ sung nằm ở [family-bridge-ui](../../.agents/skills/family-bridge-ui/SKILL.md) và [UI rules](ui-rules.md).
- Giấy phép [MIT](../../.agents/skills/design-taste-frontend/LICENSE), nguyên văn **Copyright (c) 2026 Leonxlnx**. Giữ notice/license cùng mọi bản sao; không áp giấy phép này lên toàn repo.
- [upstream.json](../../.agents/skills/design-taste-frontend/upstream.json) là manifest cục bộ (không phải file upstream), lưu nguồn, phiên bản, commit, đường dẫn và SHA-256.

| Blob upstream | Bản trong repo | SHA-256 bytes |
| --- | --- | --- |
| skills/taste-skill/SKILL.md | .agents/skills/design-taste-frontend/SKILL.md | aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89 |
| LICENSE | .agents/skills/design-taste-frontend/LICENSE | 4575a543ab88dad12ccea7d97e563d0bce5b448b06072e65d3264497dad326df |

## Giới hạn và xử lý xung đột

Yêu cầu người dùng và quy tắc Family Bridge về scope/DSA/security/privacy/admin ưu tiên hơn lời khuyên Taste. Giữ upstream nguyên trạng để so sánh nguồn; không coi lệnh cài package trong appendices là quyền chạy installer.

| Hướng dẫn Taste | Áp dụng Family Bridge |
| --- | --- |
| Sections 0/11: đọc brief, audit trước redesign, giữ nội dung | Dùng cho bề mặt phù hợp; giữ consent/privacy và navigation; không thêm analytics theo gợi ý audit |
| Section 3: Next/RSC, Tailwind v4, Motion, font và bộ icon | React/Vite + zmp-sdk/zmp-ui; không Next/React Native, không tự thêm/nâng package/font. Tailwind v3 hiện có không đổi |
| Sections 4/6: hierarchy, rhythm, consistency, states, performance | Chọn phần hợp với điện thoại; màu success/error/warning được tách ngữ nghĩa, không ép một accent cho mọi trạng thái |
| Dials baseline 8/6/4, motion tăng khi redesign | Không kế thừa mặc định; task UI ưu tiên ổn định, ít chuyển động, density theo nội dung. Nếu dùng dials ở màn giới thiệu, nêu lý do và giới hạn trước |
| Section 6: reduced motion chỉ khi intensity >3 | UI rules áp reduced motion cho mọi animation không thiết yếu; không animation nặng, scroll hijack hoặc trì hoãn trợ giúp |
| Sections 10/12/14: hero, block library, marketing pre-flight | Không áp cho inbox, nhật ký, form/chia sẻ nhiều bước hoặc admin. Không thêm ảnh, hero, social proof, bento hay cắt consent để tick checklist |
| Section 13: dashboard/table/wizard ngoài scope | Tuân UI rules và component zmp-ui; không cài Fluent/Carbon/TanStack/AG Grid để “thay thế” tự động |
| Font/punctuation/emoji/line-count bans, forced dark mode | Không sửa nội dung đã duyệt/thẻ cảm xúc hoặc typography tiếng Việt để theo sở thích marketing. Không tự thêm dark mode |
| Section 12: đường dẫn skills/taste-skill/blocks | Chỉ là contract/vocabulary upstream; commit pin chưa có block files, không có bundled implementations. Không tạo link tới thư mục đó hoặc hứa block sẵn dùng |
| Lighthouse/Core Web Vitals targets | Có thể tham khảo khi có UI thực; không bằng chứng Zalo device, DSA hay security đã đạt |

Inbox, nhật ký, admin và luồng gửi dùng family-bridge-ui làm entry point. Màn giới thiệu/giải thích chương trình có thể chọn advice Taste phù hợp. Ghi sections đã dùng/loại và lý do trong PR UI. Không checklist nào được bỏ preview/recipient/confirm, tự gửi sau 5 phút hoặc mặc định mở dữ liệu riêng.

## Tìm và đọc skill

Hai skill mới được version hóa ở phạm vi repo, không cài global. Agent hỗ trợ repo skills có thể gọi $family-bridge-ui và $design-taste-frontend. Agent khác đọc trực tiếp:

- [family-bridge-ui/SKILL.md](../../.agents/skills/family-bridge-ui/SKILL.md) trước nhiệm vụ UI; có metadata agents/openai.yaml.
- [design-taste-frontend/SKILL.md](../../.agents/skills/design-taste-frontend/SKILL.md) trước khi dùng advice upstream. Upstream không có agents/openai.yaml tại commit pin; không sửa/thêm metadata upstream không cần thiết.

[AGENTS](../../AGENTS.md), [Copilot](../../.github/copilot-instructions.md), [Cursor](../../.cursor/rules/family-bridge.mdc) và [agent guide](agent-guide.md) chỉ rõ thứ tự đọc. Kiểm tra local discovery bằng đọc frontmatter/file và đường dẫn, không tuyên bố mọi IDE/agent tự kích hoạt.

## Cập nhật có review

1. Chọn commit mới rõ ràng, review diff SKILL.md/LICENSE/README so với commit đang pin và tình trạng experimental. Không theo main upstream tự động; không chạy installer từ xa.
2. Clone/fetch upstream trong checkout tạm riêng; xác minh commit tồn tại. Sao chép bằng git show, giữ bytes, kể cả newline. Ví dụ lệnh Python dưới chạy ở repo Family Bridge; thay commit mới và đường dẫn checkout đã kiểm tra:

```python
from pathlib import Path
import subprocess

upstream = Path('/path/to/separate/taste-skill-checkout')
commit = 'REPLACE_WITH_REVIEWED_40_HEX_SHA'
assert len(commit) == 40 and all(c in '0123456789abcdef' for c in commit)
subprocess.run(['git', 'cat-file', '-e', commit + '^{commit}'],
               cwd=upstream, check=True)
destination = Path('.agents/skills/design-taste-frontend')
for source, target in [('skills/taste-skill/SKILL.md', 'SKILL.md'),
                       ('LICENSE', 'LICENSE')]:
    data = subprocess.check_output(['git', 'show', f'{commit}:{source}'],
                                   cwd=upstream)
    (destination / target).write_bytes(data)
```

3. So sánh bytes/hash với upstream, cập nhật manifest, bảng checksum/commit và exception mapping; giữ MIT/copyright. Kiểm tra links/frontmatter và các quy tắc project không bị làm yếu. Hash xác minh bytes, không chứng minh nội dung an toàn.
4. Chạy python scripts/check_agent_docs.py và skill validator nếu môi trường có; không thêm dependency app chỉ để validate docs. Review diff/guardrails và báo các checks chưa thực hiện.
5. Theo chính sách xuất bản đang áp dụng và yêu cầu riêng của tác vụ. Riêng đợt này bắt buộc nhánh/Draft PR, không dùng quy tắc docs push thẳng main. Không tự merge; cần review đạt và chỉ dẫn merge riêng.

## Đợt tích hợp và bằng chứng

- Nhánh: chore/taste-skill-integration, bắt đầu từ origin/main 031fc4394609bec8dcfe798163a99841246380c3 sau fetch.
- Phạm vi: skills, UI rules, provenance, instruction adapters/indexes và checker tối thiểu. Không lấy code PR #1/nhánh chưa duyệt, không đổi runtime/dependencies/lockfile/backend/migrations/deploy.
- Đây là ngoại lệ cụ thể với chính sách tài liệu push thẳng main. Commit/push nhánh, mở Draft PR vào main và dừng. Không merge, auto-merge, force-push hay push main.
- Kiểm tra yêu cầu: document checker, frontmatter/name/description, local links/paths, wiring, MIT/copyright, SHA-256 và so bytes với blobs upstream. PR ghi kết quả lệnh và giới hạn thực tế.
- DSA/runtime: N/A vì text-only; checker đọc tập file hữu hạn, chi phí tuyến tính theo bytes tài liệu. Không query, payload API, concurrency hoặc benchmark app thay đổi.
- Security: guardrails SEC-03/04/07/08/16/18/19/22/23/24/25 được giữ/diễn giải trong tài liệu; không đổi status control register và không tuyên bố runtime security verified.
- Chưa kiểm chứng: hành vi agent/IDE thực, UI/accessibility/contrast trên giao diện thật, safe area/bàn phím/Zalo Android/iOS, MySQL, provider AI và deployment. Không có US nghiệp vụ được đánh dấu hoàn thành.
