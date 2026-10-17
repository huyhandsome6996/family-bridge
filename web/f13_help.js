/**
 * ============================================================================
 * Family Bridge - Tính năng F13: Trang tìm trợ giúp khẩn cấp (US-039)
 * ============================================================================
 * 
 * RÀNG BUỘC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
 * 1. KHÔNG CẦN ĐĂNG NHẬP:
 *    - Đây là public route phục vụ trợ giúp khẩn cấp.
 *    - Tuyệt đối không kiểm tra token, không phụ thuộc session hay auth guard.
 *    - Không bị chặn bởi bộ đếm ngược 300 giây (5 phút pause).
 * 
 * 2. XÁC MINH DỮ LIỆU:
 *    - CHỈ hiển thị nhãn/icon "Đã xác minh" nếu object trả về từ API có cờ `is_verified: true`.
 *    - Tuyệt đối không tự hardcode mock data giả mạo nhãn xác minh.
 *    - Nếu `is_verified` không phải true (false, null, undefined), hiển thị trạng thái "Chờ xác minh".
 * 
 * 3. NÚT GỌI CHỦ ĐỘNG:
 *    - Hiển thị đầy đủ: Tên đơn vị, phạm vi hỗ trợ, giờ hoạt động.
 *    - Dùng thẻ `<a href="tel:số_điện_thoại">` để người dùng chủ động nhấn gọi trên thiết bị.
 *    - TUYỆT ĐỐI KHÔNG tự động kích hoạt cuộc gọi hay tự động gửi tin nhắn/dữ liệu.
 * ============================================================================
 */

// 1. Cấu hình Endpoint API linh hoạt (hỗ trợ môi trường Dev, Prod và Override runtime)
const DEFAULT_API_URL = "https://family-bridge-api.onrender.com/api/v1/help-contacts";

/**
 * Lấy URL API phù hợp từ cấu hình runtime, biến môi trường Vite hoặc fallback mặc định.
 * @returns {string} URL endpoint danh bạ hỗ trợ
 */
export function getHelpApiUrl() {
  if (typeof window !== "undefined" && window.__HELP_API_URL__) {
    return window.__HELP_API_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_HELP_API_URL) {
      return import.meta.env.VITE_HELP_API_URL;
    }
  } catch {
    // Trường hợp chạy ngoài môi trường bundler (native ESM tĩnh)
  }
  return DEFAULT_API_URL;
}

// 2. Các hàm tiện ích định dạng dữ liệu an toàn & chống XSS
/**
 * Làm sạch chuỗi số điện thoại chỉ giữ lại các ký tự hợp lệ cho giao thức tel: (+ và số).
 * @param {string} phone 
 * @returns {string}
 */
function sanitizePhone(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "");
}

/**
 * Định dạng giờ hoạt động từ API (hỗ trợ cả chuỗi và object cấu trúc).
 * @param {any} hoursData 
 * @returns {string}
 */
function formatOperatingHours(hoursData) {
  if (!hoursData) return "Chưa cập nhật giờ trực";
  if (typeof hoursData === "string") return hoursData;
  if (typeof hoursData === "object") {
    if (hoursData.always) return "Trực 24/7 (Cả tuần & ngày lễ)";
    if (hoursData.start_hour !== undefined && hoursData.end_hour !== undefined) {
      const start = String(hoursData.start_hour).padStart(2, "0");
      const end = String(hoursData.end_hour).padStart(2, "0");
      return `${start}:00 - ${end}:00`;
    }
    if (hoursData.description) return String(hoursData.description);
  }
  return "Theo giờ hành chính";
}

// 3. Render giao diện danh sách
/**
 * Render từng thẻ đầu mối hỗ trợ vào danh sách HTML.
 * Sử dụng API DOM (createElement/textContent) để đảm bảo an toàn tuyệt đối chống XSS.
 * 
 * @param {HTMLElement} container - Phần tử <ul> chứa danh sách
 * @param {Array} contacts - Mảng các đầu mối hỗ trợ từ API
 */
export function renderHelpContacts(container, contacts) {
  container.innerHTML = "";

  contacts.forEach((contact) => {
    // Trích xuất các trường dữ liệu linh hoạt theo contract API
    const name = contact.name || contact.public_name || contact.unit_name || contact.title || "Đầu mối hỗ trợ";
    const scope = contact.scope || contact.support_scope || contact.contact_type || contact.description || "Hỗ trợ học sinh & gia đình";
    const hours = formatOperatingHours(contact.operating_hours || contact.hours || contact.working_hours);
    const rawPhone = contact.phone || contact.phone_number || contact.hotline || "";
    const cleanPhone = sanitizePhone(rawPhone);

    // BẬT CỜ XÁC MINH: Kiểm tra nghiêm ngặt kiểu boolean true
    const isVerified = contact.is_verified === true;

    // Tạo thẻ <li> đại diện cho một đầu mối
    const li = document.createElement("li");
    li.className = "contact-card";

    // Header của thẻ: Tên đơn vị và Huy hiệu xác minh
    const header = document.createElement("div");
    header.className = "contact-card__header";

    const nameEl = document.createElement("h3");
    nameEl.className = "contact-card__name";
    nameEl.textContent = name;
    header.appendChild(nameEl);

    // XÁC MINH DỮ LIỆU: Chỉ gắn nhãn "Đã xác minh" nếu is_verified === true
    const badge = document.createElement("span");
    if (isVerified) {
      badge.className = "badge badge-verified";
      badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Đã xác minh</span>
      `;
    } else {
      badge.className = "badge badge-unverified";
      badge.textContent = "Chờ xác minh";
    }
    header.appendChild(badge);
    li.appendChild(header);

    // Phần chi tiết: Phạm vi hỗ trợ và Giờ hoạt động
    const details = document.createElement("div");
    details.className = "contact-card__details";

    // Dòng phạm vi hỗ trợ
    const scopeRow = document.createElement("div");
    scopeRow.className = "contact-card__row";
    const scopeLabel = document.createElement("span");
    scopeLabel.className = "contact-card__label";
    scopeLabel.textContent = "Phạm vi:";
    const scopeValue = document.createElement("span");
    scopeValue.className = "contact-card__value";
    scopeValue.textContent = scope;
    scopeRow.appendChild(scopeLabel);
    scopeRow.appendChild(scopeValue);
    details.appendChild(scopeRow);

    // Dòng giờ hoạt động
    const hoursRow = document.createElement("div");
    hoursRow.className = "contact-card__row";
    const hoursLabel = document.createElement("span");
    hoursLabel.className = "contact-card__label";
    hoursLabel.textContent = "Giờ trực:";
    const hoursValue = document.createElement("span");
    hoursValue.className = "contact-card__value";
    hoursValue.textContent = hours;
    hoursRow.appendChild(hoursLabel);
    hoursRow.appendChild(hoursValue);
    details.appendChild(hoursRow);

    li.appendChild(details);

    // Nút gọi điện: Thẻ <a href="tel:..."> cho phép người dùng tự chủ động bấm gọi
    const actionWrapper = document.createElement("div");
    actionWrapper.className = "contact-card__action";

    if (cleanPhone) {
      const callLink = document.createElement("a");
      callLink.className = "btn-call";
      callLink.href = `tel:${cleanPhone}`;
      callLink.setAttribute("aria-label", `Gọi đến số ${rawPhone} của ${name}`);
      callLink.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
        </svg>
        <span>Gọi: ${rawPhone}</span>
      `;
      actionWrapper.appendChild(callLink);
    } else {
      const noPhone = document.createElement("p");
      noPhone.className = "no-phone-notice";
      noPhone.textContent = "Đầu mối này chưa cung cấp số điện thoại gọi trực tiếp.";
      actionWrapper.appendChild(noPhone);
    }

    li.appendChild(actionWrapper);
    container.appendChild(li);
  });
}

// 4. Luồng xử lý chính: Fetch API với try/catch và cập nhật trạng thái UI
/**
 * Tải danh sách đầu mối hỗ trợ từ backend và cập nhật UI.
 * Không yêu cầu đăng nhập, không token, xử lý lỗi mạng minh bạch.
 */
export async function loadHelpContacts() {
  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const errorMessageEl = document.getElementById("error-message");
  const emptyEl = document.getElementById("empty-state");
  const contactsListEl = document.getElementById("contacts-list");

  // Thiết lập trạng thái bắt đầu tải
  if (loadingEl) loadingEl.style.display = "flex";
  if (errorEl) errorEl.style.display = "none";
  if (emptyEl) emptyEl.style.display = "none";
  if (contactsListEl) contactsListEl.innerHTML = "";

  const apiUrl = getHelpApiUrl();

  try {
    // Gọi fetch API không gửi kèm Authorization header (Public route)
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Máy chủ phản hồi mã lỗi HTTP: ${response.status} (${response.statusText || "Lỗi không xác định"})`);
    }

    const data = await response.json();

    // Chuẩn hóa dữ liệu trả về (hỗ trợ mảng trực tiếp hoặc các trường bao bọc: contacts, data, results)
    let contacts = [];
    if (Array.isArray(data)) {
      contacts = data;
    } else if (Array.isArray(data.contacts)) {
      contacts = data.contacts;
    } else if (Array.isArray(data.data)) {
      contacts = data.data;
    } else if (Array.isArray(data.results)) {
      contacts = data.results;
    }

    // Xử lý danh sách rỗng
    if (contacts.length === 0) {
      if (emptyEl) emptyEl.style.display = "flex";
    } else {
      if (contactsListEl) {
        renderHelpContacts(contactsListEl, contacts);
      }
    }
  } catch (error) {
    console.error("Lỗi khi tải danh bạ trợ giúp F13:", error);

    if (errorEl) {
      errorEl.style.display = "flex";
      if (errorMessageEl) {
        // Xử lý thông báo thân thiện bằng tiếng Việt, tránh hiển thị lỗi kỹ thuật thô như "Failed to fetch"
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        const isNetworkFailure = error instanceof TypeError || /fetch|network|load failed/i.test(error.message || "");

        if (isOffline || isNetworkFailure) {
          errorMessageEl.textContent = "Không có kết nối mạng hoặc đường truyền gián đoạn. Vui lòng kiểm tra Wi-Fi/4G và nhấn 'Thử lại', hoặc gọi trực tiếp đến Tổng đài 111.";
        } else {
          errorMessageEl.textContent = error.message || "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.";
        }
      }
    }
  } finally {
    // Ẩn trạng thái loading sau khi hoàn tất
    if (loadingEl) {
      loadingEl.style.display = "none";
    }
  }
}

// 5. Khởi tạo khi DOM đã sẵn sàng (chỉ chạy trong môi trường trình duyệt)
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initHelpPage();
    });
  } else {
    // Nếu DOMContentLoaded đã phát xong trước khi script thực thi
    initHelpPage();
  }
}

/**
 * Khởi tạo các sự kiện và tải dữ liệu ban đầu
 */
function initHelpPage() {
  // Gắn sự kiện cho nút thử lại khi gặp lỗi
  const retryBtn = document.getElementById("retry-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      loadHelpContacts();
    });
  }

  // Tự động tải dữ liệu ban đầu
  loadHelpContacts();
}
