# Family Bridge — khôi phục AI ngày 21/10/2026

Đã merge [PR #45](https://github.com/huyhandsome6996/family-bridge/pull/45)
theo phê duyệt của Huy. Backend và web đã live ở commit
`015514c18e1293416f26c4dec7fb2340d1381f2f`.

- Backend deploy: `dep-dbc3k1gu01pc73cr7al0`, live lúc 11:06:22 giờ Việt Nam.
- Web deploy: `dep-dbc3k1gu01pc73cr7ai0`, live lúc 11:05:43 giờ Việt Nam.
- Workspace: My Workspace, đã được Huy xác nhận.
- Mini App Testing v5 tiếp tục dùng backend này, không cần upload lại để
  nhận thay đổi cấu hình AI; đóng/mở lại màn soạn để lấy trạng thái mới.

## Nguyên nhân và bản sửa

Trước sửa, backend thực tế vẫn chạy `ae022e4`; hai deploy main mới thất bại
vì migration 0003_seed_pilot_accounts tạo login_code đã tồn tại (MySQL 1062).
Đã loại bỏ thao tác tự tạo dữ liệu lớp học khỏi migration này và giữ đúng
graph/schema; không dùng --fake, reset mật khẩu, xóa lockout/tài khoản hoặc
khôi phục kết nối đã hủy. Cấp phát người dùng tiếp tục qua quy trình admin
tường minh. Các dữ liệu có thể đã bị tác động bởi lần seed cũ không tự sửa.

Đồng bộ khai báo ràng buộc duy nhất ContentItem với migration đã có để
schema drift check chạy đúng, không thêm/drop ràng buộc ở database.

Đã lưu FB_AI_ENABLED=true trên backend bằng cập nhật gộp. Key Gemini và
các biến khác giữ nguyên theo yêu cầu Huy. Log không chứa giá trị key.
Log runtime xác nhận:

```text
Applying f16_classroom.0003_seed_pilot_accounts... OK
Listening at: http://0.0.0.0:10000
F04 AI configuration: enabled=True key_present=True model_supported=True provider_wired=True
```

Docker Command rỗng, dùng CMD của Dockerfile. Health và readiness production
đều HTTP 200. Đăng nhập thật hai vai HS/PH từ roster local đều HTTP 200,
ai/status đều HTTP 200 với ai_enabled=true, logout HTTP 200.

## Kiểm thử

- Feature-lab: 806 test, 788 PASS / 18 SKIP (giới hạn SQLite/provider gates).
- Backend foundation: 53 test, 51 PASS / 2 SKIP.
- Backend core/classroom/migration regression: 13/13 PASS.
- Admin/F04/F16 sau đồng bộ metadata: 211 test, 202 PASS / 9 SKIP.
- AI UI tập trung: web 49/49, Mini App 51/51 PASS.
- CI tại head 556fd74: backend, MySQL, SQLite, production-guard, mobile,
  web, miniapp và agent-docs đều PASS.
- Zalo Android/iOS thực: NOT_RUN; không suy từ browser/SQLite tests.

## Kiểm chứng Gemini thật

Lần thử ban đầu ở cả hai vai bị 403 consent_required đúng hợp đồng vì
chưa có bản ghi ai_processing. Không tự bỏ gate hoặc ghi đồng ý hộ.
Kết quả provider thật sẽ được cập nhật sau khi người dùng xác nhận rõ
việc ghi nhận đồng ý cho tài khoản kiểm thử.

## Cách dùng

1. [Mở web](https://family-bridge-web.onrender.com/#/compose) hoặc mở lại
   [Mini App v5](https://zalo.me/s/3411096375330044972/?env=TESTING&version=5).
2. Đăng nhập HS/PH, viết vài dòng rồi bấm AI.
3. Đọc thông báo và tự chọn đồng ý xử lý AI nếu muốn sử dụng.
4. Xem/sửa gợi ý trước khi dùng. Gợi ý không tự gửi; xác nhận gửi là bước riêng.

Rollback không xóa dữ liệu và phải giữ bản sửa migration an toàn trong
recovery build. Không triển khai lại bản seed cũ để chữa lỗi AI.
