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

