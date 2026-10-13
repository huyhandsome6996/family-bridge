// F01 — Đăng nhập: giải thích → đang đăng nhập → thành công / thất bại / thử lại.
// Chỉ gọi SDK trong Zalo thật (qua adapter). Trình duyệt thường: hiển thị
// hướng dẫn mở trong Zalo — KHÔNG đăng nhập giả. Demo (?demo=1): phiên fixture
// có nhãn dữ liệu minh họa, không phải phiên thật.
import { h } from "../../app/dom.js";
import { isZaloHost, getTestBuildLabel } from "../../core/config.js";
import { hasLiveSession } from "../../core/session.js";
import { POLICY_PURPOSES } from "../../core/policy.js";
import { loginErrorMessage } from "../../core/login-error.js";
import {
  createButton, createCard, createStatusBadge, createTopBar,
} from "../../components/index.js";

// destroy() chặn các cập nhật async của lần render gần nhất (đăng nhập chậm).
let markRenderCancelled = () => {};

export const page = {
  id: "f01-login",
  title: "Đăng nhập",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    markRenderCancelled = () => { cancelled = true; };

    const root = h("div", { class: "fb-page", dataset: { page: "f01-login" } });

    root.appendChild(
      createTopBar({
        title: "Đăng nhập",
        showBack: true,
        onBack: () => ctx.navigate("/how-to-use"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);
    const buildLabel = getTestBuildLabel();
    if (buildLabel) body.appendChild(createStatusBadge({ tone: "info", label: buildLabel }));

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);
    const reason = ctx.params && typeof ctx.params.get === "function"
      ? ctx.params.get("reason")
      : null;

    /** Sau khi có phiên: kiểm tra đồng ý -> consent hoặc bước kế tiếp.
     * Dùng chung cho cả nút “Tiếp tục” khi đã có phiên (A05). */
    async function proceedAfterLogin() {
      let serviceAccepted = false;
      try {
        const consents = await ctx.adapter.listConsents();
        const service = consents.find((c) => c && c.purpose === POLICY_PURPOSES.service.purpose);
        serviceAccepted = Boolean(
          service && service.decision === "accepted"
            && !service.withdrawn
            && service.policy_version === POLICY_PURPOSES.service.version,
        );
      } catch (error) {
        // Không đọc được trạng thái đồng ý -> dẫn sang trang đồng ý để người
        // dùng ghi nhận rõ ràng (không âm thầm coi như đã đồng ý).
        serviceAccepted = false;
      }
      if (cancelled) return;
      if (serviceAccepted && state.role) ctx.navigate("/home");
      else if (serviceAccepted) ctx.navigate("/role-select");
      else ctx.navigate("/consent");
    }

    // ---- banner phiên hết hạn / đã đăng xuất ----
    if (reason === "expired") {
      body.appendChild(
        createStatusBadge({ tone: "warning", label: "Phiên đã hết hạn. Vui lòng đăng nhập lại." }),
      );
    } else if (reason === "logged-out") {
      body.appendChild(
        createStatusBadge({ tone: "info", label: "Bạn đã đăng xuất." }),
      );
    } else if (reason === "logged-out-pending") {
      body.appendChild(
        createStatusBadge({ tone: "info", label:
          "Bạn đã đăng xuất trên thiết bị. Máy chủ CHƯA xác nhận được thao tác thu hồi — " +
          "phiên cũ sẽ tự hết hạn theo thời hạn; nếu nghi ngờ, đăng nhập lại và đăng xuất lần nữa.",
        }),
      );
    }

    // ---- đã có phiên sống: đi tiếp, không đăng nhập lại ----
    if (hasLiveSession()) {
      body.appendChild(
        createCard({
          title: "Bạn đã đăng nhập",
          description: "Tiếp tục chọn vai trò trải nghiệm hoặc về trang chủ.",
          children: createButton({
            label: "Tiếp tục",
            variant: "primary",
            size: "lg",
            // A05: đi tiếp phải qua kiểm tra đồng ý service hiện hành —
            // KHÔNG đi thẳng /home khi chưa chấp nhận điều khoản.
            onClick: () => { proceedAfterLogin(); },
          }),
        }),
      );
      return root;
    }

    body.appendChild(h("h2", { class: "fb-page__heading" }, "Đăng nhập bằng Zalo"));

    body.appendChild(
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

    function setBusy(next) {
      busy = next;
      loginButton.disabled = busy;
    }

    function fail(error) {
      if (cancelled) return;
      setBusy(false);
      statusLine.textContent = loginErrorMessage(error);
    }

    async function startLogin() {
      if (busy) return;
      setBusy(true);
      statusLine.textContent = "Đang đăng nhập…";
      try {
        await ctx.adapter.loginWithZaloToken();
        if (cancelled) return;
        statusLine.textContent = "Đăng nhập thành công.";
        await proceedAfterLogin();
      } catch (error) {
        fail(error);
      }
    }

    const loginButton = createButton({
      label: demo ? "Vào bản xem trước (dữ liệu minh họa)" : "Đăng nhập bằng Zalo",
      variant: "cta",
      size: "lg",
      onClick: startLogin,
    });

    if (!demo && !isZaloHost()) {
      // Trình duyệt thường: hướng dẫn mở trong Zalo, không giả lập đăng nhập.
      body.appendChild(
        createCard({
          title: "Hãy mở trong Zalo",
          description:
            "Bạn đang mở Family Bridge ngoài ứng dụng Zalo. Để đăng nhập, hãy mở Zalo, " +
            "tìm Mini App Family Bridge và mở nó — phiên đăng nhập sẽ được tạo an toàn bên trong Zalo.",
        }),
      );
      loginButton.disabled = true;
      loginButton.title = "Chỉ khả dụng khi mở trong ứng dụng Zalo.";
    }

    body.appendChild(loginButton);
    body.appendChild(statusLine);

    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Đăng nhập không đồng nghĩa với đồng ý nghiên cứu hay chia sẻ dữ liệu. " +
        "Nội dung riêng tư của bạn luôn theo quyền chia sẻ từng mục.",
      ),
    );

    body.appendChild(
      h("p", { class: "fb-page__aside" },
        h("a", { href: "#/help" }, "Tìm trợ giúp"),
      ),
    );

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
