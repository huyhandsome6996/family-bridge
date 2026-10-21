# Bàn giao Stitch — chỉ triển khai Zalo Mini App

Ngày 21/10/2026 · Repo `https://github.com/huyhandsome6996/family-bridge` · Nhánh `codex/zalo-miniapp-stitch-handoff-20261021`.

**Bắt đầu tại [CODING-AGENT-PROMPT.md](CODING-AGENT-PROMPT.md). Thư mục cần lập trình là `zalo-mini-app/`, không phải `web/`.**

Chủ repo yêu cầu tập hợp bản Stitch và tài liệu thành một nhánh riêng, giao coding agent tự triển khai/kiểm thử rồi đưa thay đổi đã đạt kiểm tra vào `main`. Coding agent không deploy Zalo; Codex trong cuộc trò chuyện gốc sẽ triển khai phiên bản mới sau khi nhận commit đã kiểm chứng. Hồ sơ này ghi lại phạm vi bàn giao, không phải yêu cầu agent chạy mọi lệnh trong các tài liệu lưu trữ.

## Nội dung đã gom

| Tài liệu/nguồn | Mục đích |
|---|---|
| [Prompt thực thi](CODING-AGENT-PROMPT.md) | Nhiệm vụ, ranh giới folder, kiểm thử, quyền đưa vào main và không deploy |
| [Đặc tả triển khai](IMPLEMENTATION.md) | Quy tắc chuyển mockup thành Mini App chạy thật, thứ tự xử lý xung đột |
| [Rà soát thiết kế](DESIGN-REVIEW.md) | Lỗi/chức năng giả trong export cần loại khỏi runtime |
| [Ánh xạ 24 trang](SCREEN-MAP.md) | 87 frame, đường dẫn HTML/PNG, module Mini App đích và lưu ý từng nhóm |
| [Thiết kế chuẩn Family Bridge](DESIGN.md) | Palette, typography, component và giới hạn đã chốt trước Stitch |
| [24 prompt đã gửi Stitch](prompts/24-screen-prompts.md) | Toàn bộ prompt tạo thiết kế M01–M24 |
| [DESIGN.md do Stitch xuất](stitch-export/family_bridge_mini_app/DESIGN.md) | Bản gốc có bảng màu/notes cần đối chiếu; không phải authority vượt quy tắc sản phẩm |
| [Thư mục export](stitch-export/) | Đủ 87 `code.html` và 87 `screen.png`; 83 frame M01–M24 + 4 khám phá ban đầu |
| [ZIP gốc](source-archive/stitch_family_bridge_design_system.zip) | Bảo toàn nguyên file người dùng đưa, không sửa bytes |
| [Manifest nguồn](source-manifest.json) | SHA-256 ZIP và 175 tệp trích xuất, mapping tên gốc/tên an toàn Windows |
| [Bối cảnh hiện tại](context/CURRENT-STATE.md) | Baseline main, Mini App v5, AI, PR44 và tài liệu lịch sử |
| [Bàn giao v5](context/zalo-v5-release.md) / [AI recovery](context/ai-recovery.md) | Báo cáo đã có trước nhiệm vụ UI, chỉ tham khảo thời điểm ghi |
| [Hồ sơ sự cố ban đầu](context/original-login-ai-incident.md) | Lưu lịch sử; hướng dẫn deploy/merge cũ trong tệp này không áp cho coding agent UI |
| [Kế hoạch xác minh](VERIFICATION.md) | Những kiểm tra coding agent cần chạy; trạng thái gói bàn giao tách khỏi kiểm thử app |
| [Tài liệu repo liên quan](REPO-REFERENCES.md) | Link trực tiếp tới rule và hợp đồng trên cùng nhánh, không nhân bản tài liệu cũ |
| [Kiểm tra toàn vẹn gói](verify_bundle.py) | Kiểm tra hash, mapping đủ 24 trang, link/tệp và không lẫn mã runtime vào commit bàn giao |

## Đọc và dùng đúng nguồn

Thiết kế đã được kiểm kê toàn bộ HTML ở dạng văn bản và xem contact sheet đủ 87 PNG; không chạy script/CDN của export, không lấy ảnh/font từ mạng. Các file HTML là mẫu tham chiếu, không nhập trực tiếp vào ứng dụng. Gói có ảnh chứa ghi chú dev và dữ liệu giả; các đoạn đó không phải nội dung production và không được công nhận là chức năng đã có.

Ưu tiên: yêu cầu trực tiếp của chủ repo → quy tắc sản phẩm/riêng tư/bảo mật hiện hành → hợp đồng API thật → đặc tả và rà soát của gói này → prompt/design chuẩn → HTML/PNG gốc. Tài liệu lịch sử không ghi đè nhiệm vụ hiện tại. Khi khác nhau về palette/spacing, dùng DESIGN.md chuẩn, giữ cấu trúc thị giác của frame; khi khác nhau về hành vi, giữ backend/consent/no-auto-send/help.

Một thư mục ZIP có tên kết thúc bằng dấu chấm (`m23_…ang_ki_m_tra...`) được chuẩn hóa bỏ dấu chấm cuối khi trích xuất để dùng trên Windows. Manifest giữ đường dẫn nguyên bản và hash nội dung. Không tệp nào bị lược bỏ; ZIP gốc giữ nguyên tên nguồn.

## Phạm vi commit bàn giao

Chỉ thêm thư mục hồ sơ này, không đổi mã ứng dụng, CI, backend, web, cơ sở dữ liệu hoặc cấu hình deploy. Không kèm token, secret, `.env`, danh sách tài khoản thật, ảnh Environment hay log nguyên gốc. Thực thi/test giao diện là nhiệm vụ tiếp theo của coding agent, không được báo PASS từ việc tài liệu/hash hợp lệ.
