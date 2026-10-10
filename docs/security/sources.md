# Danh mục nguồn bảo mật đã đối chiếu

Tra cứu ngày 10/10/2026. Dùng nguồn sơ cấp; catalog là điểm vào cho nghiên cứu tiếp, không tuyên bố đã đọc hết mọi tài liệu/lỗ hổng. Hướng dẫn phải áp dụng đúng phiên bản repo. Link có thể đổi; khi viết code kiểm tra lại nguồn hiện hành. Các tài liệu dự án là tổng hợp và quyết định thiết kế, không bản sao tiêu chuẩn.

| Nguồn / phiên bản | Dùng giải quyết vấn đề | Tài liệu dự án |
| --- | --- | --- |
| [OWASP Top 10:2025](https://owasp.org/Top10/2025/) | 10 nhóm rủi ro web, gồm supply chain và exceptional conditions | security-rules mapping |
| [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | Object/property/function ACL, abuse, SSRF, inventory, upstream | SEC-01..15/29 |
| [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) | Yêu cầu kiểm chứng chi tiết; khi ghi requirement ID phải kèm version | Verification gate, không tự chứng nhận |
| [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/) | Thiết kế phép thử auth, session, input, config, logic | verification-plan; chọn stable version khi lập kế hoạch |
| [OWASP MASVS](https://mas.owasp.org/MASVS/) | Mobile storage/network/privacy/platform/code | Áp dụng phần JS Mini App kiểm soát; không coi là native app chứng nhận |
| [OWASP GenAI LLM Top 10 2025](https://genai.owasp.org/llm-top-10/) | Prompt injection, disclosure, output, agency, misinformation, cost | SEC-16..18 + LLM mapping |
| [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Least privilege, default deny, mỗi request và relation scopes | SEC-03/04/08 |
| [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) | Secret lifecycle, revoke/rotate, least privilege | SEC-19 và incident runbook |
| [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) | Chọn event, không log nội dung nhạy cảm, log injection | SEC-22/28 |
| [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | Network/URL allowlist, redirects, boundary issues | SEC-13 |
| [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | Defense in depth; prompt không là quyền | SEC-17 |
| [Django 5.2 Security](https://docs.djangoproject.com/en/5.2/topics/security/) | ORM, escaping, CSRF/HTTPS, framework limits | SEC-09/11/12/27 |
| [Django 5.2 Deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/) | DEBUG, hosts, secret, TLS, deploy checks | SEC-19/27 |
| [DRF throttling](https://www.django-rest-framework.org/api-guide/throttling/) | Cache/concurrency limits; không defense đầy đủ cho brute-force/DoS | SEC-14 |
| [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) | Least privilege, untrusted input, SHA pinning, secrets | SEC-26 |
| [Render environment/secrets](https://render.com/docs/configure-environment-variables) | Runtime configuration tách repo/frontend | SEC-19 |
| [Render private network](https://render.com/docs/private-network) | Network segmentation/DB service | SEC-20; private network không thay ACL |
| [Zalo Mini App Platform](https://docs.zaloplatforms.com/mini-app-platform) | SDK/runtime và tài liệu platform, entry cho auth/permission API | SEC-01/09/10, cần đối chiếu cụ thể App ID khi US-011 |
| [NIST SSDF SP 800-218 v1.1](https://csrc.nist.gov/pubs/sp/800/218/final) | Secure development lifecycle, release/dependency/vulnerability handling | SEC-25/26/28 |

Đọc thêm theo feature qua [OWASP Cheat Sheet index](https://cheatsheetseries.owasp.org/): JWT/session, XSS/SQL, CSRF, cryptographic storage, file upload/XXE, container, webhook, privacy và dependency management. Chỉ catalog thêm này không có nghĩa mọi trang con đã được đối chiếu chi tiết.

Không dùng bài viết “không thể hack” hoặc bản Top 10 2026 chưa xác minh để thay chuẩn đã xuất bản. Nghiên cứu bảo mật phải cập nhật khi xuất hiện advisory mới; không có thời điểm tra cứu nào bao phủ mọi tấn công tương lai.
