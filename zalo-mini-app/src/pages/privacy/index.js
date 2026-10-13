// Trang Quyền riêng tư (F15) — chính thức, theo page contract của router:
//   export const page = { id, title, requiresRole, showBottomNav,
//     render(ctx) -> HTMLElement, destroy? }
//
// Nguồn logic DUY NHẤT là packages/family_bridge_mobile/f15_privacy/
// page-core.js (package F15) — trang này chỉ thích nghi lifecycle sync
// render(ctx) + dọn dẹp trong destroy(). Không React, không demo data.
//
// Ghi rõ mức tích hợp: route + trang đã nối; phiên đăng nhập lấy qua
// session-bridge (F01/PR #26 chưa merge -> trang hiển thị trung thực
// "chưa có phiên đăng nhập" và không gọi API riêng tư). API client dùng
// src/core/api/client.mjs của app (ApiError có `kind`).

import { h } from "../../app/dom.js";
import { createButton, createCard, createTopBar } from "../../components/index.js";
import { createApiClient, ApiError } from "../../core/api/client.mjs";
import { getApiBaseUrl } from "../../core/config.js";
import { createPrivacyPageCore } from "../../../../packages/family_bridge_mobile/f15_privacy/page-core.js";
import { getSessionToken } from "./session-bridge.js";

// mobile-core-style api { get, post } quanh client.mjs của app.
function createAppApi() {
  const request = createApiClient({
    baseUrl: getApiBaseUrl(),
    getToken: () => null, // token gắn từng request qua bridge bên dưới
  });
  let cachedToken = null;
  return {
    async get(path, opts = {}) {
      cachedToken = await getSessionToken();
      const authed = createApiClient({
        baseUrl: getApiBaseUrl(),
        getToken: () => cachedToken,
      });
      return authed(path, { method: "GET", ...(opts || {}) });
    },
    async post(path, opts = {}) {
      cachedToken = await getSessionToken();
      const authed = createApiClient({
        baseUrl: getApiBaseUrl(),
        getToken: () => cachedToken,
      });
      return authed(path, { method: "POST", ...(opts || {}) });
    },
  };
}

let activeCore = null; // core của lần render hiện tại (destroy khi rời trang)

export const page = {
  id: "f15-privacy",
  title: "Quyền riêng tư",
  requiresRole: true,
  showBottomNav: false,

  render(ctx) {
    const confirmFn = (message) => window.confirm(message);
    // ctx.privacyApi là seam kiểm thử (DOM tests); production dùng
    // createAppApi() quanh client.mjs của app.
    const core = createPrivacyPageCore({
      api: (ctx && ctx.privacyApi) || createAppApi(),
      getToken: (ctx && ctx.getToken) || (() => getSessionToken()),
      confirm: confirmFn,
    });
    activeCore = core;

    const root = h("div", { class: "fb-page", dataset: { page: "f15-privacy" } });
    root.appendChild(createTopBar({ title: "Quyền riêng tư" }));
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const statusBox = h("p", {
      class: "fb-status", role: "status", "aria-live": "polite",
      dataset: { role: "page-status" },
    });
    const reloadBtn = createButton({
      label: "Tải lại", variant: "ghost",
      onClick: () => core.load(),
    });
    reloadBtn.style.display = "none";

    // -- đang chia sẻ ---------------------------------------------------------
    const sharedCard = createCard({
      title: "Đang chia sẻ",
      children: h("div", { dataset: { role: "shared-list" } },
        h("p", { class: "fb-page__note" }, "Đang tải…")),
    });

    // -- đồng ý -----------------------------------------------------------------
    const consentNote = h("p", {
      class: "fb-page__note", "aria-live": "polite",
      dataset: { role: "consent-note" },
    });
    const consentBusy = new Set();
    const CONSENTS = [
      ["service", "Dịch vụ nền tảng"],
      ["ai_processing", "Xử lý AI"],
      ["research", "Nghiên cứu (tự nguyện)"],
    ];
    const consentRows = [];
    for (const [purpose, label] of CONSENTS) {
      const btn = createButton({
        label: `Rút đồng ý — ${label}`, variant: "ghost",
        onClick: () => {
          if (consentBusy.has(purpose)) return; // double-submit guard
          consentBusy.add(purpose);
          Promise.resolve(core.withdrawConsent(purpose, label))
            .finally(() => consentBusy.delete(purpose));
        },
      });
      consentRows.push(btn);
    }
    const consentCard = createCard({
      title: "Đồng ý",
      description: "Rút đồng ý chỉ áp dụng cho các lần xử lý mới; trợ giúp "
        + "(F13) luôn mở.",
      children: h("div", null, consentNote, ...consentRows),
    });

    // -- yêu cầu xóa --------------------------------------------------------------
    const categoryBoxes = {};
    const deletionCategories = ["mood", "journal", "drafts", "messages"];
    const checkboxRows = [];
    for (const cat of deletionCategories) {
      const box = h("input", { type: "checkbox", id: `f15-cat-${cat}` });
      categoryBoxes[cat] = box;
      checkboxRows.push(h("label", { for: `f15-cat-${cat}` }, box,
        ` ${core.categoryLabel(cat)}`));
    }
    const requestBtn = createButton({
      label: "Gửi yêu cầu xóa", variant: "danger",
      onClick: () => {
        const chosen = deletionCategories.filter((c) => categoryBoxes[c].checked);
        if (!chosen.length) {
          core.showLocalNote("Chọn ít nhất một phạm vi.");
          return;
        }
        Promise.resolve(core.requestDeletion(chosen));
      },
    });
    const receiptBox = h("p", {
      class: "fb-status fb-status--warning", "aria-live": "polite",
      dataset: { role: "receipt" },
    });
    const requestsList = h("ul", { dataset: { role: "deletion-requests" } });
    const deletionCard = createCard({
      title: "Yêu cầu xóa dữ liệu",
      description: "Yêu cầu được xác minh bởi người phụ trách trước khi xử "
        + "lý; trạng thái luôn phản ánh thật, chưa xong sẽ ghi rõ.",
      children: h("div", null, ...checkboxRows, requestBtn, receiptBox,
                  requestsList),
    });

    body.appendChild(statusBox);
    body.appendChild(reloadBtn);
    body.appendChild(sharedCard);
    body.appendChild(consentCard);
    body.appendChild(deletionCard);

    function renderView(view) {
      statusBox.textContent = view.statusText || "";
      statusBox.className = `fb-status fb-status--${view.status}`;
      reloadBtn.style.display =
        (view.status === "offline" || view.status === "error") ? "" : "none";

      // shared list
      const sharedHost = sharedCard.querySelector("[data-role=shared-list]");
      sharedHost.replaceChildren();
      if (view.status !== "ready") {
        sharedHost.appendChild(h("p", { class: "fb-page__note" },
          view.status === "loading" ? "Đang tải…"
            : view.status === "no_session"
              ? "Cần phiên đăng nhập để xem những gì bạn đang chia sẻ."
              : "Danh sách chỉ hiện khi tải được trạng thái thật."));
      } else if (!view.items.length) {
        sharedHost.appendChild(h("p", { class: "fb-page__note" },
          "Bạn chưa chia sẻ mục nào. Mỗi mục chia sẻ sẽ hiện ở đây để bạn "
            + "thu hồi riêng."));
      } else {
        for (const item of view.items) {
          const row = h("div", { class: "fb-shared__row" },
            h("span", null,
              item.revoked ? `${item.label} — đã thu hồi`
                : `${item.label} — đang chia sẻ (phiên bản ${item.approved_revision})`));
          if (!item.revoked) {
            row.appendChild(createButton({
              label: "Thu hồi", variant: "danger",
              onClick: () => Promise.resolve(core.revokeGrant(item)),
            }));
          }
          sharedHost.appendChild(row);
        }
        if (view.hasMore) {
          sharedHost.appendChild(h("p", { class: "fb-page__note" },
            "Vẫn còn mục khác — bản đầy đủ sẽ phân trang trong bản sau."));
        }
      }

      // consent + receipts
      consentNote.textContent = view.consentNote || "";
      receiptBox.textContent = view.receipt
        ? `${view.receiptNote || ""} ${view.receipt}`.trim()
        : (view.receiptNote || "");

      // deletion requests
      requestsList.replaceChildren();
      if (view.status !== "ready") {
        requestsList.appendChild(h("li", null,
          "Trạng thái yêu cầu chỉ hiện khi có phiên đăng nhập."));
      } else if (!view.deletionRequests.length) {
        requestsList.appendChild(h("li", null, "Chưa có yêu cầu xóa nào."));
      } else {
        for (const req of view.deletionRequests) {
          const row = h("li", null,
            `Yêu cầu ${req.status} — phạm vi: `
            + `${(req.scope_categories || []).map((c) => core.categoryLabel(c)).join(", ")}`);
          if (req.status === "requested") {
            row.appendChild(createButton({
              label: "Hủy yêu cầu", variant: "ghost",
              onClick: () => Promise.resolve(
                core.cancelDeletionRequest(req.request_id, req.revision)),
            }));
          }
          requestsList.appendChild(row);
        }
      }
    }

    const unsubscribe = core.subscribe(renderView);
    core.load();

    return root;
  },

  destroy() {
    // Router gọi khi rời trang: dọn subscribe + chặn response cũ ghi đè/
    // lưu state (K7: response muộn không render lại nội dung mất quyền).
    if (activeCore) {
      try { activeCore.destroy(); } catch { /* không chặn điều hướng */ }
      activeCore = null;
    }
  },
};
