// M04 — Đồng ý theo từng mục đích, từng phiên bản chính sách (WF-17).
// Stitch handoff 2026-10-21 (m04_ng_ch_a_ch_n / m04_ng_ch_n_b_t_bu_c /
// m04_ng_l_i_l_u_k_t_n_i): card checkbox 44px, chip Bắt buộc/Tùy chọn,
// gợi ý "Cần chấp nhận Điều khoản sử dụng" dưới CTA khi chưa đủ điều kiện,
// lỗi lưu hiện banner riêng mà KHÔNG mất lựa chọn đã tick.
// Không tự precheck lựa chọn nào; chỉ đánh dấu lại những mục người dùng ĐÃ
// chấp nhận trước đó cho đúng phiên bản hiện hành (khôi phục trạng thái thật).
// Đăng nhập không bao giờ tự hiểu là đã đồng ý.
import { h } from "../../app/dom.js";
import { getSessionGeneration, hasLiveSession } from "../../core/session.js";
import { CONSENT_ORDER, POLICY_PURPOSES } from "../../core/policy.js";
import {
  createButton, createErrorState, createIcon, createSkeleton, createTopBar,
} from "../../components/index.js";

let markRenderCancelled = () => {};

export const page = {
  id: "f01-consent",
  title: "Đồng ý & quyền riêng tư",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    let runId = 0;
    markRenderCancelled = () => { cancelled = true; runId += 1; };

    const root = h("div", { class: "fb-page", dataset: { page: "f01-consent" } });

    root.appendChild(
      createTopBar({
        title: "Đồng ý & quyền riêng tư",
        showBack: true,
        onBack: () => ctx.navigate("/login"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);

    // Chưa đăng nhập (không tính demo): dẫn về đăng nhập, không hiện form.
    if (!demo && !hasLiveSession()) {
      ctx.navigate("/login?reason=expired");
      const placeholder = h("div", { class: "fb-page__body" });
      root.appendChild(placeholder);
      return root;
    }

    // Header theo frame M04: kicker + tiêu đề + mô tả trung thực
    const head = h("header", { class: "fb-consent__head" });
    head.appendChild(
      h("span", { class: "fb-consent__kicker" },
        createIcon({ name: "shield_person", size: 16 }),
        "Minh bạch & quyền riêng tư",
      ),
    );
    head.appendChild(h("h2", { class: "fb-consent__heading" }, "Bạn đồng ý điều gì?"));
    head.appendChild(
      h("p", { class: "fb-consent__sub" },
        "Mỗi mục đích sử dụng cần một sự đồng ý riêng. Bạn chỉ chọn những gì bạn muốn; " +
        "từ chối mục tùy chọn không ảnh hưởng việc dùng ứng dụng.",
      ),
    );
    body.appendChild(head);

    const formArea = h("div", { class: "fb-consent__list" });
    body.appendChild(formArea);

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

    // Gợi ý hiển thị khi CTA còn khóa (frame m04_chưa_chọn). Node thêm/gỡ
    // khỏi DOM theo trạng thái — không dùng hidden để text không lẫn vào
    // textContent khi điều kiện không còn đúng.
    let requiredHint = null;
    function syncRequiredHint(serviceChecked) {
      if (!serviceChecked && !requiredHint) {
        requiredHint = h("p", { class: "fb-consent__required-hint" },
          createIcon({ name: "info", size: 15, className: "fb-consent__required-hint-icon" }),
          "Cần chấp nhận Điều khoản sử dụng để tiếp tục.",
        );
        const parent = continueButton.parentNode;
        if (parent) parent.insertBefore(requiredHint, continueButton.nextSibling);
      } else if (serviceChecked && requiredHint) {
        if (requiredHint.parentNode) requiredHint.parentNode.removeChild(requiredHint);
        requiredHint = null;
      }
    }

    // Banner lỗi lưu (frame m04_lỗi_lưu): các checkbox GIỮ NGUYÊN lựa chọn —
    // logic submit dưới đây không reset form. Không gắn role="status" (slot
    // status duy nhất của trang là submitStatus bên dưới, test A01 dựa vào đó).
    let saveErrorCard = null;
    function showSaveError(title, text) {
      hideSaveError();
      saveErrorCard = h("div", { class: "fb-consent__save-error", role: "alert" },
        createIcon({ name: "error", size: 20, className: "fb-consent__save-error-icon" }),
        h("div", { class: "fb-consent__save-error-body" },
          h("strong", {}, title),
          h("p", {}, text),
        ),
      );
      const parent = continueButton.parentNode;
      if (parent) parent.insertBefore(saveErrorCard, continueButton);
    }
    function hideSaveError() {
      if (saveErrorCard) {
        if (saveErrorCard.parentNode) saveErrorCard.parentNode.removeChild(saveErrorCard);
        saveErrorCard = null;
      }
    }

    function syncContinueState() {
      const serviceChecked = checkboxes.get("service")
        ? checkboxes.get("service").checked : false;
      continueButton.disabled = submitting || !serviceChecked;
      continueButton.title = serviceChecked
        ? ""
        : "Cần chấp nhận Điều khoản sử dụng để tiếp tục.";
      syncRequiredHint(serviceChecked);
    }

    function renderForm() {
      formArea.replaceChildren();
      for (const key of CONSENT_ORDER) {
        const config = POLICY_PURPOSES[key];
        const checkbox = h("input", {
          type: "checkbox",
          id: `fb-consent-${config.purpose}`,
          class: "fb-consent__checkbox",
          onChange: () => {
            hideSaveError();
            syncContinueState();
          },
        });
        checkbox.checked = restoredAccepted.get(config.purpose) === true; // không precheck; chỉ khôi phục lựa chọn cũ đúng phiên bản
        checkboxes.set(config.purpose, checkbox);

        const noteText = recordedNotes.get(config.purpose);
        const item = h("div", { class: "fb-consent__item" });
        const label = h("label", {
          class: "fb-consent__label",
          for: `fb-consent-${config.purpose}`,
        },
          checkbox,
          h("span", { class: "fb-consent__box", "aria-hidden": "true" },
            createIcon({ name: "check_circle", size: 20, className: "fb-consent__box-icon" }),
          ),
          h("span", { class: "fb-consent__content" },
            h("span", { class: "fb-consent__title-row" },
              h("strong", { class: "fb-consent__title" }, config.title),
              h("span", {
                class: `fb-chip ${config.required ? "fb-consent__chip--required" : "fb-consent__chip--optional"}`,
              }, config.required ? "Bắt buộc" : "Tùy chọn"),
            ),
            h("p", { class: "fb-consent__desc" }, config.description),
            noteText
              ? h("span", { class: "fb-consent__note" }, noteText)
              : null,
          ),
        );
        item.appendChild(label);
        formArea.appendChild(item);
      }
      syncContinueState();
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
            } else if (record.policy_version && record.policy_version !== config.version) {
              recordedNotes.set(record.purpose,
                `Bản ghi cũ theo phiên bản ${record.policy_version} không tự áp dụng cho phiên bản hiện hành.`);
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

    const submitStatus = h("p", { class: "fb-consent__status fb-page__note", role: "status" });

    function setCheckboxesDisabled(disabled) {
      for (const checkbox of checkboxes.values()) {
        checkbox.disabled = disabled;
      }
    }

    async function submit() {
      if (submitting) return;
      submitting = true;
      hideSaveError();
      syncContinueState();
      continueButton.disabled = true;
      // A01: chốt actor + SNAPSHOT lựa chọn NGAY LÚC BẤM. Mọi mutation sau
      // đó dùng snapshot — checkbox thay đổi giữa chừng (nếu có) không tự
      // động thành một quyết định mới; thay đổi cần một lần xác nhận mới.
      const startGeneration = getSessionGeneration();
      const thisRun = runId;
      const decisions = CONSENT_ORDER.map((key) => {
        const config = POLICY_PURPOSES[key];
        const checked = checkboxes.get(key) ? checkboxes.get(key).checked : false;
        return {
          purpose: config.purpose,
          version: config.version,
          decision: checked ? "accepted" : "declined",
        };
      });
      setCheckboxesDisabled(true);
      /** Kiểm tra sau MỖI await: trang chết / render mới / ĐỔI PHIÊN (actor
       * khác) -> dừng ngay, KHÔNG ghi tiếp mục nào sang actor mới. */
      const isStale = () =>
        cancelled || thisRun !== runId || getSessionGeneration() !== startGeneration;
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
          showSaveError(
            "Không đọc được trạng thái đồng ý",
            error && error.kind === "timeout"
              ? "Kết nối quá thời gian chờ. Chưa ghi gì — lựa chọn của bạn vẫn giữ nguyên, vui lòng thử lại."
              : "Không kết nối được máy chủ. Chưa ghi gì — lựa chọn của bạn vẫn giữ nguyên, vui lòng thử lại.",
          );
          submitStatus.textContent = "Chưa ghi gì — các lựa chọn của bạn vẫn được giữ nguyên.";
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
        if (error && (error.kind === "timeout" || error.kind === "network"
          || error.kind === "stale_session")) {
          showSaveError(
            "Kết quả ghi CHƯA XÁC ĐỊNH",
            "Máy chủ có thể đã nhận. Lựa chọn của bạn vẫn giữ nguyên — bấm Xác nhận và tiếp tục sau khi kiểm tra, hệ thống sẽ đối chiếu trước khi ghi.",
          );
          submitStatus.textContent =
            "Kết quả ghi CHƯA XÁC ĐỊNH (máy chủ có thể đã nhận). Bấm Xác nhận lại sau khi kiểm tra, lựa chọn của bạn sẽ được đối chiếu trước khi ghi.";
        } else {
          showSaveError(
            "Không ghi nhận được đồng ý",
            "Lựa chọn của bạn vẫn giữ nguyên. Vui lòng thử lại.",
          );
          submitStatus.textContent = "Không ghi nhận được đồng ý. Vui lòng thử lại.";
        }
      }
    }

    body.appendChild(continueButton);
    body.appendChild(submitStatus);
    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Bạn có thể xem và rút lại từng lựa chọn đồng ý bất cứ lúc nào trong Cài đặt & Riêng tư. "
        + "Thu hồi không xóa dữ liệu đã ghi trong sổ cái mà đánh dấu không còn hiệu lực.",
      ),
    );

    body.appendChild(
      h("p", { class: "fb-page__aside" },
        h("a", { href: "#/help" },
          createIcon({ name: "support_agent", size: 16 }),
          " Tìm trợ giúp học đường & tâm lý",
        ),
      ),
    );

    load();

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
