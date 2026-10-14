// Hub Cá nhân — vai trò XEM TRƯỚC (không phải quyền), trạng thái đăng nhập
// F01, kết nối hai phía, các mục chưa làm đều disabled kèm lý do, không giả
// hành động. Logout revoking server-side + dọn state trong memory.
import { h } from "../../app/dom.js";
import {
  getSession, getSessionGeneration, hasLiveSession,
} from "../../core/session.js";
import {
  createButton, createCard, createDialog, createStatusBadge, createTopBar,
} from "../../components/index.js";

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

let markRenderCancelled = () => {};

export const page = {
  id: "profile",
  title: "Cá nhân",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    let cancelled = false;
    const openDialogs = new Set();
    markRenderCancelled = () => {
      cancelled = true;
      // A08: đóng dialog do trang này mở khi destroy.
      const dialogs = Array.from(openDialogs);
      openDialogs.clear();
      for (const dialog of dialogs) {
        try { dialog.close(); } catch { /* đã đóng rồi */ }
      }
    };

    const state = readState(ctx.store);
    const root = h("div", { class: "fb-page", dataset: { page: "profile" } });

    root.appendChild(createTopBar({ title: "Cá nhân" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const demo = Boolean(state.demoMode);
    const roleLabel = state.role === "caregiver" ? "Người chăm sóc" : "Học sinh";

    body.appendChild(
      createCard({
        title: "Vai trò xem trước",
        description: `Bạn đang xem giao diện với vai trò: ${roleLabel}. Đây chỉ là lựa chọn trải nghiệm, không phải quyền quản trị.`,
        footer: createButton({
          label: "Đổi vai trò xem trước",
          variant: "ghost",
          onClick: () => {
            Promise.resolve(ctx.setRole(null)).then(() => ctx.navigate("/role-select"));
          },
        }),
      }),
    );

    // ---- trạng thái đăng nhập (F01) ----
    const logged = demo || hasLiveSession();
    let logoutSection = null;
    if (demo) {
      body.appendChild(
        createCard({
          title: "Đăng nhập (dữ liệu minh họa)",
          description:
            "Bản xem trước đang dùng phiên dữ liệu minh họa trong bộ nhớ, không phải phiên Zalo thật.",
          children: createStatusBadge({ tone: "info", label: "Dữ liệu minh họa" }),
        }),
      );
    } else if (logged) {
      const session = getSession();
      const expiryText = session && session.expiresAt
        ? new Date(session.expiresAt).toLocaleString("vi-VN", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })
        : "không rõ";
      const logoutButton = createButton({
        label: "Đăng xuất",
        variant: "danger",
        onClick: () => {
          const dialog = createDialog({
            title: "Đăng xuất?",
            message:
              "Phiên đăng nhập trên thiết bị này sẽ bị thu hồi. Dữ liệu bạn chia sẻ theo từng mục vẫn giữ nguyên theo lựa chọn của bạn.",
            actions: [
              { label: "Ở lại", variant: "ghost", onClick: () => dialog.close() },
              {
                label: "Đăng xuất",
                variant: "danger",
                onClick: () => {
                  dialog.close();
                  doLogout();
                },
              },
            ],
          });
          openDialogs.add(dialog);
        },
      });
      body.appendChild(
        createCard({
          title: "Đăng nhập",
          description: `Phiên của bạn hết hạn lúc ${expiryText}. Mã định danh Zalo của bạn được máy chủ xác minh, không lưu thông tin cá nhân thêm.`,
          children: logoutButton,
        }),
      );
      logoutSection = "ready";
    } else {
      body.appendChild(
        createCard({
          title: "Đăng nhập",
          description: "Bạn chưa đăng nhập. Đăng nhập bằng Zalo để tạo phiên riêng.",
          footer: createButton({
            label: "Đăng nhập",
            variant: "primary",
            onClick: () => ctx.navigate("/login"),
          }),
        }),
      );
      logoutSection = "none";
    }

    async function doLogout() {
      if (cancelled) return;
      // A04: adapter.logout() đã vô hiệu hóa phiên NGAY khi gọi (c101a59);
      // trang KHÔNG được clearSession() vô điều kiện nữa — nếu logout cũ
      // lỗi mạng sau khi người dùng đã chủ động đăng nhập lại, clear cũ
      // biến mất phiên MỚI. Guard theo generation cho CẢ hai nhánh.
      const startGeneration = getSessionGeneration();
      let revokeConfirmed = true;
      try {
        await ctx.adapter.logout();
      } catch (error) {
        revokeConfirmed = false; // client đã đăng xuất; server thu hồi CHƯA XÁC NHẬN
      }
      // Trang chết hoặc PHIÉN MỚI khác actor đã cài -> trang cũ không được
      // điều hướng hay đụng vào phiên mới.
      if (cancelled || getSessionGeneration() !== startGeneration) return;
      ctx.navigate(revokeConfirmed
        ? "/login?reason=logged-out"
        : "/login?reason=logged-out-pending");
    }

    // ---- kết nối hai phía (F01) ----
    body.appendChild(
      createCard({
        title: "Kết nối & lời mời",
        description:
          "Tạo mã mời, nhập mã mời, xác nhận kết nối hai phía hoặc hủy kết nối. " +
          "Hủy kết nối làm các quyền chia sẻ dựa trên kết nối mất hiệu lực.",
        footer: createButton({
          label: "Quản lý kết nối",
          variant: "primary",
          onClick: () => ctx.navigate("/connect"),
        }),
      }),
    );

    body.appendChild(
      createCard({
        title: "Cài đặt",
        children: h("div", { class: "fb-profile__actions" },
          createButton({
            label: "Quản lý chia sẻ & đồng ý — Sắp có",
            variant: "ghost",
            onClick: () => ctx.navigate("/privacy"),
          }),
          h("p", { class: "fb-page__note" },
            "Khi có, bạn sẽ chọn rõ từng thông tin muốn chia sẻ với người đồng hành trước khi bật tính năng này.",
          ),
          createButton({
            label: "Kiểm tra kết nối máy chủ",
            variant: "ghost",
            onClick: () => ctx.navigate("/connection-check"),
          }),
          createButton({
            label: "Tìm trợ giúp",
            variant: "ghost",
            onClick: () => ctx.navigate("/help"),
          }),
        ),
      }),
    );

    body.appendChild(
      h("p", { class: "fb-page__note" }, "Phiên bản xem trước US-003 + F01"),
    );

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
