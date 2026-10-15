// Màn hình đăng nhập web (mã tài khoản + mật khẩu) — tái tạo card chia đôi
// w02 Stitch (brand panel + form). CHỈ dùng ở host web (không phải Zalo):
// Zalo Mini App giữ nguyên đường đăng nhập SDK.
//
// TRUNG THỰC:
// - Không tự sinh phiên, không demo-fallback; lỗi ném ra hiển thị theo kind/code.
// - KHÔNG dòng "bằng việc đăng nhập bạn đồng ý..." (implied consent đã bị cấm):
//   footer ghi rõ đăng nhập ≠ đồng ý nghiên cứu/chia sẻ dữ liệu, dẫn tới
//   Cài đặt & Riêng tư để xem/rút lựa chọn.
// - Mật khẩu chỉ giữ trong bộ nhớ form, gửi thẳng qua adapter (HTTPS).
import { h } from "../../app/dom.js";
import { createButton, createCard } from "../../components/index.js";

/** Thông báo lỗi đăng nhập lớp học — đúng hợp đồng backend (401 generic,
 * 429 rate_limited, cold-start timeout/network). KHÔNG đoán thêm. */
export function credentialLoginErrorMessage(error) {
  const fallback = "Đăng nhập chưa thành công. Vui lòng thử lại.";
  if (!error) return fallback;
  const code = error && error.code ? String(error.code) : "";
  const reason = error && error.details && error.details.reason
    ? String(error.details.reason) : "";
  if (error.kind === "timeout" || error.kind === "network") {
    return "Máy chủ có thể đang khởi động (bản dùng thử). Hãy thử lại sau khoảng một phút.";
  }
  if (error.kind === "stale_session") {
    return "Phiên đã thay đổi trong lúc xác thực. Vui lòng thử lại.";
  }
  if (error.kind === "configuration") {
    return error.message || fallback;
  }
  if (error.status === 429 || code === "rate_limited" || reason === "rate_limited") {
    return "Bạn đã thử nhiều lần. Vui lòng đợi khoảng 15 phút rồi thử lại.";
  }
  if (error.status === 401 || code === "not_authenticated" || reason === "invalid_credentials") {
    // 401 GENERIC — không tiết lộ mã tồn tại hay không.
    return "Mã tài khoản hoặc mật khẩu chưa đúng.";
  }
  if (error.status === 400) {
    return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại mã tài khoản và mật khẩu.";
  }
  return fallback;
}

/**
 * Tạo form đăng nhập (mã + mật khẩu). onLogin({code,password,timeoutMs}) do
 * trang gọi adapter; trả về root element. UI tự quản busy/error.
 */
export function createCredentialForm({ onLogin } = {}) {
  const form = h("form", {
    class: "fb-cred__form",
    novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      submit();
    },
  });

  const codeField = h("div", { class: "fb-field" });
  const codeInput = h("input", {
    class: "fb-input fb-cred__input",
    id: "fb-cred-code",
    type: "text",
    autocomplete: "username",
    placeholder: "Ví dụ: HS001 hoặc PH001",
    required: true,
  });
  codeField.appendChild(
    h("label", { class: "fb-field__label", for: "fb-cred-code" },
      "Mã tài khoản ",
      h("span", { class: "fb-cred__required", "aria-hidden": "true" }, "*"),
    ),
  );
  codeField.appendChild(codeInput);
  codeField.appendChild(
    h("p", { class: "fb-field__hint" },
      "Mã định danh cá nhân do người phụ trách lớp bàn giao"),
  );

  const passwordField = h("div", { class: "fb-field" });
  const passwordInput = h("input", {
    class: "fb-input fb-cred__input fb-cred__input--password",
    id: "fb-cred-password",
    type: "password",
    autocomplete: "current-password",
    placeholder: "••••••••",
    required: true,
  });
  const eyeButton = h("button", {
    class: "fb-cred__eye",
    type: "button",
    "aria-label": "Hiện hoặc ẩn mật khẩu",
    "aria-pressed": "false",
    onclick: () => {
      const shown = passwordInput.type === "text";
      passwordInput.type = shown ? "password" : "text";
      eyeButton.setAttribute("aria-pressed", shown ? "false" : "true");
      eyeButton.textContent = shown ? "Hiện" : "Ẩn";
    },
  }, "Hiện");
  passwordField.appendChild(
    h("label", { class: "fb-field__label", for: "fb-cred-password" },
      "Mật khẩu ",
      h("span", { class: "fb-cred__required", "aria-hidden": "true" }, "*"),
    ),
  );
  passwordField.appendChild(
    h("div", { class: "fb-cred__password-row" }, passwordInput, eyeButton),
  );

  form.appendChild(codeField);
  form.appendChild(passwordField);
  form.appendChild(
    h("div", { class: "fb-cred__help-row" },
      h("a", { class: "fb-cred__help-link", href: "#/help" },
        "Quên mật khẩu hoặc cần trợ giúp đăng nhập?"),
    ),
  );

  const errorLine = h("p", { class: "fb-cred__error", role: "alert", hidden: true });
  form.appendChild(errorLine);

  let busy = false;
  const submitBtn = createButton({
    label: "Đăng nhập vào không gian",
    variant: "cta",
    size: "lg",
    type: "submit",
  });
  form.appendChild(submitBtn);

  function setBusy(next) {
    busy = next;
    submitBtn.disabled = next;
    codeInput.disabled = next;
    passwordInput.disabled = next;
  }

  async function submit() {
    if (busy) return;
    const code = codeInput.value.trim();
    const password = passwordInput.value;
    if (!code || !password) {
      errorLine.textContent = "Vui lòng nhập đủ mã tài khoản và mật khẩu.";
      errorLine.hidden = false;
      return;
    }
    setBusy(true);
    errorLine.hidden = true;
    submitBtn.textContent = "Đang xác thực…";
    try {
      await onLogin({ code, password });
      // Thành công: trang chủ luồng proceedAfterLogin điều hướng — form giữ
      // trạng thái busy cho tới khi router thay trang.
    } catch (error) {
      setBusy(false);
      submitBtn.textContent = "Đăng nhập vào không gian";
      errorLine.textContent = credentialLoginErrorMessage(error);
      errorLine.hidden = false;
    }
  }

  return { form, errorLine };
}

/** Card trung thực khi máy chủ báo tắt đăng nhập mã tài khoản. */
export function createLocalClassDisabledCard() {
  return createCard({
    title: "Đăng nhập bằng mã tài khoản chưa được bật trên máy chủ.",
    description:
      "Máy chủ trả lời rằng cổng đăng nhập này đang tắt. Không thể đăng nhập bằng mã tài khoản lúc này. " +
      "Bạn có thể mở trang Trợ giúp để liên hệ người phụ trách lớp.",
    footer: h("a", { class: "fb-cred__help-link", href: "#/help" }, "Đến trang Trợ giúp"),
  });
}
