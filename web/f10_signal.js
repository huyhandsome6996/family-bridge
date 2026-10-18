/**
 * ============================================================================
 * Family Bridge - Tính năng F10: Tín hiệu Con cần được lắng nghe (US-032)
 * ============================================================================
 * 
 * RÀNG BUỘC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
 * 1. BƯỚC XÁC NHẬN CHỦ ĐỘNG:
 *    - Khi bấm gửi trên form, KHÔNG gọi API ngay lập tức.
 *    - Hiển thị Modal/Hộp thoại hỏi rõ: "Bạn có chắc chắn muốn gửi tín hiệu này cho [Người nhận]?".
 *    - Chỉ khi người dùng chọn ĐỒNG Ý (Confirm) mới kích hoạt gửi API.
 * 
 * 2. KHÔNG GẮN KÈM DỮ LIỆU NGOÀI (BẢO VỆ QUYỀN RIÊNG TƯ):
 *    - Payload CHỈ chứa dữ liệu tối thiểu user tự chọn trên form: { recipient, need, note }.
 *    - Tuyệt đối không tự động thu thập lịch sử tâm trạng, nhật ký, hay dữ liệu bên ngoài.
 * 
 * 3. GIAO DIỆN THÂN THIỆN:
 *    - Mang tính kết nối gia đình hàng ngày, màu sắc dịu ấm, không dùng màu đỏ SOS báo động.
 * ============================================================================
 */

// 1. Cấu hình Endpoint API linh hoạt
const DEFAULT_SIGNAL_API_URL = "https://family-bridge-api.onrender.com/api/v1/signals/send";

/**
 * Lấy URL API phù hợp từ cấu hình runtime, biến môi trường Vite hoặc fallback mặc định.
 * @returns {string} URL endpoint gửi tín hiệu
 */
export function getSignalApiUrl() {
  if (typeof window !== "undefined" && window.__SIGNAL_API_URL__) {
    return window.__SIGNAL_API_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SIGNAL_API_URL) {
      return import.meta.env.VITE_SIGNAL_API_URL;
    }
  } catch {
    // Trường hợp chạy native ESM trong browser
  }
  return DEFAULT_SIGNAL_API_URL;
}

// 2. Các hàm tiện ích ánh xạ nhãn hiển thị
export const NEED_LABELS = {
  muon_tro_chuyen: "Muốn trò chuyện",
  muon_duoc_o_ben: "Muốn được ở bên",
  muon_hen_gio: "Muốn hẹn thời gian",
};

/**
 * Hiển thị thông báo trạng thái lên UI
 * @param {'success'|'error'} type 
 * @param {string} message 
 */
function showStatusAlert(type, message) {
  const successEl = document.getElementById("status-alert-success");
  const errorEl = document.getElementById("status-alert-error");
  const successText = document.getElementById("status-success-text");
  const errorText = document.getElementById("status-error-text");

  if (successEl) successEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";

  if (type === "success" && successEl && successText) {
    successText.textContent = message;
    successEl.style.display = "flex";
  } else if (type === "error" && errorEl && errorText) {
    errorText.textContent = message;
    errorEl.style.display = "flex";
  }
}

/**
 * Ẩn các thông báo trạng thái
 */
function clearStatusAlerts() {
  const successEl = document.getElementById("status-alert-success");
  const errorEl = document.getElementById("status-alert-error");
  if (successEl) successEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";
}

// 3. Hàm gọi API gửi tín hiệu
/**
 * Gửi dữ liệu tín hiệu lên máy chủ backend.
 * Payload tối thiểu: { need, recipient_id }. Không gửi note/recipient chữ thô.
 *
 * @param {Object} signalData - { recipient, recipientId/recipient_id, need }
 * @returns {Promise<any>}
 */
export async function sendSignalApi(signalData) {
  const apiUrl = getSignalApiUrl();

  const recipientId = signalData.recipientId || signalData.recipient_id || "";
  const payload = {
    need: String(signalData.need || "").trim(),
    recipient_id: String(recipientId).trim(),
  };

  const idempotencyKey = `signal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Máy chủ phản hồi mã lỗi HTTP: ${response.status} (${response.statusText || "Lỗi gửi"})`);
  }

  return await response.json();
}

// 4. Quản lý Modal xác nhận chủ động
let pendingSignalData = null;

/**
 * Mở modal xác nhận trước khi gửi tín hiệu
 * @param {Object} data - Dữ liệu form đã thu thập
 */
function openConfirmModal(data) {
  pendingSignalData = data;
  const modal = document.getElementById("confirm-modal");
  const modalMessage = document.getElementById("modal-message");

  if (modalMessage) {
    modalMessage.textContent = `Bạn có chắc chắn muốn gửi tín hiệu này cho ${data.recipient}?`;
  }

  if (modal) {
    modal.style.display = "flex";
  }
}

/**
 * Đóng modal xác nhận
 */
function closeConfirmModal() {
  pendingSignalData = null;
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

// 5. Luồng xử lý submit form
/**
 * Thu thập dữ liệu từ form và kích hoạt bước xác nhận
 * @param {HTMLFormElement} form 
 */
function handleFormSubmit(form) {
  clearStatusAlerts();

  const recipientInput = form.querySelector('input[name="recipient"]:checked');
  const needInput = form.querySelector('input[name="need"]:checked');

  const recipient = recipientInput ? recipientInput.value : "Người thân";
  const recipientId = recipientInput ? (recipientInput.dataset.recipientId || "") : "";
  const need = needInput ? needInput.value : "muon_tro_chuyen";

  const signalData = { recipient, recipientId, need };

  // BƯỚC XÁC NHẬN: Không gọi API ngay, mở Modal xác nhận
  openConfirmModal(signalData);
}

/**
 * Thực thi gọi API sau khi người dùng đã xác nhận YES
 */
async function executeSignalSend() {
  if (!pendingSignalData) return;

  const dataToSend = { ...pendingSignalData };
  closeConfirmModal();

  const submitBtn = document.getElementById("btn-submit-signal");
  const originalBtnText = submitBtn ? submitBtn.innerHTML : "Gửi tín hiệu";

  // Đặt trạng thái Loading cho nút gửi
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.3"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>Đang gửi tín hiệu...</span>
    `;
  }

  try {
    await sendSignalApi(dataToSend);

    // Báo thành công (thông báo trung thực)
    showStatusAlert(
      "success",
      "Đã gửi tín hiệu. Người thân sẽ thấy trong Hộp thư — không cam kết có phản hồi tức thì."
    );

    // Reset ô ghi chú sau khi gửi thành công
    const noteInput = document.getElementById("signal-note");
    if (noteInput) noteInput.value = "";
  } catch (error) {
    console.error("Lỗi khi gửi tín hiệu F10:", error);

    // Báo lỗi thân thiện bằng tiếng Việt
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const isNetworkError = error instanceof TypeError || /fetch|network|load failed/i.test(error.message || "");

    if (isOffline || isNetworkError) {
      showStatusAlert(
        "error",
        "Không có kết nối mạng hoặc đường truyền gián đoạn. Vui lòng kiểm tra Wi-Fi/4G và gửi lại."
      );
    } else {
      showStatusAlert(
        "error",
        error.message || "Máy chủ đang bận, chưa thể gửi tín hiệu lúc này. Vui lòng thử lại sau."
      );
    }
  } finally {
    // Phục hồi trạng thái nút gửi
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

// 6. Khởi tạo sự kiện khi DOM sẵn sàng
export function initSignalPage() {
  const form = document.getElementById("signal-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleFormSubmit(form);
    });
  }

  // Nút hủy trong Modal xác nhận
  const btnCancel = document.getElementById("btn-modal-cancel");
  if (btnCancel) {
    btnCancel.addEventListener("click", closeConfirmModal);
  }

  // Nút xác nhận gửi trong Modal
  const btnConfirm = document.getElementById("btn-modal-confirm");
  if (btnConfirm) {
    btnConfirm.addEventListener("click", executeSignalSend);
  }

  // Đóng modal khi bấm ra ngoài backdrop
  const modalBackdrop = document.getElementById("confirm-modal");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeConfirmModal();
      }
    });
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSignalPage);
  } else {
    initSignalPage();
  }
}

// ============================================================================
// [DEV/QA TEST ONLY] MOCK FETCH TOOLBAR CHO F10
// Thanh công cụ gồm 2 nút bấm nổi để kiểm thử:
// 1. Case 1 (Success POST): Giả lập delay 1s quan sát spinner loading -> trả về 200
// 2. Case 2 (Network Error): Giả lập mất kết nối mạng -> quan sát bắt lỗi & phục hồi nút
// ============================================================================
const isF10QaMode = (typeof window !== "undefined")
  && (new URLSearchParams(window.location.search).get("qa") === "1"
      || new URLSearchParams(window.location.search).get("demo") === "1");

if (isF10QaMode && typeof window !== "undefined" && typeof document !== "undefined") {
  const setupF10MockToolbar = () => {
    if (document.getElementById("qa-f10-toolbar")) return;

    let mockMode = "success"; // "success" hoặc "error"

    // Tạo thanh công cụ nổi
    const bar = document.createElement("div");
    bar.id = "qa-f10-toolbar";
    bar.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 15, 10, 0.95);
      border: 2px solid #E4AB56;
      color: #fff;
      padding: 10px 16px;
      border-radius: 30px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      z-index: 999999;
      display: flex;
      gap: 10px;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      white-space: nowrap;
    `;

    bar.innerHTML = `
      <span style="font-weight: 700; color: #E4AB56; display: flex; align-items: center; gap: 4px;">
        🧪 <span>QA F10 Mock:</span>
      </span>
      <button id="qa-f10-btn-success" type="button" style="cursor: pointer; padding: 6px 14px; border: 2px solid #fff; border-radius: 16px; background: #166534; color: #fff; font-weight: 600; font-size: 12px;">
        🟢 Chế độ: Thành công (Delay 1s)
      </button>
      <button id="qa-f10-btn-error" type="button" style="cursor: pointer; padding: 6px 14px; border: 1px solid transparent; border-radius: 16px; background: #56423E; color: #fff; font-weight: 600; font-size: 12px;">
        🔴 Chế độ: Mất kết nối
      </button>
    `;

    document.body.appendChild(bar);

    const btnSuccess = document.getElementById("qa-f10-btn-success");
    const btnError = document.getElementById("qa-f10-btn-error");

    // Chuyển sang kịch bản Success
    btnSuccess?.addEventListener("click", () => {
      mockMode = "success";
      btnSuccess.style.background = "#166534";
      btnSuccess.style.border = "2px solid #fff";
      if (btnError) {
        btnError.style.background = "#56423E";
        btnError.style.border = "1px solid transparent";
      }
      console.log("[QA-F10] Đã chọn kịch bản: Success (Delay 1s)");
    });

    // Chuyển sang kịch bản Network Error
    btnError?.addEventListener("click", () => {
      mockMode = "error";
      btnError.style.background = "#B91C1C";
      btnError.style.border = "2px solid #fff";
      if (btnSuccess) {
        btnSuccess.style.background = "#56423E";
        btnSuccess.style.border = "1px solid transparent";
      }
      console.log("[QA-F10] Đã chọn kịch bản: Network Error");
    });

    // Ghi đè window.fetch chỉ chặn POST gửi tín hiệu
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (options && options.method === "POST" && String(url).includes("/signals")) {
        if (mockMode === "success") {
          // Case 1: Giả lập delay 1000ms để kiểm tra hiệu ứng Loading
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: "sent",
              message: "Tín hiệu đã được máy chủ tiếp nhận thành công",
            }),
          };
        } else {
          // Case 2: Giả lập delay ngắn rồi reject lỗi mạng
          await new Promise((resolve) => setTimeout(resolve, 400));
          throw new TypeError("Mất kết nối mạng (Failed to fetch)");
        }
      }
      return originalFetch(url, options);
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupF10MockToolbar);
  } else {
    setupF10MockToolbar();
  }
}

