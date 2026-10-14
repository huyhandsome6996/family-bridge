// F01 — Đồng ý theo từng mục đích, từng phiên bản chính sách (WF-17).
// Không tự precheck lựa chọn nào; chỉ đánh dấu lại những mục người dùng ĐÃ
// chấp nhận trước đó cho đúng phiên bản hiện hành (khôi phục trạng thái thật).
// Đăng nhập không bao giờ tự hiểu là đã đồng ý.
import { h } from "../../app/dom.js";
import { getSessionGeneration, hasLiveSession } from "../../core/session.js";
import { CONSENT_ORDER, POLICY_PURPOSES } from "../../core/policy.js";
import {
  createButton, createCard, createErrorState, createSkeleton, createTopBar,
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

    body.appendChild(
      h("h2", { class: "fb-page__heading" }, "Bạn đồng ý điều gì?"),
    );

    const intro = h(
      "p", { class: "fb-page__lead" },
      "Mỗi mục đích sử dụng cần một sự đồng ý riêng. Bạn chỉ chọn những gì bạn muốn; " +
      "từ chối mục tùy chọn không ảnh hưởng việc dùng ứng dụng.",
    );
    body.appendChild(intro);

    const formArea = h("div", {});
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

    function syncContinueState() {
      const serviceChecked = checkboxes.get("service")
        ? checkboxes.get("service").checked : false;
      continueButton.disabled = submitting || !serviceChecked;
      continueButton.title = serviceChecked
        ? ""
        : "Cần chấp nhận Điều khoản sử dụng để tiếp tục.";
    }

    function renderForm() {
      formArea.replaceChildren();
      for (const key of CONSENT_ORDER) {
        const config = POLICY_PURPOSES[key];
        const checkbox = h("input", {
          type: "checkbox",
          id: `fb-consent-${config.purpose}`,
          class: "fb-input",
          style: "width:auto;margin-right:8px;",
          onChange: () => syncContinueState(),
        });
        checkbox.checked = restoredAccepted.get(config.purpose) === true; // không precheck; chỉ khôi phục lựa chọn cũ đúng phiên bản
        checkboxes.set(config.purpose, checkbox);

        const noteText = recordedNotes.get(config.purpose);
        const label = h("label", {
          for: `fb-consent-${config.purpose}`,
          style: "display:flex;align-items:flex-start;gap:4px;",
        },
        checkbox,
        h("span", {},
          h("strong", {}, config.title + (config.required ? " (bắt buộc)" : " (tùy chọn)")),
          h("br"),
          config.description,
          noteText ? h("span", { class: "fb-page__note" }, noteText) : null,
        ),
        );
        formArea.appendChild(
          createCard({ title: null, description: null, children: label }),
        );
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

    const submitStatus = h("p", { class: "fb-page__note", role: "status" });

    function setCheckboxesDisabled(disabled) {
      for (const checkbox of checkboxes.values()) {
        checkbox.disabled = disabled;
      }
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
          submitStatus.textContent = error && error.kind === "timeout"
            ? "Không đọc được trạng thái đồng ý (quá thời gian chờ). Chưa ghi gì — vui lòng thử lại."
            : "Không đọc được trạng thái đồng ý. Chưa ghi gì — vui lòng thử lại.";
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
            ? "Kết quả ghi CHƯA XÁC ĐỊNH (máy chủ có thể đã nhận). Bấm Xác nhận lại sau khi kiểm tra, lựa chọn của bạn sẽ được đối chiếu trước khi ghi."
            : "Không ghi nhận được đồng ý. Vui lòng thử lại.";
      }
    }

    body.appendChild(continueButton);
    body.appendChild(submitStatus);
    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Việc thu hồi từng sự đồng ý sẽ nằm trong phần Cá nhân khi tính năng " +
        "quản lý quyền riêng tư (F15) được kích hoạt trên bản này. Thu hồi khi " +
        "có sẽ không xóa dữ liệu đã ghi trong sổ cái mà đánh dấu không còn hiệu lực.",
      ),
    );

    load();

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
