// Home (U08/U09/U10) — dispatch theo vai trò xem trước: student | caregiver.
// Luồng kết nối:
//   - demo (adapter mock): getConnectionStatus trả fixture "đã kết nối" ->
//     hiển thị home đã kết nối kèm nhãn "Dữ liệu minh họa" rõ ràng.
//   - production (adapter zalo): getConnectionStatus ném lỗi 501 (boundary
//     chưa triển khai) -> KHÔNG coi là lỗi hệ thống, hiển thị trạng thái
//     "chưa kết nối" + giải thích mã mời. Không fake-success.
// Nút "Con cần được lắng nghe" chỉ mở Sheet xem trước — KHÔNG gửi tín hiệu.
import { h, clear } from "../../app/dom.js";
import {
  createButton,
  createCard,
  createSheet,
  createEmptyState,
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

    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải trang chủ…"));

    const currentRun = ++runId;

    Promise.resolve()
      .then(() => ctx.adapter.getConnectionStatus())
      .then((status) => {
        if (cancelled || currentRun !== runId) return null;
        return Promise.resolve()
          .then(() => ctx.adapter.getProfile(role))
          .catch(() => null) // không có tên fixture -> chào chung, không chặn trang
          .then((profile) => ({ status, profile }));
      })
      .then((result) => {
        if (!result || cancelled || currentRun !== runId) return;
        renderConnected(body, ctx, role, result.status, result.profile);
      })
      .catch(() => {
        if (cancelled || currentRun !== runId) return;
        renderNotConnected(body, ctx);
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

function renderNotConnected(body, ctx) {
  clear(body);

  // Lỗi 501 "chưa triển khai" không phải lỗi hệ thống — hiển thị trạng thái
  // chờ kết nối an toàn, không DemoBanner (đây không phải chế độ demo).
  body.appendChild(h("h2", { class: "fb-page__heading" }, "Xin chào!"));

  body.appendChild(
    createEmptyState({
      title: "Chưa kết nối với người đồng hành",
      description:
        "Hai bên sẽ kết nối với nhau bằng một mã mời riêng và xác nhận hai chiều. Tính năng kết nối sắp ra mắt — khi có, hướng dẫn sẽ xuất hiện ngay tại đây.",
      action: {
        label: "Tìm hiểu cách kết nối",
        onClick: () => openConnectInfoSheet(body.closest(".fb-page") || body),
      },
    }),
  );

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Trong lúc chờ kết nối, bạn vẫn có thể xem trước giao diện bằng chế độ dữ liệu minh họa.",
    ),
  );
}

function openConnectInfoSheet(root) {
  openSheetIn(root, {
    title: "Tìm hiểu cách kết nối",
    content: h("div", {},
      h("p", {}, "Khi tính năng ra mắt, mỗi gia đình sẽ nhận một mã mời riêng."),
      h("p", {}, "Học sinh và người đồng hành cùng nhập mã mời để xác nhận kết nối hai chiều — cả hai bên đều phải đồng ý thì kết nối mới được tạo."),
      h("p", {}, "Sau khi kết nối, hai bên sẽ thấy nhau trong hộp thư và lộ trình Đồng hành."),
      h("p", { class: "fb-page__note" },
        "Tính năng này sắp ra mắt. Ứng dụng sẽ không tạo mã mời hay gửi yêu cầu kết nối thay bạn.",
      ),
    ),
  });
}
