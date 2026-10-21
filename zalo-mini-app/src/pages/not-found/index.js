// Not-found — route không khớp (router fallback). Luôn có lối trở về an toàn:
// có phiên sống → về /home; khách chưa đăng nhập → về /welcome + đăng nhập.
// KHÔNG hiển thị URL/ID/token của đường dẫn lỗi; KHÔNG cam kết "dữ liệu an
// toàn" chỉ vì gặp 404 (M24 handoff).
import { h } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createEmptyState, createIcon, createTopBar,
} from "../../components/index.js";

export const page = {
  id: "not-found",
  title: "Không tìm thấy trang",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "not-found" } });

    root.appendChild(
      createTopBar({
        title: "Không tìm thấy trang",
        showBack: true,
        // Back lịch sử webview (mặc định của TopBar) — không tự chế route.
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const demo = Boolean(ctx.store.getState().demoMode);
    const authed = demo || hasLiveSession();

    body.appendChild(
      createEmptyState({
        title: "Không tìm thấy trang bạn cần",
        description:
          "Đường dẫn không tồn tại hoặc đã thay đổi. Bạn có thể quay về màn hình đầu để tiếp tục.",
        action: {
          label: "Về màn hình đầu",
          onClick: () => ctx.navigate(authed ? "/home" : "/welcome"),
        },
      }),
    );

    // Lối phụ theo trạng thái phiên (frame M24): khách → đăng nhập bằng mã
    // tài khoản; có phiên → quay lại trang trước. Không render URL/ID/token.
    if (!authed) {
      body.appendChild(
        createButton({
          label: "Đăng nhập bằng mã tài khoản",
          variant: "ghost",
          onClick: () => ctx.navigate("/login"),
        }),
      );
    } else {
      body.appendChild(
        createButton({
          label: "Quay lại trang trước",
          variant: "ghost",
          onClick: () => {
            if (window.history.length > 1) window.history.back();
            else ctx.navigate("/home");
          },
        }),
      );
    }

    // Trợ giúp luôn truy cập được từ fallback (M22 public).
    body.appendChild(
      h("section", { class: "fbc-help-pointer" },
        h("span", { class: "fbc-help-pointer__icon", "aria-hidden": "true" },
          createIcon({ name: "support_agent", size: 20 })),
        h("span", { class: "fbc-help-pointer__text" },
          h("span", { class: "fbc-help-pointer__title" }, "Cần hỗ trợ?"),
          h("span", { class: "fbc-help-pointer__hint" },
            "Trang Tìm trợ giúp luôn mở cho mọi người."),
        ),
        h("a", { class: "fb-btn fb-btn--ghost", href: "#/help" }, "Tìm trợ giúp"),
      ),
    );

    return root;
  },
};
