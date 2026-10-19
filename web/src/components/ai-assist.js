// createAiAssist — khối "AI gợi ý cách diễn đạt" (F04, US-029/US-033) dùng CHUNG
// cho màn soạn (#/compose) và khung phản hồi thư (#/messages/:id). Cùng một
// semantics hợp đồng đã đóng băng v1 (F04-COORD) ở cả hai bề mặt:
//
// C1. aiRefine({text, key, inputRevision}) -> POST /api/v1/ai/refine
//     {original_text, purpose:"refine_expression", input_revision} + X-Idempotency-Key;
//     DTO trả NGUYÊN {suggestion_id, purpose, status, original_text,
//     suggested_text, model_revision, prompt_revision, input_revision, created_at, decided_at}.
//     aiStatus() -> {ai_enabled}; consents GET/POST /api/v1/consents
//     {purpose, decision, policy_version}.
// C2. Field text DUY NHẤT là `suggested_text` — không đọc tên field gợi ý của
//     hợp đồng cũ (đã bị loại khỏi contract freeze v1).
// C3. Consent gate TRƯỚC lần dùng AI đầu: sheet disclosure nói rõ dữ liệu gửi
//     đi + Gemini là BÊN XỬ LÝ KỸ THUẬT (không phải người thân đọc tin);
//     decline -> viết tay vẫn dùng được đầy đủ. Không hứa "riêng tư tuyệt
//     đối", mã hóa, retention/quota/lượt. 403 code "consent_required" -> mở sheet.
// C4. Stale guard: bộ đếm inputRevision bắt đầu 1, tăng MỖI input event trên
//     textarea (kể cả IME — trung thực: nội dung thật sự đổi). Gửi kèm refine;
//     response lệch revision hiện tại -> STALE: cảnh báo "Nội dung đã thay đổi
//     kể từ khi tạo gợi ý", KHÓA "Dùng gợi ý", chỉ còn manual/tạo lại. Sửa text
//     sau khi response về trước lúc bấm apply -> apply bị chặn (kiểm tra lại
//     revision TẠI THỜI ĐIỂM BẤM). Re-check LẦN 2 sau khi aiAccept resolve
//     (R3A4-01): gõ trong lúc ghi nhận đang bay -> KHÔNG điền đè, giữ text mới
//     của user + thẻ chuyển stale. Trong lúc accept đang bay nút "Dùng gợi ý"
//     bị DISABLED (không nuốt click âm thầm). Khi thẻ gợi ý đang mở, mỗi input
//     event re-render thẻ NGAY (R3A4-02) — banner/khóa hiện tức thì khi gõ.
// C5. Không auto-generate; loading KHÔNG chặn gõ/lưu nháp/help + có nút
//     "Hủy chờ gợi ý" (hủy CHỜ cục bộ — response muộn bị bỏ qua, không hủy
//     máy chủ, không tự retry); AI off/503/timeout/quota -> trạng thái lỗi
//     trung thực + đường manual LUÔN còn; KHÔNG fake fallback.
// C6. Apply/discard thật qua aiAccept/aiDiscard — không tạo Message, không gửi;
//     guard double-click/inflight; unmount/logout an toàn (destroy); gợi ý
//     render bằng textContent (h()) — CẤM innerHTML (SEC-12).
// C7. Tiếng Việt có dấu; không chẩn đoán/trị liệu; nút >= 44px; focus visible.
import { h, clear } from "../app/dom.js";
import { POLICY_PURPOSES } from "../../../packages/family_bridge_shared/src/policy.js";
import { createButton, createSheet, createIcon, createSkeleton } from "./index.js";

const AI_PURPOSE = "ai_processing";
const AI_CONSENT_VERSION = POLICY_PURPOSES.ai_processing.version;

/** Quyết định "đã chấp nhận": từ vựng repo ("accepted") + tương thích "granted". */
const POSITIVE_DECISIONS = new Set(["accepted", "granted"]);

/** Copy hai vai trò — CÙNG component, KHÁC xưng hô (frame caregiver cg_01/cg_02). */
export const AI_COPY = {
  student: {
    cta: "AI gợi ý cách diễn đạt êm ái hơn",
    ctaOffTitle: "Tính năng gợi ý AI chưa được bật ở bản này.",
    ctaOnTitle: "Xin gợi ý diễn đạt êm ái hơn cho lời nhắn hiện tại.",
    privacyChip: "Riêng tư",
    readyNote:
      "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời nhắn của mình.",
    offNote:
      "Cổng gợi ý AI chưa được bật trên máy chủ — nút sẽ mở khi máy chủ bật.",
    unknownNote:
      "Chưa kiểm tra được trạng thái cổng gợi ý AI — bạn vẫn viết tay, lưu nháp và gửi bình thường.",
    emptyHint: "Hãy viết vài dòng trước khi dùng gợi ý AI.",
    loadingNote:
      "Đang tạo gợi ý… Bạn vẫn gõ tiếp, lưu nháp và mở trợ giúp bình thường.",
    cancelBtn: "Hủy chờ gợi ý",
    cancelledNote:
      "Bạn đã hủy chờ gợi ý — lời nhắn giữ nguyên. Bấm lại khi bạn sẵn sàng.",
    suggestionLabel: "Gợi ý của máy chủ:",
    originalLabel: "Bản gốc của bạn:",
    useBtn: "Dùng gợi ý",
    discardBtn: "Bỏ",
    retryBtn: "Tạo gợi ý mới",
    staleBanner:
      "Nội dung đã thay đổi kể từ khi tạo gợi ý — hãy đọc lại hoặc tạo gợi ý mới. Bản soạn hiện tại không bị đụng tới.",
    appliedNote:
      "Bạn đã dùng gợi ý — nội dung chỉ nằm trong ô soạn, chưa lưu nháp và chưa gửi.",
    discardNote: "Bạn đã bỏ gợi ý — lời nhắn hiện tại giữ nguyên.",
    errConsentCheck: "Chưa kiểm tra được trạng thái đồng ý AI. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errConsentSave: "Chưa ghi nhận được lựa chọn đồng ý. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errTimeout: "Kết nối quá thời gian chờ khi tạo gợi ý. Bản soạn giữ nguyên — bạn có thể thử lại.",
    errUnavailable: "Cổng gợi ý AI tạm không khả dụng (máy chủ quá tải hoặc tắt). Bản soạn giữ nguyên — viết tay vẫn dùng được.",
    errBusy: "Máy chủ tạm chặn thêm yêu cầu gợi ý (quá nhiều yêu cầu trong lúc này). Viết tay vẫn dùng được bình thường.",
    errGeneric: "Chưa lấy được gợi ý AI — bản soạn của bạn giữ nguyên. Viết tay, lưu nháp và trợ giúp vẫn dùng được.",
    acceptFailNote: "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại.",
    noun: "lời nhắn",
  },
  caregiver: {
    cta: "AI gợi ý cách diễn đạt êm ái hơn",
    ctaOffTitle: "Tính năng gợi ý AI chưa được bật ở bản này.",
    ctaOnTitle: "Xin gợi ý diễn đạt êm ái hơn cho lời nhắn hiện tại.",
    privacyChip: "Riêng tư",
    readyNote:
      "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời nhắn của mình.",
    offNote:
      "Cổng gợi ý AI chưa được bật trên máy chủ — nút sẽ mở khi máy chủ bật.",
    unknownNote:
      "Chưa kiểm tra được trạng thái cổng gợi ý AI — bạn vẫn viết tay, lưu nháp và gửi bình thường.",
    emptyHint: "Hãy viết vài dòng trước khi dùng gợi ý AI.",
    loadingNote:
      "Đang tạo gợi ý… Bạn vẫn gõ tiếp, lưu nháp và mở trợ giúp bình thường.",
    cancelBtn: "Hủy chờ gợi ý",
    cancelledNote:
      "Bạn đã hủy chờ gợi ý — lời nhắn giữ nguyên. Bấm lại khi bạn sẵn sàng.",
    suggestionLabel: "Gợi ý của máy chủ:",
    originalLabel: "Bản gốc của bạn:",
    useBtn: "Dùng gợi ý",
    discardBtn: "Bỏ",
    retryBtn: "Tạo gợi ý mới",
    staleBanner:
      "Nội dung đã thay đổi kể từ khi tạo gợi ý — hãy đọc lại hoặc tạo gợi ý mới. Bản soạn hiện tại không bị đụng tới.",
    appliedNote:
      "Bạn đã dùng gợi ý — nội dung chỉ nằm trong ô soạn, chưa lưu nháp và chưa gửi.",
    discardNote: "Bạn đã bỏ gợi ý — lời nhắn hiện tại giữ nguyên.",
    errConsentCheck: "Chưa kiểm tra được trạng thái đồng ý AI. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errConsentSave: "Chưa ghi nhận được lựa chọn đồng ý. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errTimeout: "Kết nối quá thời gian chờ khi tạo gợi ý. Bản soạn giữ nguyên — bạn có thể thử lại.",
    errUnavailable: "Cổng gợi ý AI tạm không khả dụng (máy chủ quá tải hoặc tắt). Bản soạn giữ nguyên — viết tay vẫn dùng được.",
    errBusy: "Máy chủ tạm chặn thêm yêu cầu gợi ý (quá nhiều yêu cầu trong lúc này). Viết tay vẫn dùng được bình thường.",
    errGeneric: "Chưa lấy được gợi ý AI — bản soạn của bạn giữ nguyên. Viết tay, lưu nháp và trợ giúp vẫn dùng được.",
    acceptFailNote: "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại.",
    noun: "lời nhắn",
  },
  reply: {
    cta: "AI gợi ý cách diễn đạt êm ái hơn",
    ctaOffTitle: "Tính năng gợi ý AI chưa được bật ở bản này.",
    ctaOnTitle: "Xin gợi ý diễn đạt êm ái hơn cho lời phản hồi hiện tại.",
    privacyChip: "Riêng tư",
    readyNote:
      "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời phản hồi của mình.",
    offNote:
      "Cổng gợi ý AI chưa được bật trên máy chủ — nút sẽ mở khi máy chủ bật.",
    unknownNote:
      "Chưa kiểm tra được trạng thái cổng gợi ý AI — bạn vẫn viết phản hồi và gửi bình thường.",
    emptyHint: "Hãy viết vài dòng trước khi dùng gợi ý AI.",
    loadingNote:
      "Đang tạo gợi ý… Bạn vẫn gõ tiếp và gửi phản hồi bằng tay bình thường.",
    cancelBtn: "Hủy chờ gợi ý",
    cancelledNote:
      "Bạn đã hủy chờ gợi ý — lời phản hồi giữ nguyên. Bấm lại khi bạn sẵn sàng.",
    suggestionLabel: "Gợi ý của máy chủ:",
    originalLabel: "Bản gốc của bạn:",
    useBtn: "Dùng gợi ý",
    discardBtn: "Bỏ",
    retryBtn: "Tạo gợi ý mới",
    staleBanner:
      "Nội dung đã thay đổi kể từ khi tạo gợi ý — hãy đọc lại hoặc tạo gợi ý mới. Lời phản hồi hiện tại không bị đụng tới.",
    appliedNote: "Bạn đã dùng gợi ý — nội dung chỉ nằm trong ô soạn, chưa gửi.",
    discardNote: "Bạn đã bỏ gợi ý — lời phản hồi hiện tại giữ nguyên.",
    errConsentCheck: "Chưa kiểm tra được trạng thái đồng ý AI. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errConsentSave: "Chưa ghi nhận được lựa chọn đồng ý. Viết tay vẫn dùng được — thử lại sau ít phút.",
    errTimeout: "Kết nối quá thời gian chờ khi tạo gợi ý. Lời phản hồi giữ nguyên — bạn có thể thử lại.",
    errUnavailable: "Cổng gợi ý AI tạm không khả dụng (máy chủ quá tải hoặc tắt). Lời phản hồi giữ nguyên — viết tay vẫn dùng được.",
    errBusy: "Máy chủ tạm chặn thêm yêu cầu gợi ý (quá nhiều yêu cầu trong lúc này). Viết tay vẫn dùng được bình thường.",
    errGeneric: "Chưa lấy được gợi ý AI — lời phản hồi của bạn giữ nguyên. Viết tay vẫn dùng được.",
    acceptFailNote: "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại.",
    noun: "lời phản hồi",
  },
};

function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `fb-${Date.now().toString(36)}-`
    + `${Math.random().toString(36).slice(2, 12)}-`
    + `${Math.random().toString(36).slice(2, 12)}`;
}

/** Đọc consent "ai_processing" còn hiệu lực từ danh sách máy chủ. */
export function findActiveAiConsent(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => {
    if (!row || row.purpose !== AI_PURPOSE) return false;
    if (!POSITIVE_DECISIONS.has(String(row.decision || ""))) return false;
    if (row.withdrawn === true) return false;
    if (row.current === false) return false;
    // Không có trường current -> đối chiếu phiên bản chính sách shared (A1).
    if (row.current === undefined && row.policy_version != null
      && String(row.policy_version) !== AI_CONSENT_VERSION) return false;
    return true;
  }) || null;
}

function busyGuard() {
  const busy = new Set();
  return function guarded(key, fn) {
    if (busy.has(key)) return;
    busy.add(key);
    Promise.resolve()
      .then(fn)
      .finally(() => busy.delete(key));
  };
}

/**
 * Tạo khối AI assist gắn với một textarea. Trả { el, destroy }.
 * `copy`: AI_COPY.student | AI_COPY.caregiver | AI_COPY.reply (biến thể copy
 * caregiver/reply — CÙNG component, CÙNG semantics).
 */
export function createAiAssist({ adapter, textarea, copy = AI_COPY.student } = {}) {
  if (!adapter || !textarea) {
    throw new Error("createAiAssist cần adapter + textarea");
  }

  let destroyed = false;
  let revision = 1; // C4: bắt đầu 1, tăng MỖI input event
  let gateStatus = "unknown"; // unknown | enabled | off
  let consentState = "unchecked"; // unchecked | granted | declined
  let current = null; // { dto, boundRev, stale }
  let activeSheet = null;
  let refineWaiting = false; // C5: đang chờ response refine (loading)
  let refineSeq = 0; // C5: định danh lượt chờ — hủy/unmount bỏ qua response cũ
  let applying = false; // C4/R3A4-01: accept đang bay — khóa "Dùng gợi ý" nhìn thấy
  let panelMode = "idle"; // mode panel đang render (idle/loading/error/suggestion)

  const busy = busyGuard();

  // ---- DOM khung tĩnh ----
  const root = h("div", { class: "fb-ai-assist" });
  const cta = h("button", {
    class: "fb-btn fb-btn--cta fb-compose__ai-btn",
    type: "button",
    disabled: true, // bật sau khi aiStatus trả lời trung thực
    title: "Đang kiểm tra trạng thái cổng gợi ý AI…",
  },
    createIcon({ name: "auto_awesome", size: 18 }),
    h("span", {}, copy.cta),
  );
  cta.addEventListener("click", () => busy("refine", () => onRefineClick()));
  const privacyChip = h("span", { class: "fb-ai-assist__chip" },
    createIcon({ name: "shield", size: 14 }),
    copy.privacyChip,
  );
  const row = h("div", { class: "fb-ai-assist__row" }, cta, privacyChip);
  root.appendChild(row);

  const note = h("p", { class: "fb-compose__ai-note", role: "status" }, copy.readyNote);
  root.appendChild(note);

  const panel = h("div", { class: "fb-ai-assist__panel" });
  root.appendChild(panel);

  // C4: revision tăng MỖI input event trên textarea (kể cả IME compose).
  // R3A4-02: khi thẻ gợi ý đang mở, re-render thẻ NGAY theo revision mới —
  // banner stale + khóa "Dùng gợi ý" xuất hiện tức thì khi gõ (parity Zalo),
  // không chờ đến lúc bấm. Chỉ re-render khi panel đang hiện thẻ (không đè
  // lên loading/error).
  const onInput = () => {
    revision += 1;
    if (current && panelMode === "suggestion") renderPanel("suggestion");
  };
  textarea.addEventListener("input", onInput);

  function setNote(text) {
    clear(note);
    note.appendChild(document.createTextNode(String(text)));
  }

  /** Trạng thái "khác gợi ý" của panel: loading / gợi ý / lỗi / trống. */
  function renderPanel(mode) {
    panelMode = mode;
    clear(panel);
    if (mode === "loading") {
      const loadingBox = h("div", { class: "fb-ai-assist__loading" },
        h("p", { class: "fb-compose__ai-note" }, copy.loadingNote),
        createSkeleton({ variant: "line", count: 2 }),
      );
      // C5 (frame zalo_f04_04): nút HỦY CHỜ — hủy cục bộ việc nhận kết quả,
      // không hủy máy chủ, không tự retry (cùng class .fb-compose__ai-cancel
      // với Mini App của A3 để hai client đồng bộ semantics).
      const cancelWaitBtn = createButton({
        label: copy.cancelBtn,
        variant: "ghost",
        onClick: () => onCancelWait(),
      });
      cancelWaitBtn.classList.add("fb-compose__ai-cancel");
      loadingBox.appendChild(cancelWaitBtn);
      panel.appendChild(loadingBox);
      return;
    }
    if (mode === "error") {
      panel.appendChild(
        h("div", { class: "fb-ai-assist__error", role: "alert" },
          createIcon({ name: "error", size: 16 }),
          h("span", {}, note.dataset.errorText || copy.errGeneric),
        ),
      );
      return;
    }
    if (mode === "suggestion" && current) {
      // Stale tính LIVE theo revision hiện tại (R3A4-02): gõ sau khi response
      // về -> banner/khóa hiện ngay ở lần re-render đầu tiên, không chờ bấm.
      const isStale = current.stale || current.boundRev !== revision;
      const card = h("div", { class: "fb-compose__ai-suggestion" });
      if (isStale) {
        card.appendChild(
          h("p", { class: "fb-ai-assist__stale", role: "alert" },
            createIcon({ name: "error", size: 16 }),
            h("span", {}, copy.staleBanner),
          ),
        );
      }
      card.appendChild(
        h("p", { class: "fb-compose__ai-suggest-label" }, copy.suggestionLabel),
      );
      // C2 + SEC-12: CHỈ suggested_text, render qua textContent.
      card.appendChild(
        h("p", { class: "fb-compose__ai-suggest-text" },
          String(current.dto.suggested_text || "")),
      );
      card.appendChild(
        h("p", { class: "fb-ai-assist__original" },
          `${copy.originalLabel} ${String(current.dto.original_text || "")}`),
      );
      const actions = h("div", { class: "fb-compose__pause-buttons" });
      const useBtn = createButton({
        label: copy.useBtn,
        variant: "cta",
        onClick: () => busy("accept", () => onAccept()),
      });
      useBtn.disabled = isStale || applying; // R3A4-01: khóa nhìn thấy khi accept đang bay
      if (isStale) {
        useBtn.title = "Gợi ý đã lỗi thời so với bản soạn hiện tại — hãy tạo gợi ý mới.";
      } else if (applying) {
        useBtn.title = "Đang ghi nhận lựa chọn…";
      }
      actions.appendChild(useBtn);
      actions.appendChild(createButton({
        label: copy.discardBtn,
        variant: "ghost",
        onClick: () => busy("discard", () => onDiscard()),
      }));
      if (isStale) {
        actions.appendChild(createButton({
          label: copy.retryBtn,
          variant: "primary",
          onClick: () => busy("refine", () => runRefine()),
        }));
      }
      card.appendChild(actions);
      panel.appendChild(card);
    }
    // mode "idle" -> panel rỗng
  }

  function setErrorNote(message) {
    note.dataset.errorText = String(message);
    setNote(message);
    renderPanel("error");
  }

  // ---- Consent (C3) ----
  function openConsentSheet({ onGranted }) {
    if (activeSheet && activeSheet.isConnected) activeSheet.close();
    const acceptBtn = createButton({
      label: "Đồng ý và tạo gợi ý",
      variant: "cta",
      onClick: () => {
        if (acceptBtn.disabled) return;
        acceptBtn.disabled = true;
        Promise.resolve()
          .then(() => adapter.recordConsent({
            purpose: AI_PURPOSE,
            policyVersion: AI_CONSENT_VERSION,
            decision: "accepted",
          }))
          .then(() => {
            consentState = "granted";
            sheet.close();
            setNote(copy.readyNote);
            renderPanel("idle");
            if (typeof onGranted === "function") onGranted();
          })
          .catch(() => {
            acceptBtn.disabled = false;
            sheet.close();
            setErrorNote(copy.errConsentSave);
          });
      },
    });
    const declineBtn = createButton({
      label: "Tiếp tục viết tay",
      variant: "ghost",
      onClick: () => {
        consentState = "declined";
        sheet.close();
        setNote("Bạn đã chọn không dùng gợi ý AI — viết tay, lưu nháp, xem trước và gửi vẫn dùng được đầy đủ. Có thể xem lại lựa chọn bằng nút gợi ý AI bất cứ lúc nào.");
        renderPanel("idle");
        recordDeclineQuietly();
      },
    });
    const content = h("div", { class: "fb-ai-consent" },
      h("p", { class: "fb-ai-consent__lead" },
        "Tính năng này giúp bạn diễn đạt ", copy.noun,
        " êm hơn. Khi bạn bấm tạo gợi ý, máy chủ Family Bridge sẽ gửi đoạn text đang soạn "
        + "(kèm số thứ tự lần chỉnh sửa) tới dịch vụ Gemini của Google — một BÊN XỬ LÝ KỸ THUẬT, "
        + "không phải người thân hay giáo viên đọc tin nhắn của bạn."),
      h("ul", { class: "fb-ai-consent__list" },
        h("li", {}, "Chỉ gửi đoạn text bạn chọn tạo gợi ý — không gửi danh bạ, nhật ký hay dữ liệu khác."),
        h("li", {}, "Bản gốc và các gợi ý chỉ mình bạn xem; người nhận chỉ nhận được ",
          h("strong", {}, "lời nhắn cuối cùng"), " sau khi bạn tự bấm gửi."),
        h("li", {}, "Không có đánh giá, chấm điểm hay phán xét cảm xúc; AI không thay thế hỗ trợ chuyên môn."),
        h("li", {}, "Bạn có thể bỏ qua AI và viết tay bất kỳ lúc nào — mọi bước viết, lưu nháp, "
          + "xem trước và gửi đều dùng được bình thường."),
      ),
      h("p", { class: "fb-page__note" },
        `Xử lý theo chính sách đồng ý hiện hành: ${POLICY_PURPOSES.ai_processing.title} `
        + `(${AI_CONSENT_VERSION}). Xem thêm ở trang Quyền riêng tư.`),
      acceptBtn,
      declineBtn,
    );
    const sheet = createSheet({
      title: "Về tính năng gợi ý AI",
      content,
      onClose: () => {
        if (activeSheet === sheet) activeSheet = null;
      },
    });
    // Desktop (>=1024px): consent hiện dạng dialog căn giữa (parity web),
    // mobile giữ bottom sheet — CÙNG component, không route mới.
    const sheetPanel = sheet.querySelector(".fb-sheet");
    if (sheetPanel) sheetPanel.classList.add("fb-sheet--dialog");
    activeSheet = sheet;
  }

  function recordDeclineQuietly() {
    // Ghi nhận decline best-effort: lỗi không chặn đường manual (C3).
    Promise.resolve()
      .then(() => adapter.recordConsent({
        purpose: AI_PURPOSE,
        policyVersion: AI_CONSENT_VERSION,
        decision: "declined",
      }))
      .catch(() => { /* im lặng — đã ở trạng thái declined cục bộ */ });
  }

  /** Kiểm tra consent (cache trong phiên mount) -> true nếu được phép gọi refine. */
  function ensureConsent(onAllowed) {
    if (consentState === "granted") {
      onAllowed();
      return;
    }
    if (consentState === "declined") {
      // Mở lại sheet để người dùng tự đổi ý — không tự bỏ qua lựa chọn cũ.
      openConsentSheet({ onGranted: onAllowed });
      return;
    }
    Promise.resolve()
      .then(() => adapter.listConsents())
      .then((rows) => {
        if (destroyed) return;
        if (findActiveAiConsent(rows)) {
          consentState = "granted";
          onAllowed();
          return;
        }
        openConsentSheet({ onGranted: onAllowed });
      })
      .catch(() => {
        if (destroyed) return;
        setErrorNote(copy.errConsentCheck);
      });
  }

  // ---- Refine / apply / discard (C4, C5, C6) ----
  function onRefineClick() {
    if (gateStatus !== "enabled") return; // nút đã disabled — phòng vệ thêm
    const text = textarea.value.trim();
    if (!text) {
      setNote(copy.emptyHint);
      renderPanel("idle");
      return;
    }
    // Mỗi lần bấm là MỘT lượt retry có chủ đích — chặn vòng lặp 403 vô hạn:
    // nếu server vẫn báo consent_required ngay sau khi người dùng đồng ý thì
    // báo lỗi trung thực, không tự gọi lại.
    ensureConsent(() => runRefine({ fromConsent: false }));
  }

  /** C5 (frame zalo_f04_04): hủy chờ CỤC BỘ — response cũ khi về sẽ bị bỏ qua;
   *  không hủy máy chủ, không tự retry; bấm lại = lượt refine mới (key mới). */
  function onCancelWait() {
    if (destroyed || !refineWaiting) return;
    refineSeq += 1; // response của lượt này (khi về) không còn khớp seq -> bỏ qua
    refineWaiting = false;
    cta.disabled = gateStatus !== "enabled";
    renderPanel("idle");
    setNote(copy.cancelledNote);
  }

  function runRefine({ fromConsent = false } = {}) {
    if (destroyed || gateStatus !== "enabled" || refineWaiting) return;
    const text = textarea.value.trim();
    if (!text) {
      setNote(copy.emptyHint);
      renderPanel("idle");
      return;
    }
    refineWaiting = true;
    const mySeq = ++refineSeq; // C5: response chỉ có hiệu lực nếu vẫn là lượt chờ này
    cta.disabled = true;
    renderPanel("loading");
    setNote(copy.loadingNote);
    const key = newIdemKey();
    const requestRevision = revision; // C4: revision TẠI THỜI ĐIỂM GỬI
    Promise.resolve()
      .then(() => adapter.aiRefine({ text, key, inputRevision: requestRevision }))
      .then((dto) => {
        if (destroyed || mySeq !== refineSeq) return; // đã hủy chờ/unmount
        refineWaiting = false;
        cta.disabled = false;
        if (!dto || !dto.suggestion_id
          || typeof dto.suggested_text !== "string") {
          throw new Error("invalid_suggestion");
        }
        // C4: revision ràng buộc — server echo (input_revision) khi có,
        // không có thì dùng revision chụp lúc gửi (vẫn đúng semantics client).
        const echo = Number(dto.input_revision);
        const boundRev = Number.isFinite(echo) ? echo : requestRevision;
        current = { dto, boundRev, stale: boundRev !== revision };
        setNote(copy.readyNote);
        renderPanel("suggestion");
      })
      .catch((error) => {
        if (destroyed || mySeq !== refineSeq) return; // đã hủy chờ/unmount
        refineWaiting = false;
        cta.disabled = false;
        if (error && error.code === "consent_required") {
          // 403 consent_required -> mở sheet disclosure (C3). Nếu vừa đồng ý
          // mà server vẫn chặn (phiên bản policy lệch...) -> lỗi trung thực,
          // KHÔNG loop gọi lại.
          consentState = "unchecked";
          if (fromConsent) {
            setErrorNote(copy.errConsentCheck);
            return;
          }
          ensureConsent(() => runRefine({ fromConsent: true }));
          return;
        }
        setErrorNote(describeAiError(error, copy));
      });
  }

  function onAccept() {
    if (destroyed || !current || applying) return;
    // C4: kiểm tra revision TẠI THỜI ĐIỂM BẤM — sửa text sau response => chặn.
    if (current.stale || current.boundRev !== revision) {
      current = { ...current, stale: true };
      renderPanel("suggestion");
      setNote(copy.staleBanner);
      return;
    }
    const dto = current.dto;
    const revisionAtClick = revision; // R3A4-01: chốt revision lúc bấm
    applying = true;
    renderPanel("suggestion"); // khóa "Dùng gợi ý" nhìn thấy trong lúc bay
    Promise.resolve()
      .then(() => adapter.aiAccept(dto.suggestion_id))
      .then(() => {
        if (destroyed) return;
        applying = false;
        // R3A4-01: re-check revision TẠI LÚC accept RESOLVE — user gõ trong
        // lúc ghi nhận đang bay -> KHÔNG điền đè; giữ text mới, thẻ stale.
        if (revision !== revisionAtClick) {
          current = { ...current, stale: true };
          renderPanel("suggestion");
          setNote(copy.staleBanner);
          return;
        }
        const suggested = String(dto.suggested_text || textarea.value);
        current = null;
        renderPanel("idle"); // ẩn thẻ TRƯỚC khi dispatch input (tránh re-render thẻ cũ)
        textarea.value = suggested; // textContent/value — CẤM innerHTML (SEC-12)
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        setNote(copy.appliedNote);
      })
      .catch(() => {
        if (destroyed) return;
        applying = false;
        renderPanel("suggestion"); // mở khóa nút — thử lại được
        setNote(copy.acceptFailNote);
      });
  }

  function onDiscard() {
    if (destroyed || !current) return;
    const dto = current.dto;
    Promise.resolve()
      .then(() => adapter.aiDiscard(dto.suggestion_id))
      .then(() => {
        if (destroyed) return;
        current = null;
        renderPanel("idle");
        setNote(copy.discardNote);
      })
      .catch(() => {
        if (destroyed) return;
        setNote(copy.acceptFailNote);
      });
  }

  // ---- aiStatus khi mount (C5: off/lỗi đều trung thực, manual còn nguyên) ----
  Promise.resolve()
    .then(() => adapter.aiStatus())
    .then((status) => {
      if (destroyed) return;
      const enabled = Boolean(status
        && (status.ai_enabled === true || status.enabled === true));
      gateStatus = enabled ? "enabled" : "off";
      cta.disabled = !enabled;
      cta.title = enabled ? copy.ctaOnTitle : copy.ctaOffTitle;
      setNote(enabled ? copy.readyNote : copy.offNote);
    })
    .catch(() => {
      if (destroyed) return;
      gateStatus = "unknown";
      cta.disabled = true;
      cta.title = copy.unknownNote;
      setNote(copy.unknownNote);
    });

  return {
    el: root,
    destroy() {
      destroyed = true;
      textarea.removeEventListener("input", onInput);
      if (activeSheet && activeSheet.isConnected) activeSheet.close();
      activeSheet = null;
    },
  };
}

/** Phân loại lỗi AI trung thực theo kind/status/code (không suy thêm). */
function describeAiError(error, copy) {
  if (error && error.code === "consent_required") return copy.errGeneric;
  if (error && error.status === 429) return copy.errBusy;
  if (error && error.status === 503) return copy.errUnavailable;
  if (error && error.kind === "timeout") return copy.errTimeout;
  if (error && error.kind === "http" && Number(error.status) >= 500) {
    return copy.errUnavailable;
  }
  return copy.errGeneric;
}
