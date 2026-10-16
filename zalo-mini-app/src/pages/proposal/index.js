// Proposal — Xác nhận ghép đôi từ lớp học (w05 Stitch, Web Render Task 2).
// Hợp đồng backend (worklog Task 19 — FINAL CONTRACT, f16_classroom):
//   GET  /api/v1/classroom/proposals
//        → { results:[{proposal_id,status,my_role,my_confirmed,
//          counterpart_confirmed,counterpart:{display_name,identity_basis},
//          created_at,updated_at}], next_cursor }
//   POST /api/v1/classroom/proposals/{id}/confirm  {} | {expected_revision}
//        → { proposal_id,status,my_confirmed,connection|null }
//   POST .../decline {reason:"refused"|"wrong_pair"}; POST .../cancel {}
// Lỗi envelope {"error":{code,details}}: consent_required,
// proposal_blocked_by_open_invite, already_connected, revision_conflict,
// account_inactive, proposal_not_confirmable.
//
// Sự thật dữ liệu: tên đối tác là TÊN TỰ KHAI BÁO (badge rõ ràng); KHÔNG
// hiển thị "Giám hộ"/"Ban Cố Vấn"/tên lớp từ mẫu Stitch (identity bug);
// không đếm ngược; không tự xác nhận — nút xác nhận bị khóa đến khi người
// dùng tích ô tự nguyện.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton,
  createDialog,
  createDemoBanner,
  createEmptyState,
  createErrorState,
  createIcon,
  createSkeleton,
} from "../../components/index.js";

const COLD_START_TIMEOUT_MS = 60000;

const STATUS_CHIPS = {
  proposed: "Chờ hai bên xác nhận",
  pending: "Chờ hai bên xác nhận",
  awaiting_confirmation: "Đang chờ phía kia xác nhận",
  connected: "Đã kết nối",
  declined: "Đã từ chối",
  canceled: "Đã hủy",
};

const ACTIONABLE = new Set(["proposed", "pending"]);

function statusChip(status) {
  return STATUS_CHIPS[status] || "Trạng thái khác";
}

function myRoleLabel(myRole) {
  if (myRole === "student") return "Học sinh";
  if (myRole === "caregiver") return "Người chăm sóc";
  return "Bạn";
}

export const page = {
  id: "proposal",
  title: "Xác nhận ghép nối",
  requiresRole: true,
  requiresAuth: true, // phiên lớp học là điều kiện bắt buộc (router M1)
  showBottomNav: true,
  chrome: "app",

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "proposal" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    const demo = Boolean(readState(ctx.store).demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để xem đề xuất ghép đôi",
          description:
            "Đề xuất ghép đôi là dữ liệu của tài khoản bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải đề xuất ghép đôi…"));

    const load = () => {
      const thisRun = ++runId;
      Promise.resolve()
        .then(() => ctx.adapter.listClassProposals({ limit: 20, timeoutMs: COLD_START_TIMEOUT_MS }))
        .then((data) => {
          if (cancelled || thisRun !== runId) return;
          renderProposals(body, ctx, {
            demo,
            proposals: (data && Array.isArray(data.results) ? data.results : []),
            load,
          });
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          clear(body);
          body.appendChild(
            createErrorState({
              title: "Không tải được đề xuất ghép đôi",
              description: error && error.kind === "timeout"
                ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
                : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: () => load(),
            }),
          );
        });
    };
    load();

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/* ------------------------------ Danh sách đề xuất ------------------------------ */

function renderProposals(body, ctx, { demo, proposals, load }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());

  // Breadcrumb theo w05 (tên vai trò trung tính — không nêu lớp/ban cố vấn).
  const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
  breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, "Xác nhận ghép nối"));
  body.appendChild(breadcrumb);

  if (!proposals.length) {
    body.appendChild(
      createEmptyState({
        title: "Chưa có đề xuất kết nối nào từ lớp.",
        description:
          "Khi giáo viên phụ trách ghép cặp bạn với người đồng hành, đề xuất sẽ hiện tại đây. "
          + "Trong lúc chờ, bạn vẫn có thể dùng mã mời thông thường.",
        action: { label: "Mở mục Người đồng hành", onClick: () => ctx.navigate("/connect") },
      }),
    );
    return;
  }

  const actionable = proposals.filter((row) => row && ACTIONABLE.has(row.status));
  const others = proposals.filter((row) => !row || !ACTIONABLE.has(row.status));

  if (actionable.length === 1) {
    body.appendChild(renderProposalCard(ctx, actionable[0], { load, emphasized: true }));
  } else {
    actionable.forEach((row) => {
      body.appendChild(renderProposalCard(ctx, row, { load, emphasized: true }));
    });
  }
  others.forEach((row) => {
    body.appendChild(renderStatusCard(row, { ctx, load }));
  });
}

/* ------------------------------ Thẻ xác nhận (w05) ------------------------------ */

function renderProposalCard(ctx, proposal, { load, emphasized }) {
  const card = h("section", {
    class: `fb-scard fb-pairing${emphasized ? " fb-pairing--emphasized" : ""}`,
    dataset: { proposalId: String(proposal.proposal_id || "") },
  });

  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("div", {},
        h("span", { class: "fb-journey__kicker" }, "Đề xuất ghép cặp đồng hành"),
        h("h2", { class: "fb-scard__title" }, "Xác nhận người đồng hành của bạn"),
      ),
      h("span", { class: "fb-chip" }, statusChip(proposal.status)),
    ),
  );
  card.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Để đảm bảo an toàn và riêng tư, mỗi kết nối cần được sự đồng ý chủ động từ cả hai phía.",
    ),
  );

  // Viz ghép đôi: Bạn (vai trò thật) ↔ đối tác (tên tự khai báo).
  const viz = h("div", { class: "fb-pairing__viz" });
  viz.appendChild(
    h("div", { class: "fb-pairing__side" },
      h("span", { class: "fb-pairing__avatar", "aria-hidden": "true" },
        createIcon({ name: "person", size: 22 })),
      h("span", { class: "fb-pairing__role" }, `Bạn (${myRoleLabel(proposal.my_role)})`),
      h("span", { class: "fb-sec__sub" }, "Tài khoản lớp học của bạn"),
    ),
  );
  viz.appendChild(
    h("span", { class: "fb-pairing__link", "aria-hidden": "true" },
      createIcon({ name: "favorite", size: 20, fill: true })),
  );
  const counterpartName = proposal.counterpart && proposal.counterpart.display_name
    ? String(proposal.counterpart.display_name)
    : "Chưa có tên";
  viz.appendChild(
    h("div", { class: "fb-pairing__side" },
      h("span", { class: "fb-pairing__avatar", "aria-hidden": "true" },
        createIcon({ name: "family_restroom", size: 22 })),
      h("span", { class: "fb-pairing__role" }, counterpartName),
      h("span", { class: "fb-chip fb-chip--low" }, "tên tự khai báo"),
    ),
  );
  card.appendChild(viz);
  card.appendChild(
    h("p", { class: "fb-page__note" },
      "Tên hiển thị do người kia tự khai báo trong app — nếu thấy lạ, hãy dùng nút “Không đúng người / Từ chối”.",
    ),
  );

  // Hộp tin cậy — 3 dòng VERBATIM từ Stitch w05.
  const trust = h("div", { class: "fb-pairing__trust" });
  trust.appendChild(
    h("div", { class: "fb-pairing__trust-row" },
      createIcon({ name: "shield", size: 18, className: "fb-stitch-primary-icon" }),
      h("p", {},
        h("strong", {}, "Đây KHÔNG phải là trao quyền giám sát dữ liệu của nhau:"),
        " Ứng dụng không cho phép theo dõi màn hình, định vị hay đọc các thư mục cá nhân.",
      ),
    ),
  );
  trust.appendChild(
    h("div", { class: "fb-pairing__trust-row" },
      createIcon({ name: "lock", size: 18, className: "fb-stitch-primary-icon" }),
      h("p", {},
        "Quyền kiểm soát chủ động: bạn và người đồng hành chỉ thấy những gì bên kia chủ động bấm chia sẻ. "
        + "Mặc định mọi suy nghĩ luôn là ",
        h("strong", {}, "“Chỉ mình tôi”"),
        ".",
      ),
    ),
  );
  trust.appendChild(
    h("div", { class: "fb-pairing__trust-row" },
      createIcon({ name: "check_circle", size: 18, className: "fb-stitch-primary-icon" }),
      h("p", {},
        "Đồng thuận song phương: Kết nối chỉ chính thức kích hoạt sau khi ",
        h("strong", {}, "CẢ HAI BÊN"),
        " cùng nhấn xác nhận. Nếu một bên chưa đồng ý, không gian trao đổi sẽ không mở ra.",
      ),
    ),
  );
  card.appendChild(trust);

  // Checkbox tự nguyện — khóa nút xác nhận đến khi tích.
  const note = h("p", { class: "fb-page__note", role: "status" });
  // Nút xác nhận KHÔNG tự gắn onClick ở đây — được nối ở cuối hàm (xem
  // addEventListener) để có tham chiếu `card`; luôn bị khóa đến khi checkbox
  // tự nguyện được tích.
  const confirmBtn = createButton({
    label: "Đúng người, tôi đồng ý kết nối",
    variant: "primary",
    disabled: true,
  });
  const checkboxId = `fb-proposal-consent-${String(proposal.proposal_id || "x").slice(0, 8)}`;
  const checkbox = h("input", {
    type: "checkbox",
    id: checkboxId,
    class: "fb-pairing__checkbox",
  });
  checkbox.addEventListener("change", () => {
    confirmBtn.disabled = !checkbox.checked;
  });
  card.appendChild(
    h("label", { class: "fb-pairing__consent", for: checkboxId },
      checkbox,
      h("span", {},
        "Tôi hiểu rằng việc xác nhận này là hoàn toàn tự nguyện và tôi có quyền tạm ngừng kết nối "
        + "bất cứ lúc nào trong mục Cài đặt & Riêng tư.",
      ),
    ),
  );

  const actions = h("div", { class: "fb-compose__pause-buttons" });
  actions.appendChild(confirmBtn);
  actions.appendChild(
    createButton({
      label: "Không đúng người / Từ chối",
      variant: "ghost",
      onClick: () => openDeclineDialog(ctx, proposal, { load, note }),
    }),
  );
  actions.appendChild(
    createButton({
      label: "Để sau",
      variant: "ghost",
      onClick: () => ctx.navigate("/home"),
    }),
  );
  actions.appendChild(
    createButton({
      label: "Hủy đề xuất này",
      variant: "ghost",
      onClick: () => openCancelDialog(ctx, proposal, { load, note }),
    }),
  );
  card.appendChild(actions);
  card.appendChild(note);

  confirmBtn.addEventListener("click", () => onConfirm(ctx, proposal, card, { load, note, confirmBtn }));
  return card;
}

/* --------------------------------- Hành động --------------------------------- */

function onConfirm(ctx, proposal, card, { load, note, confirmBtn }) {
  confirmBtn.disabled = true;
  note.textContent = "Đang gửi xác nhận của bạn…";
  Promise.resolve()
    .then(() => ctx.adapter.confirmClassProposal(
      proposal.proposal_id,
      proposal.revision != null ? { expectedRevision: proposal.revision } : {},
    ))
    .then((result) => {
      const status = result && result.status;
      if (status === "connected") {
        // Thành công hai phía: thay thẻ bằng card kết quả (không fake —
        // status "connected" do máy chủ trả).
        card.replaceChildren(...renderConnectedSuccess(proposal).childNodes);
        card.dataset.state = "connected";
        return;
      }
      note.textContent = status === "awaiting_confirmation"
        ? "Bạn đã xác nhận. Đang chờ phía kia xác nhận…"
        : "Đã ghi nhận xác nhận của bạn.";
      load(); // luôn tải lại danh sách sau thao tác (source of truth = máy chủ)
    })
    .catch((error) => {
      confirmBtn.disabled = false;
      applyProposalError(ctx, error, { load, note });
    });
}

function openDeclineDialog(ctx, proposal, { load, note }) {
  const dialog = createDialog({
    title: "Xác nhận từ chối ghép đôi?",
    message:
      "Bạn cho rằng đây không phải người đồng hành của mình. Lớp sẽ nhận được phản hồi "
      + "“Không đúng người” để ghép lại cho phù hợp. Thao tác này không thể hoàn tác.",
    actions: [
      {
        label: "Từ chối ghép đôi",
        variant: "danger",
        onClick: () => {
          note.textContent = "Đang gửi phản hồi từ chối…";
          Promise.resolve()
            .then(() => ctx.adapter.declineClassProposal(proposal.proposal_id, { reason: "wrong_pair" }))
            .then(() => {
              note.textContent = "Bạn đã từ chối đề xuất này.";
              load();
            })
            .catch((error) => applyProposalError(ctx, error, { load, note }));
        },
      },
      { label: "Quay lại", variant: "ghost" },
    ],
  });
  return dialog;
}

/** Hủy đề xuất (POST .../cancel) — một trong hai bên có thể hủy; đề xuất
 * chuyển trạng thái canceled (terminal) và không xác nhận được nữa. */
function openCancelDialog(ctx, proposal, { load, note }) {
  const dialog = createDialog({
    title: "Hủy đề xuất ghép đôi này?",
    message:
      "Đề xuất ghép đôi với người này sẽ bị hủy và không thể xác nhận nữa. "
      + "Nếu vẫn cần kết nối, bạn có thể dùng mã mời thông thường hoặc liên hệ giáo viên "
      + "phụ trách lớp để được ghép lại. Thao tác này không thể hoàn tác.",
    actions: [
      {
        label: "Hủy đề xuất",
        variant: "danger",
        onClick: () => {
          note.textContent = "Đang hủy đề xuất…";
          Promise.resolve()
            .then(() => ctx.adapter.cancelClassProposal(proposal.proposal_id))
            .then(() => {
              note.textContent = "Bạn đã hủy đề xuất ghép đôi này.";
              load();
            })
            .catch((error) => applyProposalError(ctx, error, { load, note }));
        },
      },
      { label: "Quay lại", variant: "ghost" },
    ],
  });
  return dialog;
}

/** Mã nghiệp vụ cụ thể của một lỗi: envelope backend thật đặt reason chi
 * tiết ở details.reason (InputInvalid/NotAuthorized/NotFound có code chung
 * input_invalid/not_authorized/not_found), một số lỗi có code riêng
 * (consent_required, revision_conflict). Reason cụ thể ưu tiên khi có. */
function proposalErrorCode(error) {
  if (!error) return "";
  const direct = typeof error.code === "string" ? error.code : "";
  const reason = error.details && typeof error.details.reason === "string"
    ? error.details.reason
    : "";
  return reason || direct;
}

/** Ánh xạ lỗi hợp đồng f16 → copy trung thực + lối xử lý (không fake success). */
function applyProposalError(ctx, error, { load, note }) {
  const code = proposalErrorCode(error);
  clear(note);
  if (code === "consent_required") {
    note.appendChild(h("span", {}, "Bạn cần hoàn thành đồng ý sử dụng trước khi xác nhận ghép đôi. "));
    note.appendChild(h("a", { href: "#/consent" }, "Mở trang Đồng ý & quyền riêng tư"));
    note.hidden = false;
    return;
  }
  if (code === "proposal_blocked_by_open_invite") {
    note.appendChild(h("span", {}, "Bạn còn lời mời kết nối khác đang chờ. Hãy xử lý tại Người đồng hành trước. "));
    note.appendChild(h("a", { href: "#/connect" }, "Mở mục Người đồng hành"));
    note.hidden = false;
    return;
  }
  if (code === "already_connected") {
    note.appendChild(h("span", {}, "Hai bên đã kết nối. "));
    note.appendChild(h("a", { href: "#/home" }, "Về trang chủ"));
    note.hidden = false;
    load();
    return;
  }
  if (code === "revision_conflict") {
    note.textContent = "Trạng thái đề xuất vừa thay đổi — đã tải lại dữ liệu mới nhất từ máy chủ.";
    load();
    return;
  }
  if (code === "proposal_not_confirmable") {
    note.textContent = "Đề xuất này không thể xác nhận ở trạng thái hiện tại — đã tải lại trạng thái mới nhất.";
    load();
    return;
  }
  if (code === "proposal_not_found") {
    note.textContent =
      "Đề xuất này không còn thuộc về tài khoản của bạn (đã bị hủy hoặc không tồn tại). "
      + "Đã tải lại danh sách mới nhất.";
    load();
    return;
  }
  if (code === "proposal_not_open") {
    note.textContent = "Đề xuất này đã đóng (bị từ chối/hủy/hoàn tất) — đã tải lại trạng thái mới nhất.";
    load();
    return;
  }
  if (code === "account_inactive") {
    note.textContent =
      "Tài khoản của bạn hiện không còn hoạt động. Vui lòng liên hệ giáo viên phụ trách lớp để được hỗ trợ.";
    return;
  }
  if (error && error.kind === "timeout") {
    note.textContent = "Kết nối quá thời gian chờ. Vui lòng thử lại.";
    return;
  }
  note.textContent = "Không thực hiện được thao tác. Vui lòng thử lại.";
}

/* ------------------------- Thẻ trạng thái / kết quả ------------------------- */

function renderStatusCard(proposal, handlers = {}) {
  const { ctx = null, load = () => {} } = handlers;
  const card = h("section", { class: "fb-scard" });
  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("h2", { class: "fb-scard__title" }, "Đề xuất ghép đôi"),
      h("span", { class: "fb-chip" }, statusChip(proposal.status)),
    ),
  );
  const name = proposal.counterpart && proposal.counterpart.display_name
    ? String(proposal.counterpart.display_name)
    : "Chưa có tên";
  card.appendChild(
    h("p", { class: "fb-sec__sub" }, `Với: ${name} (tên tự khai báo)`),
  );

  if (proposal.status === "awaiting_confirmation") {
    card.appendChild(
      h("div", { class: "fb-pairing__waiting", role: "status" },
        createIcon({ name: "hourglass_top", size: 18, className: "fb-stitch-primary-icon" }),
        h("span", {}, "Đang chờ phía kia xác nhận… Không có giới hạn thời gian — bạn có thể quay lại sau."),
      ),
    );
    if (ctx) {
      const statusNote = h("p", { class: "fb-page__note", role: "status" });
      card.appendChild(
        createButton({
          label: "Hủy đề xuất này",
          variant: "ghost",
          onClick: () => openCancelDialog(ctx, proposal, { load, note: statusNote }),
        }),
      );
      card.appendChild(statusNote);
    }
  } else if (proposal.status === "connected") {
    card.appendChild(renderConnectedInner());
  } else if (proposal.status === "declined") {
    card.appendChild(
      h("p", { class: "fb-sec__sub" },
        "Đề xuất này đã bị từ chối, nên không thể xác nhận nữa. "
        + "Bạn có thể dùng mã mời thông thường tại Người đồng hành.",
      ),
    );
    card.appendChild(h("a", { class: "fb-btn fb-btn--ghost", href: "#/connect" }, "Mở mục Người đồng hành"));
  } else if (proposal.status === "canceled") {
    card.appendChild(
      h("p", { class: "fb-sec__sub" },
        "Đề xuất này đã được hủy. Nếu vẫn cần kết nối, hãy dùng mã mời thông thường tại Người đồng hành.",
      ),
    );
    card.appendChild(h("a", { class: "fb-btn fb-btn--ghost", href: "#/connect" }, "Mở mục Người đồng hành"));
  } else {
    card.appendChild(
      h("p", { class: "fb-page__note" },
        `Trạng thái hiện tại: ${statusChip(proposal.status)}.`,
      ),
    );
  }
  return card;
}

function renderConnectedInner() {
  const wrap = h("div", {});
  wrap.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Kết nối đã được xác nhận hai phía. Không gian trao đổi giữa hai người đã mở.",
    ),
  );
  wrap.appendChild(
    h("div", { class: "fb-compose__pause-buttons" },
      h("a", { class: "fb-btn fb-btn--primary", href: "#/home" }, "Về trang chủ"),
    ),
  );
  return wrap;
}

/** Giao diện thành công sau khi confirm trả status "connected" (máy chủ). */
function renderConnectedSuccess(proposal) {
  const card = h("section", { class: "fb-scard fb-pairing fb-pairing--emphasized" });
  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("h2", { class: "fb-scard__title" }, "Kết nối đã được xác nhận hai phía"),
      h("span", { class: "fb-chip" }, "Đã kết nối"),
    ),
  );
  const name = proposal.counterpart && proposal.counterpart.display_name
    ? String(proposal.counterpart.display_name)
    : "người đồng hành";
  card.appendChild(
    h("p", { class: "fb-sec__sub" },
      `Bạn và ${name} đều đã xác nhận. Từ giờ bạn có thể gửi lời nhắn, thẻ cảm xúc và tín hiệu qua kết nối này.`,
    ),
  );
  card.appendChild(renderConnectedInner());
  return card;
}
