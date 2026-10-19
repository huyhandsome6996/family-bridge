// F15 privacy page (package factory) — wrapper DOM mỏng quanh page-core
// (một nguồn logic). Trạng thái thật: loading/ready/error/offline/no_session;
// guard double-submit; unknown outcome sau mutation; destroy dọn dẹp.
// Wording trung thực: thu hồi chặn đọc mới (bản sao ngoài app không thu hồi
// được); biên nhận xóa KHÔNG phải tuyên bố "đã xóa hết".

import { createPrivacyPageCore } from "../page-core.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function createPage({ root, params, ctx }) {
  const api = ctx.privacyApi;
  if (!api) throw new TypeError("F15 page cần ctx.privacyApi");
  const confirmFn = ctx.confirm
    ? (message) => ctx.confirm(message)
    : (message) => window.confirm(message);
  const getToken = () => {
    if (ctx.getToken) return Promise.resolve(ctx.getToken());
    const store = ctx.sessionStore;
    if (store && typeof store.get === "function") {
      const snapshot = store.get();
      return Promise.resolve((snapshot && snapshot.token) || null);
    }
    return Promise.resolve(null);
  };

  const core = createPrivacyPageCore({
    api,
    getToken,
    confirm: confirmFn,
  });

  const container = el("div", "fb-page");
  container.dataset.page = "f15-privacy";
  const title = el("h1", "fb-page__title", "Quyền riêng tư");
  container.appendChild(title);

  const statusBox = el("p", "fb-status");
  statusBox.setAttribute("role", "status");
  statusBox.setAttribute("aria-live", "polite");
  container.appendChild(statusBox);

  const reloadBtn = el("button", "fb-button fb-button--ghost", "Tải lại");
  reloadBtn.type = "button";
  reloadBtn.addEventListener("click", () => { core.load(); });
  container.appendChild(reloadBtn);

  // -- đang chia sẻ -----------------------------------------------------------
  const sharedCard = el("section", "fb-card");
  sharedCard.appendChild(el("h2", "fb-card__title", "Đang chia sẻ"));
  const sharedList = el("ul", "fb-list");
  sharedList.id = "shared-list";
  sharedCard.appendChild(sharedList);
  container.appendChild(sharedCard);

  // -- đồng ý ------------------------------------------------------------------
  const consentCard = el("section", "fb-card");
  consentCard.appendChild(el("h2", "fb-card__title", "Đồng ý"));
  const consentNote = el("p", "fb-status");
  consentNote.setAttribute("aria-live", "polite");
  consentCard.appendChild(consentNote);
  const CONSENTS = [
    ["service", "Dịch vụ nền tảng"],
    ["ai_processing", "Xử lý AI"],
    ["research", "Nghiên cứu (tự nguyện)"],
  ];
  const consentBusy = new Set();
  for (const [purpose, label] of CONSENTS) {
    const row = el("div", "fb-consent__row");
    row.appendChild(el("span", null, label));
    const btn = el("button", "fb-button fb-button--danger", "Rút đồng ý");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      if (consentBusy.has(purpose)) return;
      consentBusy.add(purpose);
      btn.disabled = true;
      try {
        await core.withdrawConsent(purpose, label);
      } finally {
        consentBusy.delete(purpose);
        btn.disabled = false;
      }
    });
    row.appendChild(btn);
    consentCard.appendChild(row);
  }
  container.appendChild(consentCard);

  // -- yêu cầu xóa -------------------------------------------------------------
  const deletionCard = el("section", "fb-card");
  deletionCard.appendChild(el("h2", "fb-card__title", "Yêu cầu xóa dữ liệu"));
  deletionCard.appendChild(el("p", "fb-page__note",
    "Chọn phạm vi bạn muốn xóa. Yêu cầu được xác minh bởi người phụ trách "
    + "trước khi xử lý; trạng thái luôn phản ánh thật, chưa xong sẽ ghi rõ."));
  const categories = ["mood", "journal", "drafts", "messages"];
  const boxes = {};
  for (const cat of categories) {
    const label = el("label", "fb-check");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `f15-cat-${cat}`;
    boxes[cat] = box;
    label.appendChild(box);
    label.appendChild(document.createTextNode(core.categoryLabel(cat)));
    deletionCard.appendChild(label);
  }
  const requestBtn = el("button", "fb-button fb-button--danger",
                        "Gửi yêu cầu xóa");
  requestBtn.type = "button";
  requestBtn.id = "request-delete";
  const receiptBox = el("p", "fb-status fb-status--warning");
  receiptBox.id = "delete-receipt";
  receiptBox.setAttribute("aria-live", "polite");
  requestBtn.addEventListener("click", async () => {
    const chosen = categories.filter((c) => boxes[c] && boxes[c].checked);
    if (!chosen.length) {
      receiptBox.className = "fb-status fb-status--warning";
      receiptBox.textContent = "Chọn ít nhất một phạm vi.";
      return;
    }
    requestBtn.disabled = true;
    try {
      await core.requestDeletion(chosen);
    } finally {
      requestBtn.disabled = core.getView().busy;
    }
  });
  deletionCard.appendChild(requestBtn);
  deletionCard.appendChild(receiptBox);
  const requestsList = el("ul", "fb-list");
  requestsList.id = "deletion-requests";
  deletionCard.appendChild(requestsList);
  container.appendChild(deletionCard);

  // -- render từ core ----------------------------------------------------------
  function renderView(view) {
    statusBox.className = `fb-status fb-status--${view.status}`;
    statusBox.textContent = view.statusText
      || (view.status === "ready" ? "" : "");
    statusBox.hidden = !view.statusText;
    reloadBtn.hidden = !(view.status === "offline" || view.status === "error");

    sharedList.replaceChildren();
    if (view.status === "ready") {
      if (!view.items.length) {
        sharedList.appendChild(el("li", null,
          "Bạn chưa chia sẻ mục nào. Mỗi mục bạn chia sẻ sẽ hiện ở đây để bạn thu hồi riêng."));
      }
      for (const item of view.items) {
        const li = el("li", "fb-list__item");
        li.appendChild(el("span", null,
          item.revoked ? `${item.label} — đã thu hồi`
            : `${item.label} — đang chia sẻ (phiên bản ${item.approved_revision})`));
        if (!item.revoked) {
          const btn = el("button", "fb-button fb-button--danger", "Thu hồi");
          btn.type = "button";
          btn.disabled = view.busy;
          btn.addEventListener("click", () => {
            core.revokeGrant(item);
          });
          li.appendChild(btn);
        }
        sharedList.appendChild(li);
      }
      requestBtn.disabled = view.busy;
    } else {
      sharedList.appendChild(el("li", null,
        view.status === "loading" ? "Đang tải…"
          : "Danh sách chia sẻ chỉ hiện khi tải được trạng thái thật."));
      requestBtn.disabled = true;
    }
    receiptBox.textContent = view.receipt
      ? `${view.receiptNote || ""} ${view.receipt}`.trim()
      : (view.receiptNote || "");
    consentNote.textContent = view.consentNote || "";

    requestsList.replaceChildren();
    if (view.deletionRequests.length) {
      for (const req of view.deletionRequests) {
        const li = el("li", "fb-list__item");
        li.appendChild(el("span", null,
          `Yêu cầu ${req.status} — phạm vi: `
          + `${(req.scope_categories || []).map((c) => core.categoryLabel(c)).join(", ")}`));
        if (req.status === "requested") {
          const cancelBtn = el("button", "fb-button fb-button--ghost", "Hủy yêu cầu");
          cancelBtn.type = "button";
          cancelBtn.disabled = view.busy;
          cancelBtn.addEventListener("click", () => {
            core.cancelDeletionRequest(req.request_id, req.revision);
          });
          li.appendChild(cancelBtn);
        }
        requestsList.appendChild(li);
      }
    } else {
      requestsList.appendChild(el("li", null,
        "Chưa có yêu cầu xóa nào."));
    }
  }

  const unsubscribe = core.subscribe(renderView);
  core.load();

  return {
    el: container,
    destroy() {
      unsubscribe();
      core.destroy();
    },
  };
}
