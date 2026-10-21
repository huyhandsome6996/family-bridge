# Kế hoạch xác minh và trạng thái bàn giao

## A. Hồ sơ hiện tại

Chỉ thêm docs/design/zalo-miniapp-stitch-20261021. Kiểm kê 87 HTML + 87 PNG + 1 Markdown; giữ ZIP gốc; path traversal/symlink/size được kiểm tra khi trích xuất; hash trong source-manifest.json. Chạy từ repo root:

```sh
python docs/design/zalo-miniapp-stitch-20261021/verify_bundle.py
python scripts/check_agent_docs.py
git diff --check
```

Rà soát nguồn ở dạng tĩnh và contact sheet không đồng nghĩa app/states đã được kiểm thử. Không chạy HTML bên ngoài/CDN, không đọc hoặc gọi production/third-party bằng secrets. Không có kiểm thử chức năng runtime mới trong nhiệm vụ hồ sơ. DSA/runtime/API/payload/SQL/concurrency app: N/A vì không đổi code; kiểm kê và hash đọc hữu hạn 175 tệp, tổng khoảng 23 MB.

## B. Coding agent phải chạy khi triển khai

Đọc package.json/workflow mới nhất để dùng đúng Node/Python và lệnh. Bộ cơ bản tại baseline hiện tại:

```sh
cd zalo-mini-app
npm ci
npm test
```

Build production luôn truyền origin API công khai:

```powershell
Set-Location zalo-mini-app
$env:VITE_API_BASE_URL='https://family-bridge-backend.onrender.com'
npm run build
npm run verify:build
```

POSIX tương đương: `cd zalo-mini-app && VITE_API_BASE_URL=https://family-bridge-backend.onrender.com npm run build`. Không dùng cú pháp PowerShell trong Bash hoặc ngược lại. `www` phải mới, manifest đúng các JS/CSS/dynamic chunks và URL backend có trong bundle. Nếu baseline chưa có build guard từ PR44, kiểm tra/port tối thiểu guard và regression phù hợp, không merge code khác mù quáng.

Từ repo root:

```sh
node scripts/check_import_boundaries.mjs
node --test packages/family_bridge_shared/tests/*.test.mjs
python scripts/check_agent_docs.py
git diff --check
```

Nếu shared source bị thay đổi bất đắc dĩ, coi là scope có tác động web: ưu tiên sửa Mini App để không cần thay shared. Nếu vẫn thực sự cần, ghi lý do, kiểm chứng toàn bộ web/shared regressions và không lén mở rộng backend/auth. Không sửa web nhằm thay cho Mini App. Các checks CI yêu cầu trên commit tích hợp phải xanh; test UI hỏng do thay markup cần cập nhật đúng hành vi, không bỏ privacy assertions.

## C. Bằng chứng UI bắt buộc

- Ảnh 24 route/state chính với demo synthetic, hai vai M06/M12; matrix M01–M24 ghi PASS/FAIL/NOT_RUN và link ảnh của bản chạy thật, không dùng screen.png của Stitch làm evidence đã code.
- 320/360/390/430px, text 200%, scroll và sheet dài, tên/nút dài, nội dung 4.000 ký tự, bàn phím/focus, back/close, host top/safe bottom. Browser viewport test là bằng chứng browser, không tự ghi Zalo Android/iOS PASS.
- Loading/empty/error/disabled/success, offline/resume; không fake success, không fallback demo khi API lỗi; lỗi giữ câu đang viết, không retry send tự động.
- Auth/consent gate, thay actor/logout, revoke/stale, draft conflict, đổi người nhận sau preview, hai phía mời/thỏa ước, admin ACTIVE không bắt confirm. Dùng stubs/local synthetic, không ghi consent hoặc nhắn cho người thật.
- AI off/loading/failure/stale, dùng gợi ý chỉ điền ô; từ chối vẫn viết tay; timer đủ 300 giây vẫn không tự gửi, help/signal không bị pause khóa. Test dùng fake clock/server DTO thay cho đợi/scan production.
- Scan source/diff/www không credentials, CDN/dependency mới, Google fonts/remote avatar, private storage hoặc nguyên HTML notes kỹ thuật. Đo tương phản và check label/focus/screen reader flow khi công cụ hỗ trợ; không suy từ chữ “WCAG” trong mock.
- Nếu không có thiết bị Zalo thật, ghi NOT_RUN kèm việc đã làm ở browser và chỉ rõ phần Codex/người dùng cần kiểm tra sau deploy; không dừng toàn bộ công việc hoặc đánh dấu tất cả PASS giả.

## D. Đưa main và bàn giao deploy

Sau các checks code/CI đạt, fetch main mới, tích hợp không ghi đè việc khác, kiểm tra lại đúng commit kết quả rồi push/merge main theo quyền chủ repo đã cấp trong prompt. Không force push/tắt protection. Không tự chạy deploy Zalo/Render, không xin token. Báo main SHA, branch SHA, tests/ảnh/deviation/NOT_RUN và build www có manifest+hash gắn với commit cuối để Codex chat gốc deploy.
