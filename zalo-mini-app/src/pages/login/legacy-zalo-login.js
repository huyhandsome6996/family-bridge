// Implementation màn hình và nút "Đăng nhập bằng Zalo" cũ (F01 legacy).
// QUY ĐỊNH BẮT BUỘC CỦA CHỦ DỰ ÁN (Huy, 16/10/2026):
//  - Giữ NGUYÊN vẹn implementation, nội dung giải thích, nút và handler SDK.
//  - Bản triển khai HS/PH hiện tại HOÀN TOÀN KHÔNG có đường truy cập tới giao diện này.
//  - Khôi phục màn này sau này phải là thay đổi cấu hình/code và release có chủ đích,
//    theo yêu cầu mới của Huy; KHÔNG tự động bật vì backend provider zalo=true.
//  - Biến LEGACY_ZALO_LOGIN_ENABLED là compile-time false, không có query/hash/storage switch.

import { h } from "../../app/dom.js";
import { loginErrorMessage } from "../../core/login-error.js";
import { createButton, createCard } from "../../components/index.js";

/**
 * Cờ gate tắt hoàn toàn màn Zalo legacy trong bản triển khai hiện tại.
 * Mặc định: FALSE. Khôi phục sau này phải bằng code change/release có chủ đích.
 */
export const LEGACY_ZALO_LOGIN_ENABLED = false;

/**
 * Render màn hình đăng nhập Zalo cũ (nguyên bản F01 Zalo SDK).
 * Được giữ lại nguyên vẹn để tái sử dụng khi có yêu cầu release mới từ Huy.
 */
export function renderLegacyZaloLogin({ ctx, proceedAfterLogin, cancelled }) {
  const container = h("div", { class: "fb-legacy-zalo-login" });

  container.appendChild(h("h2", { class: "fb-page__heading" }, "Đăng nhập bằng Zalo"));

  container.appendChild(
    createCard({
      title: "Chúng tôi xác minh bạn như thế nào",
      description:
        "Family Bridge dùng tài khoản Zalo của bạn để tạo phiên đăng nhập riêng. " +
        "Chúng tôi chỉ nhận mã định danh Zalo của bạn — không yêu cầu số điện thoại, " +
        "không xin quyền đọc thông tin cá nhân. Máy chủ của chúng tôi xác minh phiên " +
        "với Zalo trước khi cho bạn sử dụng.",
    }),
  );

  let busy = false;
  const statusLine = h("p", { class: "fb-page__note", role: "status" });

  const zaloButton = createButton({
    label: "Đăng nhập bằng Zalo",
    variant: "cta",
    size: "lg",
    onClick: async () => {
      if (busy) return;
      busy = true;
      zaloButton.disabled = true;
      statusLine.textContent = "Đang đăng nhập…";
      try {
        await ctx.adapter.loginWithZaloToken();
        if (typeof cancelled === "function" && cancelled()) return;
        statusLine.textContent = "Đăng nhập thành công.";
        await proceedAfterLogin();
      } catch (error) {
        busy = false;
        zaloButton.disabled = false;
        statusLine.textContent = loginErrorMessage(error);
      }
    },
  });

  container.appendChild(zaloButton);
  container.appendChild(statusLine);

  container.appendChild(
    h("p", { class: "fb-page__note" },
      "Đăng nhập không đồng nghĩa với đồng ý nghiên cứu hay chia sẻ dữ liệu. " +
      "Nội dung riêng tư của bạn luôn theo quyền chia sẻ từng mục.",
    ),
  );

  container.appendChild(
    h("p", { class: "fb-page__aside" },
      h("a", { href: "#/help" }, "Tìm trợ giúp"),
    ),
  );

  return container;
}
