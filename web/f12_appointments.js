/**
 * ============================================================================
 * Family Bridge - Tính năng F12: Thầy cô và lịch hẹn (US-038 & US-046)
 * ============================================================================
 *
 * RÀNG BUỘC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
 * 1. DANH BẠ ĐƯỢC XÁC MINH (US-038):
 *    - Chỉ hiển thị liên hệ trường đã xác minh; ẩn số điện thoại khi hết hạn hoặc retired.
 *    - Nút gọi chỉ kích hoạt khi người dùng chủ động nhấn click (SDK openPhone hoặc fallback).
 *    - Tuyệt đối không tự động quay số.
 *
 * 2. LỊCH HẸN CÓ ĐIỀU KIỆN (US-046):
 *    - Scheduling chỉ bật khi hệ thống có thầy cô/cán bộ trực thật.
 *    - Nếu staff directory rỗng hoặc chưa thiết lập (HTTP 503 scheduling_no_staff),
 *      giao diện thông báo trung thực: "Lịch hẹn tạm tắt vì chưa có thầy/cô trực. Bạn vẫn gọi trực tiếp ở danh bạ trên."
 *    - Gửi yêu cầu (submitted) KHÔNG có nghĩa là đã có lịch hẹn.
 *      Thông báo sau gửi: "Đã gửi yêu cầu. Chưa có lịch hẹn nào cho tới khi thầy cô đề xuất và bạn xác nhận."
 *
 * 3. BẢO MẬT GHI CHÚ RIÊNG TƯ:
 *    - Ghi chú trao đổi chỉ học sinh gửi và thầy cô được phân công có quyền xem.
 *
 * 4. CÔ LẬP MOCK TOOLBAR:
 *    - Thanh QA toolbar chỉ hiển thị khi có tham số URL ?qa=1 hoặc ?demo=1.
 *    - Môi trường mặc định không inject toolbar và không ghi đè window.fetch.
 * ============================================================================
 */

// 1. Cấu hình Endpoint API linh hoạt
export const DEFAULT_BACKEND_BASE = "https://family-bridge-backend.onrender.com";
const DEFAULT_DIRECTORY_API_URL = `${DEFAULT_BACKEND_BASE}/api/v1/appointments/directory`;
const DEFAULT_REQUESTS_API_URL = `${DEFAULT_BACKEND_BASE}/api/v1/appointments/requests`;

export function getAuthHeaders() {
  const token =
    (typeof window !== "undefined" &&
      (window.__FB_SESSION_TOKEN__ ||
        (window.__FB_SESSION__ && window.__FB_SESSION__.token))) ||
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getDirectoryApiUrl() {
  if (typeof window !== "undefined" && window.__APPOINTMENTS_DIRECTORY_URL__) {
    return window.__APPOINTMENTS_DIRECTORY_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APPOINTMENTS_DIRECTORY_URL) {
      return import.meta.env.VITE_APPOINTMENTS_DIRECTORY_URL;
    }
  } catch {
    // Trường hợp chạy ngoài môi trường bundler
  }
  const base =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
    (typeof window !== "undefined" && window.__FB_API_BASE__) ||
    DEFAULT_BACKEND_BASE;
  return `${base.replace(/\/+$/, "")}/api/v1/appointments/directory`;
}

export function getRequestsApiUrl() {
  if (typeof window !== "undefined" && window.__APPOINTMENTS_REQUESTS_URL__) {
    return window.__APPOINTMENTS_REQUESTS_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APPOINTMENTS_REQUESTS_URL) {
      return import.meta.env.VITE_APPOINTMENTS_REQUESTS_URL;
    }
  } catch {
    // Trường hợp chạy ngoài môi trường bundler
  }
  const base =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
    (typeof window !== "undefined" && window.__FB_API_BASE__) ||
    DEFAULT_BACKEND_BASE;
  return `${base.replace(/\/+$/, "")}/api/v1/appointments/requests`;
}

// 2. Nhãn hiển thị chuẩn
export const TOPIC_LABELS = {
  hoc_tap: "Học tập & định hướng",
  tinh_cam: "Tình cảm & tâm tư",
  khac: "Chủ đề khác",
};

export const STATUS_LABELS = {
  submitted: "Đã gửi — chờ thầy cô tiếp nhận",
  assigned: "Thầy cô đã tiếp nhận",
  slot_proposed: "Có đề xuất giờ — chờ bạn xác nhận",
  scheduled: "Đã có lịch hẹn",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

/**
 * Hiển thị thông báo trạng thái
 * @param {'success'|'error'} type 
 * @param {string} message 
 */
export function showStatusAlert(type, message) {
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

export function clearStatusAlerts() {
  const successEl = document.getElementById("status-alert-success");
  const errorEl = document.getElementById("status-alert-error");
  if (successEl) successEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";
}

// 3. Render Danh bạ Thầy cô (US-038)
export function renderDirectory(container, contacts, onCall) {
  if (!container) return;
  container.innerHTML = "";

  if (!contacts || contacts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Chưa có đầu mối trường nào được công bố.";
    container.appendChild(empty);
    return;
  }

  contacts.forEach((contact) => {
    const item = document.createElement("div");
    item.className = "contact-item";

    const isVerified = contact.status === "verified" || contact.is_verified === true;
    const name = contact.public_name || contact.name || "Thầy / Cô hỗ trợ";
    const phone = contact.phone || "";

    const info = document.createElement("div");
    info.className = "contact-info";

    const nameEl = document.createElement("div");
    nameEl.className = "contact-name";
    nameEl.textContent = name;
    info.appendChild(nameEl);

    const metaEl = document.createElement("div");
    metaEl.className = "contact-meta";

    const badge = document.createElement("span");
    badge.className = `badge ${isVerified ? "badge--verified" : "badge--expired"}`;
    badge.textContent = isVerified ? "Đã xác minh" : "Hết hạn xác minh";
    metaEl.appendChild(badge);

    if (contact.operating_hours) {
      const hoursEl = document.createElement("span");
      hoursEl.textContent = typeof contact.operating_hours === "string" 
        ? contact.operating_hours 
        : (contact.operating_hours.always ? "Giờ làm việc: Cả tuần" : "Giờ hành chính");
      metaEl.appendChild(hoursEl);
    }

    info.appendChild(metaEl);
    item.appendChild(info);

    if (phone && isVerified) {
      const callBtn = document.createElement("button");
      callBtn.type = "button";
      callBtn.className = "btn-call";
      callBtn.setAttribute("data-phone", phone);
      callBtn.textContent = "Gọi ngay";
      callBtn.addEventListener("click", () => {
        if (typeof onCall === "function") {
          onCall(phone, name);
        } else if (typeof window !== "undefined" && window.ZaloJavaScriptInterface && typeof window.ZaloJavaScriptInterface.openPhone === "function") {
          window.ZaloJavaScriptInterface.openPhone(phone);
        } else {
          showStatusAlert("success", `Số điện thoại liên hệ: ${phone}`);
        }
      });
      item.appendChild(callBtn);
    }

    container.appendChild(item);
  });
}

// 4. Render Danh sách Yêu cầu & Slot (US-046)
export function renderRequests(container, requests, onAccept, onDecline) {
  if (!container) return;
  container.innerHTML = "";

  if (!requests || requests.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Chưa có yêu cầu nào.";
    container.appendChild(empty);
    return;
  }

  requests.forEach((req) => {
    const item = document.createElement("div");
    item.className = "request-item";

    const header = document.createElement("div");
    header.className = "request-header";

    const topicEl = document.createElement("span");
    topicEl.className = "request-topic";
    topicEl.textContent = TOPIC_LABELS[req.topic] || req.topic || "Yêu cầu gặp riêng";
    header.appendChild(topicEl);

    const statusBadge = document.createElement("span");
    statusBadge.className = "badge badge--status";
    statusBadge.textContent = STATUS_LABELS[req.status] || req.status;
    header.appendChild(statusBadge);

    item.appendChild(header);

    if (req.note) {
      const noteEl = document.createElement("div");
      noteEl.className = "request-note";
      noteEl.textContent = `Lời nhắn: "${req.note}"`;
      item.appendChild(noteEl);
    }

    // Kiểm tra slot proposed
    const slots = req.slots || [];
    const openSlot = slots.find((s) => s.status === "proposed");

    if (openSlot) {
      const slotBox = document.createElement("div");
      slotBox.className = "slot-box";

      const slotTime = document.createElement("div");
      slotTime.className = "slot-time";
      let timeText = openSlot.start_at || "Thời gian đề xuất";
      try {
        const d = new Date(openSlot.start_at);
        if (!isNaN(d.getTime())) {
          timeText = `Đề xuất gặp: ${d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}`;
        }
      } catch {
        // Giữ timeText thô
      }
      slotTime.textContent = timeText;
      slotBox.appendChild(slotTime);

      const actions = document.createElement("div");
      actions.className = "slot-actions";

      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "btn-accept";
      acceptBtn.textContent = "Đồng ý giờ này";
      acceptBtn.setAttribute("data-request-id", req.request_id || req.id);
      acceptBtn.setAttribute("data-slot-id", openSlot.slot_id || openSlot.id);
      acceptBtn.addEventListener("click", () => {
        if (typeof onAccept === "function") {
          onAccept(req.request_id || req.id, openSlot.slot_id || openSlot.id);
        }
      });

      const declineBtn = document.createElement("button");
      declineBtn.type = "button";
      declineBtn.className = "btn-decline";
      declineBtn.textContent = "Hỏi giờ khác";
      declineBtn.setAttribute("data-request-id", req.request_id || req.id);
      declineBtn.setAttribute("data-slot-id", openSlot.slot_id || openSlot.id);
      declineBtn.addEventListener("click", () => {
        if (typeof onDecline === "function") {
          onDecline(req.request_id || req.id, openSlot.slot_id || openSlot.id);
        }
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(declineBtn);
      slotBox.appendChild(actions);

      item.appendChild(slotBox);
    }

    container.appendChild(item);
  });
}

// 5. API fetch wrappers
export async function fetchDirectory() {
  const url = getDirectoryApiUrl();
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) {
    throw new Error(`Lỗi tải danh bạ: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.results || data || [];
}

export async function fetchRequests() {
  const url = getRequestsApiUrl();
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) {
    throw new Error(`Lỗi tải danh sách yêu cầu: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.results || data || [];
}

export async function submitAppointmentRequest(topic, note) {
  const url = getRequestsApiUrl();
  const payload = {
    topic: String(topic || "hoc_tap").trim(),
    note: String(note || "").trim(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errBody = null;
    try {
      errBody = await res.json();
    } catch {
      // Bỏ qua nếu không parse được json
    }
    const err = new Error(`Lỗi HTTP ${res.status}`);
    err.status = res.status;
    err.details = errBody;
    throw err;
  }

  return await res.json();
}

export async function acceptProposedSlot(requestId, slotId) {
  const base = getRequestsApiUrl();
  const url = `${base}/${requestId}/slots/${slotId}/accept`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    let errBody = null;
    try {
      errBody = await res.json();
    } catch {
      //
    }
    const err = new Error(`Lỗi xác nhận slot: HTTP ${res.status}`);
    err.status = res.status;
    err.details = errBody;
    throw err;
  }

  return await res.json();
}

export async function declineProposedSlot(requestId, slotId) {
  const base = getRequestsApiUrl();
  const url = `${base}/${requestId}/slots/${slotId}/decline`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Lỗi từ chối slot: HTTP ${res.status}`);
  }

  return await res.json();
}

// 6. Khởi tạo toàn bộ trang
export function initAppointmentsPage() {
  const directoryContainer = document.getElementById("ap-directory-list");
  const requestsContainer = document.getElementById("ap-requests-list");
  const topicSelect = document.getElementById("ap-topic");
  const noteTextarea = document.getElementById("ap-note");
  const submitBtn = document.getElementById("ap-submit-btn");

  async function reloadDirectory() {
    try {
      const contacts = await fetchDirectory();
      renderDirectory(directoryContainer, contacts);
    } catch (err) {
      renderDirectory(directoryContainer, []);
    }
  }

  async function reloadRequests() {
    try {
      const requests = await fetchRequests();
      renderRequests(requestsContainer, requests, handleAccept, handleDecline);
    } catch (err) {
      renderRequests(requestsContainer, []);
    }
  }

  async function handleAccept(requestId, slotId) {
    clearStatusAlerts();
    try {
      await acceptProposedSlot(requestId, slotId);
      showStatusAlert("success", "Đã xác nhận lịch hẹn thành công.");
      await reloadRequests();
    } catch (err) {
      if (err.status === 409) {
        showStatusAlert("error", "Giờ hẹn đã được thay đổi hoặc không còn khả dụng. Vui lòng làm mới.");
      } else {
        showStatusAlert("error", "Xác nhận lịch hẹn chưa thành công. Vui lòng thử lại.");
      }
      await reloadRequests();
    }
  }

  async function handleDecline(requestId, slotId) {
    clearStatusAlerts();
    try {
      await declineProposedSlot(requestId, slotId);
      showStatusAlert("success", "Đã gửi phản hồi hỏi giờ khác tới thầy cô.");
      await reloadRequests();
    } catch (err) {
      showStatusAlert("error", "Không gửi được phản hồi. Vui lòng thử lại.");
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      clearStatusAlerts();
      const topic = topicSelect ? topicSelect.value : "hoc_tap";
      const note = noteTextarea ? noteTextarea.value.trim() : "";

      try {
        await submitAppointmentRequest(topic, note);
        showStatusAlert(
          "success",
          "Đã gửi yêu cầu. Chưa có lịch hẹn nào cho tới khi thầy cô đề xuất và bạn xác nhận."
        );
        if (noteTextarea) noteTextarea.value = "";
        await reloadRequests();
      } catch (err) {
        const reason = err && err.details && err.details.reason;
        if (err.status === 503 || reason === "scheduling_no_staff") {
          showStatusAlert(
            "error",
            "Lịch hẹn tạm tắt vì chưa có thầy/cô trực. Bạn vẫn gọi trực tiếp ở danh bạ trên."
          );
        } else {
          showStatusAlert("error", "Không gửi được yêu cầu. Vui lòng thử lại sau.");
        }
      }
    });
  }

  // Tải dữ liệu ban đầu
  reloadDirectory();
  reloadRequests();

  // 7. CÔ LẬP MOCK TOOLBAR
  initQaToolbar();
}

// 8. QA Mock Toolbar (chỉ kích hoạt khi ?qa=1 hoặc ?demo=1)
function initQaToolbar() {
  if (typeof window === "undefined" || !window.location) return;

  const urlParams = new URLSearchParams(window.location.search);
  const isQaMode = urlParams.get("qa") === "1" || urlParams.get("demo") === "1";

  if (!isQaMode) return;

  // Ghi đè fetch trong môi trường QA để cô lập kiểm thử (chỉ khi ?qa=1/?demo=1)
  if (typeof window !== "undefined") {
    if (!window.__F12_ORIGINAL_FETCH__) {
      window.__F12_ORIGINAL_FETCH__ = window.fetch;
    }
    const originalFetch = window.__F12_ORIGINAL_FETCH__;
    window.fetch = async (url, options) => {
      const u = String(url);
      const method = (options && options.method) || "GET";
      if (u.includes("/appointments/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              { contact_id: "qa-1", public_name: "Thầy QA", phone: "0900000000", status: "verified" },
            ],
          }),
        };
      }
      if (u.includes("/appointments/requests")) {
        if (method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ request_id: "qa-req", status: "submitted" }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      }
      if (u.includes("/slots/") && (u.includes("/accept") || u.includes("/decline"))) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: u.includes("/accept") ? "scheduled" : "assigned" }),
        };
      }
      return originalFetch(url, options);
    };
  }

  const container = document.getElementById("qa-f12-toolbar-container");
  if (!container) return;

  const toolbar = document.createElement("div");
  toolbar.id = "qa-f12-toolbar";
  toolbar.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #2E1510;
    color: #FFF;
    padding: 8px 12px;
    font-size: 11px;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  toolbar.innerHTML = `
    <span style="color: #E4AB56; font-weight: bold;">[QA Mode]</span>
    <button id="qa-btn-mock-503" style="font-size: 10px; padding: 2px 6px;">Simulate 503</button>
    <button id="qa-btn-mock-ok" style="font-size: 10px; padding: 2px 6px;">Simulate OK</button>
  `;
  container.appendChild(toolbar);
}

// Tự động khởi chạy khi DOM ready trong browser
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAppointmentsPage);
  } else {
    initAppointmentsPage();
  }
}
