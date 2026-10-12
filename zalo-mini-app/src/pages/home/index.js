// Home (U08/U09/U10) — dispatch theo vai trò xem trước: student | caregiver.
// Luồng kết nối:
//   - demo (adapter mock): getConnectionStatus trả fixture "đã kết nối" ->
//     hiển thị home đã kết nối kèm nhãn "Dữ liệu minh họa" rõ ràng.
//   - production (adapter zalo): cần phiên đăng nhập (F01). Có phiên -> gọi
//     listConnections() thật: có kết nối -> home đã kết nối (không hiện tên
//     người kia vì backend chỉ trả mã định danh nội bộ); chưa -> mời vào
//     /connect tạo/nhập mã mời hai chiều. Không fake-success, không fallback
//     tự động sang mock khi API lỗi.
// Nút "Con cần được lắng nghe" chỉ mở Sheet xem trước — KHÔNG gửi tín hiệu.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton,
  createCard,
  createSheet,
  createEmptyState,
  createErrorState,
  createStatusBadge,
  createDemoBanner,
  createTopBar,
  createSkeleton,
} from "../../components/index.js";

/** ctx.store có thể là snapshot hoặc module store — đọc state an toàn. */
function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Gắn sheet vào trang và dọn sạch khi đóng (phòng trường hợp component không tự xoá). */
function openSheetIn(root, sheetOptions) {
  let sheet;
  sheet = createSheet({
    ...sheetOptions,
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  root.appendChild(sheet);
  return sheet;
}

export const page = {
  id: "u08-home", // U08 student + U09 caregiver + U10 dispatch theo vai trò
  title: "Trang chủ",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const role = state.role;

    const root = h("div", { class: "fb-page", dataset: { page: "u08-home" } });
    root.appendChild(createTopBar({ title: "Trang chủ" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    // Phòng thủ: router đã chặn trước, nhưng nếu render thiếu vai trò thì
    // không gọi adapter, hướng người dùng về chọn vai trò.
    if (role !== "student" && role !== "caregiver") {
      body.appendChild(
        createEmptyState({
          title: "Chưa chọn vai trò xem trước",
          description: "Hãy chọn vai trò để xem giao diện tương ứng.",
          action: { label: "Chọn vai trò", onClick: () => ctx.navigate("/role-select") },
        }),
      );
      return root;
    }

    const demo = Boolean(state.demoMode);

    // Production: chưa có phiên sống -> mời đăng nhập (không redirect cứng,
    // giữ người dùng ở home sau khi đăng nhập xong họ bấm tiếp được).
    if (!demo && !hasLiveSession()) {
      renderNeedsLogin(body, ctx);
      return root;
    }

    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải trang chủ…"));

    const currentRun = ++runId;

    Promise.resolve()
      .then(() => {
        if (demo) {
          return ctx.adapter.getConnectionStatus();
        }
        return ctx.adapter.listConnections()
          .then((rows) => ({ rows, source: "backend" }));
      })
      .then((status) => {
        if (cancelled || currentRun !== runId) return null;
        if (status && status.source === "backend") return { status, profile: null };
        return Promise.resolve()
          .then(() => ctx.adapter.getProfile(role))
          .catch(() => null) // không có tên fixture -> chào chung, không chặn trang
          .then((profile) => ({ status, profile }));
      })
      .then((result) => {
        if (!result || cancelled || currentRun !== runId) return;
        if (result.status && result.status.source === "backend") {
          // Production thật: kết nối đọc từ backend.
          const rows = result.status.rows || [];
          if (rows.length) renderConnectedProduction(body, ctx, role, rows);
          else renderNotConnected(body, ctx);
          return;
        }
        renderConnected(body, ctx, role, result.status, result.profile);
      })
      .catch((error) => {
        if (cancelled || currentRun !== runId) return;
        if (error && error.status === 401) {
          // Phiên hết hạn/thu hồi: adapter đã clear session — về đăng nhập.
          ctx.navigate("/login?reason=expired");
          return;
        }
        renderLoadError(body, ctx, error);
      });

    return root;
  },
};

/** Dọn dẹp async/sheet khi router rời trang (router gọi page.destroy). */
let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ----------------------------- Đã kết nối (demo) ----------------------------- */

function renderConnected(body, ctx, role, status, profile) {
  clear(body);

  const peer = status && status.peer;
  const isFixture = Boolean(status && status.source === "fixture");

  if (isFixture) body.appendChild(createDemoBanner());

  const displayName = profile && profile.displayName;
  body.appendChild(h("h2", { class: "fb-page__heading" }, displayName ? `Xin chào, ${displayName}!` : "Xin chào!"));

  if (peer) {
    const peerRow = h("p", { class: "fb-home__peer" }, `Đang đồng hành với: ${peer.displayLabel} `);
    peerRow.appendChild(createStatusBadge({ tone: "info", label: "Dữ liệu minh họa" }));
    body.appendChild(peerRow);
    if (peer.note) {
      body.appendChild(h("p", { class: "fb-page__note" }, peer.note));
    }
  }

  if (role === "student") {
    renderStudentCards(body, ctx, peer);
  } else {
    renderCaregiverCards(body, ctx);
  }
}

function renderStudentCards(body, ctx, peer) {
  body.appendChild(
    createCard({
      title: "Thẻ cảm xúc",
      description: "Chọn thẻ cảm xúc để nói ra điều đang diễn ra với bạn.",
      footer: createButton({
        label: "Sắp có",
        variant: "ghost",
        disabled: true,
        title: "Tính năng thẻ cảm xúc sẽ có ở bản đầy đủ.",
      }),
    }),
  );

  body.appendChild(
    createCard({
      title: "Tiếng lòng chưa nói — Tuần 1",
      description:
        "Tuần đầu của lộ trình Đồng hành: học cách gọi tên cảm xúc của mình và chia sẻ điều buồn còn khó mở lời.",
      footer: createButton({
        label: "Xem lộ trình Đồng hành",
        variant: "ghost",
        onClick: () => ctx.navigate("/companion"),
      }),
    }),
  );

  body.appendChild(
    createCard({
      title: "Hộp thư",
      description: "Lời nhắn và phản hồi nhanh giữa bạn và người đồng hành.",
      footer: createButton({
        label: "Mở hộp thư",
        variant: "primary",
        onClick: () => ctx.navigate("/mailbox"),
      }),
    }),
  );

  // CTA tín hiệu — chỉ mở Sheet xem trước, không gửi gì cả.
  body.appendChild(
    createButton({
      label: "Con cần được lắng nghe",
      variant: "cta",
      size: "lg",
      onClick: () => openSignalSheet(body.closest(".fb-page") || body, peer),
    }),
  );
}

function openSignalSheet(root, peer) {
  const notice = h(
    "p",
    { class: "fb-page__note", role: "status" },
    "Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ.",
  );

  const content = h("div", {},
    h("p", {}, "Đây là bản xem trước. Bạn có thể chọn người nhận để xem giao diện — chưa có tín hiệu nào được gửi đi."),
  );

  if (peer && peer.displayLabel) {
    content.appendChild(
      createButton({
        label: peer.displayLabel,
        variant: "primary",
        onClick: () => {
          notice.textContent = `Đã chọn: ${peer.displayLabel}. Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ.`;
        },
      }),
    );
  }

  content.appendChild(notice);

  openSheetIn(root, {
    title: "Con cần được lắng nghe",
    content,
  });
}

function renderCaregiverCards(body, ctx) {
  body.appendChild(
    createCard({
      title: "Tín hiệu cần được lắng nghe",
      description: "Khi con gửi tín hiệu cần được lắng nghe, bạn sẽ thấy tín hiệu tại đây.",
      children: h("p", { class: "fb-page__note" }, "Chưa có tín hiệu mới."),
    }),
  );

  body.appendChild(
    createCard({
      title: "Bài học ngắn 60 giây",
      description: "Bài học ngắn gợi ý cách đồng hành cùng con mỗi tuần.",
      footer: createButton({
        label: "Sắp có",
        variant: "ghost",
        disabled: true,
        title: "Tính năng bài học ngắn sẽ có ở bản đầy đủ.",
      }),
    }),
  );

  body.appendChild(
    createCard({
      title: "Hộp thư",
      description: "Lời nhắn và phản hồi nhanh giữa bạn và con.",
      footer: createButton({
        label: "Mở hộp thư",
        variant: "primary",
        onClick: () => ctx.navigate("/mailbox"),
      }),
    }),
  );
}

/* --------------------------- Chưa kết nối (production) --------------------------- */

function renderNeedsLogin(body, ctx) {
  clear(body);
  body.appendChild(h("h2", { class: "fb-page__heading" }, "Xin chào!"));
  body.appendChild(
    createEmptyState({
      title: "Chưa đăng nhập",
      description:
        "Đăng nhập bằng tài khoản Zalo để tạo phiên riêng của bạn. " +
        "Chúng tôi chỉ nhận mã định danh Zalo, không xin quyền đọc thông tin cá nhân.",
      action: {
        label: "Đăng nhập",
        onClick: () => ctx.navigate("/login"),
      },
    }),
  );
  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Tìm trợ giúp luôn truy cập được mà không cần đăng nhập.",
    ),
  );
}

function renderLoadError(body, ctx, error) {
  clear(body);
  body.appendChild(
    createErrorState({
      title: "Không tải được trang chủ",
      description: error && error.kind === "timeout"
        ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
        : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

function renderConnectedProduction(body, ctx, role, rows) {
  clear(body);

  const primary = rows[0];
  const kindLabel = primary && primary.relationship_kind === "backup"
    ? "Người hỗ trợ dự phòng"
    : "Người đồng hành chính";

  body.appendChild(h("h2", { class: "fb-page__heading" }, "Xin chào!"));

  body.appendChild(
    createCard({
      title: "Đang đồng hành",
      description:
        `Bạn có một kết nối đang hoạt động (${kindLabel}` +
        (primary && primary.generation ? `, thế hệ ${primary.generation}` : "") +
        "). Chúng tôi hiển thị kết nối mà không lộ thông tin cá nhân của hai bên.",
      footer: createButton({
        label: "Quản lý kết nối",
        variant: "ghost",
        onClick: () => ctx.navigate("/connect"),
      }),
    }),
  );

  if (role === "student") {
    renderStudentCards(body, ctx, null);
  } else {
    renderCaregiverCards(body, ctx);
  }
}

function renderNotConnected(body, ctx) {
  clear(body);

  body.appendChild(h("h2", { class: "fb-page__heading" }, "Xin chào!"));

  body.appendChild(
    createEmptyState({
      title: "Chưa kết nối với người đồng hành",
      description:
        "Hai bên sẽ kết nối với nhau bằng một mã mời riêng và xác nhận hai chiều. " +
        "Bạn có thể tạo mã mời hoặc nhập mã nhận được ngay bây giờ.",
      action: {
        label: "Kết nối với người đồng hành",
        onClick: () => ctx.navigate("/connect"),
      },
    }),
  );

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Kết nối không cho phép đọc nhật ký hay dữ liệu riêng của nhau — mọi mục chia sẻ vẫn do bạn quyết định.",
    ),
  );
}
