// F01 — Đồng ý theo từng mục đích, từng phiên bản chính sách (WF-17).
// Thiết kế Stitch "Quyền lựa chọn thuộc về bạn": desktop hai cột 5/7
// (aside ngữ cảnh + form quyết định), mobile/Mini App một cột đọc dọc.
//
// Bất biến giữ nguyên (không đổi khi đổi hình):
// - KHÔNG tự precheck lựa chọn nào; chỉ khôi phục những mục người dùng ĐÃ
//   chấp nhận trước đó cho đúng phiên bản hiện hành (trạng thái thật).
// - Đăng nhập không bao giờ tự hiểu là đã đồng ý; cặp do admin cấp cũng
//   KHÔNG tạo consent thay người dùng (DEC-24 — consent là chuyện riêng).
// - Snapshot lựa chọn NGAY LÚC BẤM; kiểm tra stale sau MỖI await (trang
//   chết / render mới / đổi phiên → dừng, không ghi tiếp sang actor khác).
// - Kết quả ghi chưa xác định (timeout/network/stale) KHÔNG báo chắc chắn
//   thất bại và không tự replay; submit lại đối chiếu sổ cái trước khi ghi.
// - Không QA panel, không alert/setTimeout giả, không Tailwind CDN, không
//   quảng cáo "mã hóa"/"ẩn danh hoàn toàn" — copy trung thực.
import { h } from "../../app/dom.js";
import { getSessionGeneration, hasLiveSession } from "../../core/session.js";
import { CONSENT_ORDER, POLICY_PURPOSES } from "../../core/policy.js";
import {
  createButton, createCard, createDialog, createErrorState, createLogo,
  createSkeleton,
} from "../../components/index.js";
import { createIcon } from "../../components/icon.js";

let markRenderCancelled = () => {};

const INFO_ITEMS = [
  {
    icon: "verified_user",
    title: "Chỉ mục bắt buộc mới cần để tiếp tục",
    description: "Chỉ riêng Điều khoản sử dụng nhằm xác lập nguyên tắc "
      + "giao tiếp an toàn.",
  },
  {
    icon: "check_circle",
    title: "Tùy chọn hoàn toàn tự nguyện",
    description: "Bạn có thể tắt AI hoặc từ chối nghiên cứu; các tính năng "
      + "không cần AI vẫn hoạt động bình thường, còn tính năng AI chỉ chạy "
      + "khi bạn đồng ý cho AI xử lý.",
  },
  {
    icon: "history_edu",
    title: "Xem lại & thu hồi bất cứ lúc nào",
    description: "Quản lý hoặc rút từng sự đồng ý trong phần Cài đặt & "
      + "Quyền riêng tư khi tính năng khả dụng trên bản này.",
  },
];

export const page = {
  id: "f01-consent",
  title: "Đồng ý & quyền riêng tư",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    let runId = 0;
    markRenderCancelled = () => { cancelled = true; runId += 1; };

    const root = h("div", { class: "fb-consent", dataset: { page: "f01-consent" } });

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);

    // Chưa đăng nhập (không tính demo): dẫn về đăng nhập, không hiện form.
    if (!demo && !hasLiveSession()) {
      ctx.navigate("/login?reason=expired");
      root.appendChild(h("div", { class: "fb-consent__shell" }));
      return root;
    }

    const shell = h("div", { class: "fb-consent__shell" });
    root.appendChild(shell);

    // ------------------------------------------------------------------
    // Cột trái — ngữ cảnh (aside): brand, các điểm cần biết, trợ giúp.
    const aside = h("aside", { class: "fb-consent__aside" });
    shell.appendChild(aside);

    const brand = h("div", { class: "fb-consent__brand" },
      createLogo({ size: "md" }),
      h("div", { class: "fb-consent__brand-text" },
        h("strong", {}, "Family Bridge"),
        h("span", {}, "Cầu nối gia đình")),
    );
    aside.appendChild(brand);

    aside.appendChild(h("nav", {
      class: "fb-consent__crumbs", "aria-label": "Vị trí hiện tại",
    },
    h("span", {}, "Thiết lập ban đầu"),
    h("span", { class: "fb-consent__crumb-sep", "aria-hidden": "true" }, "›"),
    h("strong", {}, "Quyền riêng tư & Cam kết"),
    ));

    aside.appendChild(h("h1", { class: "fb-consent__title" },
      "Quyền lựa chọn thuộc về bạn"));
    aside.appendChild(h("p", { class: "fb-consent__lead" },
      "Family Bridge tôn trọng sự an tâm của gia đình bạn. Hãy dành chút "
      + "thời gian xem xét các lựa chọn bên dưới trước khi bắt đầu hành "
      + "trình đồng hành."));

    const points = h("ul", { class: "fb-consent__points" });
    for (const item of INFO_ITEMS) {
      points.appendChild(h("li", { class: "fb-consent__point" },
        h("span", { class: "fb-consent__point-icon", "aria-hidden": "true" },
          createIcon({ name: item.icon, size: 20 })),
        h("span", { class: "fb-consent__point-body" },
          h("strong", {}, item.title),
          h("span", {}, item.description)),
      ));
    }
    aside.appendChild(points);

    aside.appendChild(h("div", { class: "fb-consent__help" },
      h("span", {}, "Cần trợ giúp? Trợ giúp luôn mở kể cả khi chưa chấp "
        + "nhận điều khoản."),
      h("a", { class: "fb-consent__help-link", href: "#/help" },
        "Mở trung tâm hỗ trợ"),
    ));

    // ------------------------------------------------------------------
    // Cột phải — form quyết định.
    const panel = h("section", { class: "fb-consent__panel",
      "aria-labelledby": "fb-consent-form-title" });
    shell.appendChild(panel);

    panel.appendChild(h("h2", { class: "fb-consent__form-title",
      id: "fb-consent-form-title" }, "Xác nhận sự đồng ý của bạn"));
    panel.appendChild(h("p", { class: "fb-consent__form-sub" },
      "Các thiết lập này bảo vệ tính minh bạch và sự tin cậy giữa cha mẹ "
      + "và con cái trong suốt quá trình đồng hành."));

    const formArea = h("div", { class: "fb-consent__form-area" });
    panel.appendChild(formArea);

    const checkboxes = new Map(); // purpose -> input element
    const recordedNotes = new Map(); // purpose -> string|null
    const restoredAccepted = new Map(); // purpose -> bool (đã chấp nhận đúng phiên bản)
    let submitting = false;

    const continueButton = createButton({
      label: "Xác nhận và tiếp tục",
      variant: "cta",
      size: "lg",
      disabled: true,
      onClick: () => submit(),
    });

    const submitStatus = h("p", { class: "fb-consent__status", role: "status" });

    function syncContinueState() {
      const serviceChecked = checkboxes.get("service")
        ? checkboxes.get("service").checked : false;
      continueButton.disabled = submitting || !serviceChecked;
      continueButton.title = serviceChecked
        ? ""
        : "Cần chấp nhận Điều khoản sử dụng để tiếp tục.";
    }

    function openDetails(config) {
      const noteText = recordedNotes.get(config.purpose);
      const restored = restoredAccepted.get(config.purpose) === true;
      createDialog({
        title: config.title,
        message: `${config.description}\n\nPhiên bản hiện hành: `
          + `${config.version}. Quyết định của bạn được ghi vào sổ cái kèm `
          + `phiên bản; chấp nhận một phiên bản cũ không tự áp dụng cho `
          + `phiên bản mới.${restored
            ? ` Hiện tại: bạn đã chấp nhận phiên bản này.`
            : noteText ? ` Hiện tại: ${noteText}` : ""}`,
        actions: [{ label: "Đã hiểu", variant: "primary" }],
      });
    }

    function optionElement(key) {
      const config = POLICY_PURPOSES[key];
      const inputId = `fb-consent-${config.purpose}`;
      const checkbox = h("input", {
        type: "checkbox",
        id: inputId,
        class: "fb-consent__check-input",
        onChange: () => syncContinueState(),
      });
      checkbox.checked = restoredAccepted.get(config.purpose) === true; // không precheck
      checkboxes.set(config.purpose, checkbox);

      const noteText = recordedNotes.get(config.purpose);
      const box = h("span", { class: "fb-consent__box",
        "aria-hidden": "true" });
      const text = h("span", { class: "fb-consent__option-text" },
        h("span", { class: "fb-consent__option-head" },
          h("strong", {}, config.title),
          h("span", {
            class: "fb-consent__chip" + (config.required
              ? " fb-consent__chip--required" : ""),
          }, config.required ? "Bắt buộc" : "Tùy chọn"),
          h("span", { class: "fb-consent__ver" }, config.version),
        ),
        h("span", { class: "fb-consent__desc" }, config.description),
        noteText ? h("span", { class: "fb-consent__note" }, noteText) : null,
      );

      // Nút chi tiết nằm NGOÀI label — bấm chi tiết không đổi checkbox.
      return h("div", { class: "fb-consent__option" },
        checkbox,
        h("label", { for: inputId, class: "fb-consent__option-main" },
          box,
          text,
        ),
        h("button", {
          type: "button",
          class: "fb-consent__detail",
          onClick: () => openDetails(config),
        }, `Xem chi tiết ${config.title}`),
      );
    }

    function groupElement(eyebrow, chipText, sub, keys) {
      return h("div", { class: "fb-consent__group" },
        h("div", { class: "fb-consent__group-head" },
          h("span", { class: "fb-consent__eyebrow" }, eyebrow),
          h("span", { class: "fb-consent__chip" }, chipText),
        ),
        sub ? h("p", { class: "fb-consent__group-sub" }, sub) : null,
        h("div", { class: "fb-consent__group-body" },
          keys.map((key) => optionElement(key))),
      );
    }

    function renderForm() {
      formArea.replaceChildren();
      formArea.appendChild(groupElement(
        "Cần để tiếp tục", "1 mục bắt buộc", null, ["service"]));
      formArea.appendChild(groupElement(
        "Các lựa chọn tùy chọn", "2 tùy chọn",
        "Bạn có thể bật hoặc tắt mà không ảnh hưởng tới việc dùng các tính "
        + "năng không cần AI.",
        ["ai_processing", "research"]));
      formArea.appendChild(h("p", { class: "fb-consent__requirement",
        "aria-live": "polite" },
        "Cần chấp nhận Điều khoản sử dụng để tiếp tục."));
      const actions = h("div", { class: "fb-consent__actions" },
        continueButton,
        submitStatus,
      );
      formArea.appendChild(actions);
      formArea.appendChild(h("p", { class: "fb-consent__after-note" },
        "Bạn có thể thay đổi các lựa chọn này bất cứ lúc nào trong phần "
        + "Cài đặt & Quyền riêng tư. Rút một sự đồng ý không xóa bản ghi đã "
        + "ghi trong sổ cái mà đánh dấu không còn hiệu lực."));
      syncContinueState();
    }

    function setCheckboxesDisabled(disabled) {
      for (const checkbox of checkboxes.values()) {
        checkbox.disabled = disabled;
      }
    }

    function load() {
      const thisRun = ++runId;
      formArea.replaceChildren();
      formArea.appendChild(createSkeleton({ variant: "card", count: 3 }));
      continueButton.disabled = true;
      ctx.adapter.listConsents()
        .then((consents) => {
          if (cancelled || thisRun !== runId) return;
          for (const record of consents) {
            if (!record || !POLICY_PURPOSES[record.purpose]) continue;
            const config = POLICY_PURPOSES[record.purpose];
            if (record.decision === "accepted" && !record.withdrawn
              && record.policy_version === config.version) {
              restoredAccepted.set(record.purpose, true);
              recordedNotes.set(record.purpose,
                `Bạn đã chấp nhận phiên bản ${config.version} trước đó.`);
            } else if (record.policy_version
              && record.policy_version !== config.version) {
              recordedNotes.set(record.purpose,
                `Bản ghi cũ theo phiên bản ${record.policy_version} không tự `
                + `áp dụng cho phiên bản hiện hành.`);
            }
          }
          renderForm();
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
          formArea.replaceChildren();
          formArea.appendChild(
            createErrorState({
              title: "Không tải được trạng thái đồng ý",
              description: error && error.kind === "timeout"
                ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
                : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: () => load(),
            }),
          );
        });
    }

    async function submit() {
      if (submitting) return;
      submitting = true;
      syncContinueState();
      continueButton.disabled = true;
      // A01: chốt actor + SNAPSHOT lựa chọn NGAY LÚC BẤM. Mọi mutation sau
      // đó dùng snapshot — checkbox thay đổi giữa chừng (nếu có) không tự
      // động thành một quyết định mới; thay đổi cần một lần xác nhận mới.
      const startGeneration = getSessionGeneration();
      const thisRun = runId;
      const decisions = CONSENT_ORDER.map((key) => {
        const config = POLICY_PURPOSES[key];
        const checked = checkboxes.get(key)
          ? checkboxes.get(key).checked : false;
        return {
          purpose: config.purpose,
          version: config.version,
          decision: checked ? "accepted" : "declined",
        };
      });
      setCheckboxesDisabled(true);
      submitStatus.textContent = "Đang ghi lựa chọn của bạn…";
      /** Kiểm tra sau MỖI await: trang chết / render mới / ĐỔI PHIÊN (actor
       * khác) -> dừng ngay, KHÔNG ghi tiếp mục nào sang actor mới. */
      const isStale = () =>
        cancelled || thisRun !== runId
        || getSessionGeneration() !== startGeneration;
      try {
        const existing = new Map();
        try {
          for (const record of await ctx.adapter.listConsents()) {
            if (record) existing.set(record.purpose, record);
          }
          if (isStale()) return;
        } catch (error) {
          // A01: KHÔNG nuốt stale/401/cancellation rồi ghi tiếp. Lỗi đọc:
          // nếu phiên đã đổi -> bỏ im (luồng cũ chết); nếu phiên còn ->
          // dừng và báo, KHÔNG ghi khi chưa thấy được trạng thái hiện tại.
          if (isStale()) return;
          submitting = false;
          setCheckboxesDisabled(false);
          syncContinueState();
          submitStatus.textContent = error && error.kind === "timeout"
            ? "Không đọc được trạng thái đồng ý (quá thời gian chờ). Chưa "
              + "ghi gì — vui lòng thử lại."
            : "Không đọc được trạng thái đồng ý. Chưa ghi gì — vui lòng "
              + "thử lại.";
          return;
        }
        for (const item of decisions) {
          const previous = existing.get(item.purpose);
          const sameAsRecorded = Boolean(
            previous && previous.decision === item.decision
              && previous.policy_version === item.version
              && (item.decision === "declined" || !previous.withdrawn),
          );
          if (sameAsRecorded) continue; // tránh ghi trùng vào sổ cái
          await ctx.adapter.recordConsent({
            purpose: item.purpose,
            policyVersion: item.version,
            decision: item.decision,
          });
          if (isStale()) return; // dừng TRƯỚC khi ghi mục tiếp theo
        }
        if (isStale()) return;
        ctx.navigate(state.role ? "/home" : "/role-select");
      } catch (error) {
        if (isStale()) {
          // Stale do destroy/render mới/đổi phiên: im lặng (luồng cũ chết).
          // NHƯNG nếu 401 THẬT đã xóa phiên hiện tại -> về trang đăng nhập
          // (không dùng đường này để đá người dùng vì response lỗi thời —
          // khi đó phiên mới đang sống và hasLiveSession() là true).
          if (!cancelled && thisRun === runId && !hasLiveSession()) {
            ctx.navigate("/login?reason=expired");
          }
          return;
        }
        submitting = false;
        setCheckboxesDisabled(false);
        syncContinueState();
        // A01/A10: kết quả ghi chưa xác định (mất response: timeout/network/
        // stale khi phiên còn) không được báo chắc chắn thất bại hay tự
        // replay — mời kiểm tra lại; submit sau đó đối chiếu trước khi ghi.
        submitStatus.textContent =
          error && (error.kind === "timeout" || error.kind === "network"
            || error.kind === "stale_session")
            ? "Kết quả ghi CHƯA XÁC ĐỊNH (máy chủ có thể đã nhận). Bấm Xác "
              + "nhận lại sau khi kiểm tra, lựa chọn của bạn sẽ được đối "
              + "chiếu trước khi ghi."
            : "Không ghi nhận được đồng ý. Vui lòng thử lại.";
      }
    }

    // Chân trang thương hiệu (thật): logo + tagline + liên kết trợ giúp.
    const footer = h("footer", { class: "fb-consent__footer" },
      h("div", { class: "fb-consent__footer-brand" },
        createLogo({ size: "sm" }),
        h("span", {}, "Family Bridge — Không gian lắng nghe và thấu hiểu "
          + "giữa phụ huynh & học sinh")),
      h("a", { class: "fb-consent__footer-link", href: "#/help" },
        "Trung tâm hỗ trợ"),
    );
    panel.appendChild(footer);

    load();

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
