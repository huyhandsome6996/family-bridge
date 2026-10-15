# Stitch web handoff — map màn Stitch → route web thật (Task 2, M6)

Bản đồ bàn giao từ bộ thiết kế **Stitch web** (stitch_family_bridge_web_design_system,
kèm `docs/design/stitch-ui-upgrade/DESIGN.md` + `warm_sanctuary` DESIGN.md) sang
route thật của web build (`zalo-mini-app`, hash router). Mọi màn đều dùng dữ liệu
thật từ adapter (`zalo-adapter.js`) — không fixture trong UI production.

## 1. Bảng map Stitch → route

| Stitch | Route web | File chính | Ghi chú |
| --- | --- | --- | --- |
| w02 Đăng nhập | `#/login` | `src/pages/login/index.js` + `credential-form.js` | card chia đôi brand panel + form; capabilities probe trung thực |
| w05 Xác nhận ghép đôi | `#/proposal` | `src/pages/proposal/index.js` | checkbox khóa xác nhận; decline reason thật |
| w08 Trang chủ học sinh | `#/home` | `src/pages/home/index.js` | mood pill mã F07 thật; không gauge bịa |
| w09 Trang chủ người chăm sóc | `#/home` | `src/pages/home/index.js` | cùng page, vai trò do máy chủ trả |
| w10 Thư viện thẻ cảm xúc | `#/cards` | `src/pages/cards/index.js` | gửi phải qua preview + xác nhận cuối + key |
| w11/w12 Soạn thư cảm xúc | `#/compose` | `src/pages/compose/index.js` | nháp F06, pause 300s máy chủ, vòng đếm pause |
| w14 Hộp thư (master–detail) | `#/mailbox` | `src/pages/mailbox/index.js` | list KHÔNG có snippet → title-only |
| w15 Chi tiết thư + phản hồi | `#/messages/:id` | `src/pages/message/index.js` | markRead CHỈ khi direction=received |
| w16 Tín hiệu kết nối | `#/signal` | `src/pages/signal/index.js` | 3 nhu cầu từ `/signals/meta`, KHÔNG time-picker |

### Màn mở rộng (không có thiết kế Stitch riêng — đánh dấu "mở rộng")

| Route | Nguồn thiết kế | Ghi chú |
| --- | --- | --- |
| `#/settings` | **mở rộng** theo `warm_sanctuary/DESIGN.md` (w02 visual language) | đổi mật khẩu / mã đăng nhập / tên hiển thị / đăng xuất |
| `#/privacy` | **mở rộng** — port ngữ nghĩa F15 mobile (`packages/family_bridge_mobile/f15_privacy/pages/privacy.js`) | chia sẻ/thu hồi, yêu cầu xóa, rút đồng ý |
| `#/connect` | **mở rộng** — luồng invite classic F01 | mã mời hai phía |
| `#/consent` | **mở rộng** — đồng ý theo mục đích F01 (WF-17) | service/ai_processing/research |
| `#/help` | **mở rộng** — danh bạ F13 | public, không cần phiên |

## 2. Bảng deviation (sai lệch có chủ đích so với Stitch)

| Deviation | Lý do |
| --- | --- |
| w02: bỏ dòng "bằng việc đăng nhập bạn đồng ý…" | implied consent bị cấm (WF-17); đăng nhập ≠ đồng ý |
| "Người chăm sóc" thay cho "Giám hộ" | đúng từ ngữ sản phẩm; không tuyên bố quyền pháp lý |
| Không có read receipts | không xác nhận xem hai chiều (riêng tư, worklog Task 19) |
| Không fake metrics / "mã hóa nội bộ" / "bảo mật 100%" / hỗ trợ 24-7 | trung thực DSA/SEC; cấm tuyên bố không kiểm chứng được |
| Tên/ảnh demo Stitch thay bằng dữ liệu API thật | không dùng nhân vật minh họa trong production |
| Không Tailwind CDN | bundle CSS local (bất biến QA) |
| `focus-visible` cho mọi control | a11y theo ui-rules |
| w14: hàng danh sách chỉ tiêu đề | F05 list API không có snippet — không bịa đoạn xem trước |
| w16: bỏ time-picker | API tín hiệu không có trường thời gian gửi hẹn |
| w10: pills nhóm theo `group_code` thật | backend không có enum 6 nhóm như mẫu Stitch |
| Màn không có thiết kế riêng gắn nhãn "mở rộng" | minh bạch nguồn thiết kế để review |

## 3. Hợp đồng chung của mọi page web

- Export `page = { id, title, requiresRole, requiresAuth, showBottomNav, chrome, render(ctx), destroy? }`.
- `chrome: "app"` → bọc app-shell (sidebar 240px + topbar) từ w05/w08–w16.
- Lỗi phân loại theo `ApiError.kind`/`code`/`details.reason` — không suy từ status 0.
- Mọi thao tác gửi có bước xác nhận cuối; key idempotency tạo tại nút xác nhận.
- Không polling; dữ liệu mới khi tải lại/trang mở.
