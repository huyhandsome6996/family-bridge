// Hub Cá nhân — vai trò XEM TRƯỚC (không phải quyền), trạng thái đăng nhập
// F01, kết nối hai phía, menu điều hướng theo frame M19 (chỉ route thật),
// demo tách biệt bằng banner chuẩn, logout có xác nhận + dọn state thật.
//
// Restyle Stitch M19: identity header + menu list nhóm (touch ≥48px), bỏ
// hotline/số điện thoại, không dashboard giám sát, phiên thật không đổi role.
import { h } from "../../app/dom.js";
import {
  getSession, getSessionGeneration, hasLiveSession,
} from "../../core/session.js";
import {
  createButton, createCard, createDialog, createDemoBanner, createIcon,
  createStatusBadge, createTopBar,
} from "../../components/index.js";

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

let markRenderCancelled = () => {};

/** Một hàng menu — chỉ dùng cho tính năng CÓ route thật (M19). */
function menuRow({ icon, label, hint, onClick }) {
  return h("button", { class: "fbc-menu__row", type: "button", onClick },
    h("span", { class: "fbc-menu__icon", "aria-hidden": "true" },
      createIcon({ name: icon, size: 20 })),
    h("span", { class: "fbc-menu__text" },
      h("span", { class: "fbc-menu__label" }, label),
      hint ? h("span", { class: "fbc-menu__hint" }, hint) : null),
    h("span", { class: "fbc-menu__chevron", "aria-hidden": "true" },
      createIcon({ name: "chevron_right", size: 20 })),
  );
}

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
    const logged = demo || hasLiveSession();
    const session = demo ? null : getSession();

    // ---- Demo tách biệt rõ: banner chuẩn ngay đầu trang (M19) ----
    if (demo) body.appendChild(createDemoBanner());

    // ---- Nhận diện: tên hiển thị (nếu có) + vai trò + trạng thái phiên ----
    const displayName = (session && session.displayName) || "";
    body.appendChild(
      h("section", { class: "fbc-id" },
        h("span", { class: "fbc-id__avatar", "aria-hidden": "true" },
          createIcon({ name: "account_circle", size: 28 })),
        h("span", { class: "fbc-id__text" },
          h("span", { class: "fbc-id__name" }, displayName || roleLabel),
          h("span", { class: "fbc-id__role" },
            demo
              ? "Bản xem trước với dữ liệu minh họa trong bộ nhớ"
              : "Tên gọi hiển thị cho người đồng hành — đổi tại Cài đặt"),
        ),
        createStatusBadge({
          tone: demo ? "info" : "success",
          label: demo ? "Dữ liệu minh họa" : "Đã đăng nhập",
        }),
      ),
    );

    // ---- vai trò XEM TRƯỚC (không phải quyền; phiên thật không đổi role) ----
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
      logoutSection = "demo";
    } else if (logged) {
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
      let logoutGeneration = getSessionGeneration();
      let revokeConfirmed = true;
      try {
        const pending = ctx.adapter.logout();
        logoutGeneration = getSessionGeneration(); // adapter has cleared the old session
        await pending;
      } catch (error) {
        revokeConfirmed = false; // client đã đăng xuất; server thu hồi CHƯA XÁC NHẬN
      }
      // Trang chết hoặc PHIÉN MỚI khác actor đã cài -> trang cũ không được
      // điều hướng hay đụng vào phiên mới.
      if (cancelled || getSessionGeneration() !== logoutGeneration || hasLiveSession()) return;
      ctx.navigate(revokeConfirmed
        ? "/login?reason=logged-out"
        : "/login?reason=logged-out-pending");
    }

    // ---- Menu nhóm 1: kết nối & chia sẻ (route thật) ----
    body.appendChild(h("h2", { class: "fbc-group-title" }, "Kết nối & chia sẻ"));
    body.appendChild(
      h("div", { class: "fbc-menu" },
        menuRow({
          icon: "group",
          label: "Người đồng hành",
          hint: "Tạo mã mời, nhập mã, xác nhận hoặc hủy kết nối hai phía",
          onClick: () => ctx.navigate("/connect"),
        }),
        menuRow({
          icon: "spa",
          label: "Tâm trạng của mình",
          hint: "Ghi cảm xúc hôm nay và lịch sử — mặc định chỉ mình bạn",
          onClick: () => ctx.navigate("/mood"),
        }),
        menuRow({
          icon: "favorite",
          label: "Được chia sẻ với bạn",
          hint: "Những mục người đồng hành chủ động gửi mở lòng",
          onClick: () => ctx.navigate("/mood-shared"),
        }),
      ),
    );

    // ---- Menu nhóm 2: hệ thống & minh bạch (route thật) ----
    body.appendChild(h("h2", { class: "fbc-group-title" }, "Hệ thống & minh bạch"));
    body.appendChild(
      h("div", { class: "fbc-menu" },
        menuRow({
          icon: "shield",
          label: "Riêng tư & đồng ý",
          hint: "Quản lý chia sẻ từng mục, yêu cầu xóa dữ liệu và rút đồng ý",
          onClick: () => ctx.navigate("/privacy"),
        }),
        menuRow({
          icon: "explore",
          label: "Kiểm tra kết nối máy chủ",
          hint: "Kiểm tra sức khỏe và trạng thái sẵn sàng của máy chủ",
          onClick: () => ctx.navigate("/connection-check"),
        }),
        menuRow({
          icon: "support_agent",
          label: "Tìm trợ giúp",
          hint: "Đầu mối hỗ trợ — luôn mở cho mọi người",
          onClick: () => ctx.navigate("/help"),
        }),
      ),
    );

    // ---- Cài đặt tài khoản (M20): đổi mật khẩu / mã đăng nhập / tên ----
    body.appendChild(
      createCard({
        title: "Cài đặt",
        description:
          "Đổi tên hiển thị, mật khẩu và mã đăng nhập — mọi thay đổi do máy chủ xác nhận.",
        footer: createButton({
          label: "Mở Cài đặt (đổi mật khẩu / mã đăng nhập / tên hiển thị)",
          variant: "primary",
          onClick: () => ctx.navigate("/settings"),
        }),
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
