/**
 * ============================================================================
 * Family Bridge - Tính năng F09: Hoạt động kết nối & Bài học ngắn (US-037)
 * ============================================================================
 * 
 * RÀNG BUỘC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
 * 1. XEM TRƯỚC LỜI MỜI (PREVIEW BEFORE POST):
 *    - Khi bấm "Mời tham gia", BẮT BUỘC mở Modal "Xem trước lời mời".
 *    - Hiển thị đầy đủ tên hoạt động, thời lượng dự kiến, chọn người nhận.
 *    - CHỈ KHI người dùng bấm "Xác nhận gửi" trên Modal mới kích hoạt gọi API POST.
 * 
 * 2. BẮT LỖI XUNG ĐỘT PHIÊN BẢN (HTTP 409 CONFLICT):
 *    - Khi gửi lời mời, nếu máy chủ trả về HTTP 409 (hoặc mã lỗi xung đột phiên bản),
 *      tuyệt đối KHÔNG âm thầm bỏ qua.
 *    - Phải kích hoạt Modal cảnh báo: "Nội dung này đã có bản cập nhật mới. Vui lòng tải lại trang để xem bản mới nhất."
 * 
 * 3. ĐỌC LÀ CHỈ ĐỌC (READ-ONLY MICRO LESSONS):
 *    - Các thẻ "Viên nang tâm lý 60 giây" hoàn toàn là nội dung văn bản tĩnh để đọc.
 *    - Tuyệt đối KHÔNG gán sự kiện tự động gọi API, không gửi tin nhắn ngầm khi mở xem.
 * ============================================================================
 */

// 1. Cấu hình Endpoint API linh hoạt
const DEFAULT_ACTIVITIES_API_URL = "https://family-bridge-api.onrender.com/api/v1/activities";
const DEFAULT_INVITE_API_URL = "https://family-bridge-api.onrender.com/api/v1/activities/invite";

export function getActivitiesApiUrl() {
  if (typeof window !== "undefined" && window.__ACTIVITIES_API_URL__) {
    return window.__ACTIVITIES_API_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_ACTIVITIES_API_URL) {
      return import.meta.env.VITE_ACTIVITIES_API_URL;
    }
  } catch {
    // Native ESM browser fallback
  }
  return DEFAULT_ACTIVITIES_API_URL;
}

export function getInviteApiUrl() {
  if (typeof window !== "undefined" && window.__INVITE_API_URL__) {
    return window.__INVITE_API_URL__;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_INVITE_API_URL) {
      return import.meta.env.VITE_INVITE_API_URL;
    }
  } catch {
    // Native ESM browser fallback
  }
  return DEFAULT_INVITE_API_URL;
}

// 2. Dữ liệu mặc định chuẩn bị sẵn (Fallback) khi chưa có mạng hoặc đang chờ API backend
const DEFAULT_CATALOG = [
  // Nhóm 1: Hoạt động chung (kind: "activity")
  {
    content_key: "act_chat_5m",
    kind: "activity",
    revision: 1,
    title: "Trò chuyện 5 phút không điện thoại",
    minutes: 5,
    body: "Cùng ngồi xuống nhâm nhi một tách trà hoặc ly nước, không cầm điện thoại, chia sẻ một điều thú vị đã xảy ra trong ngày.",
  },
  {
    content_key: "act_walk_15m",
    kind: "activity",
    revision: 1,
    title: "Đi dạo cùng nhau 15 phút",
    minutes: 15,
    body: "Đi dạo quanh sân nhà, công viên hoặc ngõ xóm trong không khí mát mẻ, lắng nghe tiếng bước chân và những câu chuyện nhỏ.",
  },
  {
    content_key: "act_cook_dinner",
    kind: "activity",
    revision: 1,
    title: "Cùng chuẩn bị bữa cơm gia đình",
    minutes: 20,
    body: "Mỗi người phụ một tay: nhặt rau, chuẩn bị chén đũa hoặc xào một món ăn quen thuộc trong sự ấm cúng.",
  },

  // Nhóm 2: Viên nang tâm lý 60 giây (kind: "micro_lesson") — CHỈ ĐỂ ĐỌC
  {
    content_key: "les_listen_silence",
    kind: "micro_lesson",
    revision: 1,
    title: "Lắng nghe không phán xét",
    minutes: 1,
    body: "Khi con hoặc cha mẹ đang chia sẻ một bức xúc, đôi khi người đối diện không cần lời khuyên ngay tức thì. Điều họ cần nhất là cảm giác được lắng nghe trọn vẹn và công nhận cảm xúc.",
  },
  {
    content_key: "les_pause_60s",
    kind: "micro_lesson",
    revision: 1,
    title: "Khoảng dừng 60 giây khi căng thẳng",
    minutes: 1,
    body: "Trước khi phản ứng hay tranh luận một vấn đề nhạy cảm, hãy hít thở sâu 3 nhịp trong 60 giây. Khoảng lặng này giúp não bộ chuyển từ chế độ tự vệ sang chế độ kết nối thấu cảm.",
  },
  {
    content_key: "les_recognize_effort",
    kind: "micro_lesson",
    revision: 1,
    title: "Ghi nhận sự nỗ lực",
    minutes: 1,
    body: "Thay vì chỉ tập trung vào kết quả điểm số hay công việc, hãy dành lời khen ngợi cho sự kiên trì và cố gắng. Cảm giác được nhìn nhận là nguồn năng lượng nuôi dưỡng lòng tự tin lớn nhất.",
  },
];

// 3. Quản lý trạng thái giao diện & phản hồi
let currentActiveTab = "activities"; // "activities" hoặc "lessons"
let currentTargetActivity = null;    // Hoạt động đang mở Modal xem trước

/**
 * Hiển thị thanh thông báo phản hồi (Feedback Alert)
 * @param {'success'|'error'|'conflict'} type 
 * @param {string} message 
 */
function showFeedbackAlert(type, message) {
  const alertEl = document.getElementById("feedback-alert");
  const iconEl = document.getElementById("feedback-icon");
  const textEl = document.getElementById("feedback-text");
  if (!alertEl || !textEl) return;

  alertEl.className = `feedback-alert feedback-alert--${type}`;
  if (iconEl) {
    iconEl.textContent = type === "success" ? "✓" : (type === "conflict" ? "⚠️" : "⚠");
  }
  textEl.textContent = message;
  alertEl.style.display = "flex";

  // Tự động ẩn sau 5 giây nếu là thông báo thành công
  if (type === "success") {
    setTimeout(() => {
      alertEl.style.display = "none";
    }, 5000);
  }
}

/**
 * Hiển thị Modal thông báo xung đột phiên bản (HTTP 409)
 * @param {string} message 
 */
export function showConflictModal(message) {
  const modal = document.getElementById("conflict-modal");
  const msgEl = document.getElementById("modal-conflict-message");
  if (msgEl) {
    msgEl.textContent = message || "Nội dung này đã có bản cập nhật mới. Vui lòng tải lại trang để xem bản mới nhất.";
  }
  if (modal) {
    modal.style.display = "flex";
  }
}

/**
 * Đóng Modal xung đột phiên bản
 */
function closeConflictModal() {
  const modal = document.getElementById("conflict-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

// 4. Render danh sách Hoạt động & Viên nang 60s
/**
 * Render danh sách Hoạt động chung (có nút Mời tham gia)
 * @param {Array} activities 
 */
export function renderActivities(activities) {
  const listEl = document.getElementById("activities-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!activities || activities.length === 0) {
    const li = document.createElement("li");
    li.className = "activity-card";
    li.textContent = "Chưa có hoạt động nào trong danh mục.";
    listEl.appendChild(li);
    return;
  }

  activities.forEach((act) => {
    const li = document.createElement("li");
    li.className = "activity-card";

    // Header thẻ
    const header = document.createElement("div");
    header.className = "activity-card__header";

    const title = document.createElement("h3");
    title.className = "activity-card__title";
    title.textContent = act.title || "Hoạt động chung";
    header.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "badge-duration";
    badge.textContent = `⏱ ${act.minutes || 5} phút`;
    header.appendChild(badge);
    li.appendChild(header);

    // Mô tả
    const desc = document.createElement("p");
    desc.className = "activity-card__desc";
    desc.textContent = act.body || "";
    li.appendChild(desc);

    // Nút bấm Mời tham gia (Mở Preview Modal)
    const actions = document.createElement("div");
    actions.className = "activity-card__actions";

    const inviteBtn = document.createElement("button");
    inviteBtn.type = "button";
    inviteBtn.className = "btn-invite";
    inviteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <line x1="19" y1="8" x2="19" y2="14"></line>
        <line x1="22" y1="11" x2="16" y2="11"></line>
      </svg>
      <span>Mời tham gia</span>
    `;

    // RÀNG BUỘC: Khi bấm, BẮT BUỘC mở Modal xem trước, không gọi POST ngay
    inviteBtn.addEventListener("click", () => {
      openInvitePreview(act);
    });

    actions.appendChild(inviteBtn);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

/**
 * Render danh sách Viên nang tâm lý 60 giây
 * RÀNG BUỘC CỐT LÕI: ĐỌC LÀ CHỈ ĐỌC, tuyệt đối KHÔNG có nút gửi hay gọi API tự động
 * @param {Array} lessons 
 */
export function renderLessons(lessons) {
  const listEl = document.getElementById("lessons-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!lessons || lessons.length === 0) {
    const li = document.createElement("li");
    li.className = "lesson-card";
    li.textContent = "Chưa có bài học 60 giây nào.";
    listEl.appendChild(li);
    return;
  }

  lessons.forEach((les) => {
    const li = document.createElement("li");
    li.className = "lesson-card";

    // Header bài học
    const header = document.createElement("div");
    header.className = "lesson-card__header";

    const title = document.createElement("h3");
    title.className = "lesson-card__title";
    title.textContent = les.title || "Bài học ngắn";
    header.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "badge-capsule";
    badge.textContent = "📖 Đọc 60 giây";
    header.appendChild(badge);
    li.appendChild(header);

    // Nội dung đọc (Thuần Text, an toàn)
    const body = document.createElement("div");
    body.className = "lesson-card__body";
    body.textContent = les.body || "";
    li.appendChild(body);

    // Chú thích chỉ đọc
    const footer = document.createElement("div");
    footer.className = "lesson-card__footer";
    footer.textContent = "Dành riêng cho bạn nghiền ngẫm • Không gửi đi đâu";
    li.appendChild(footer);

    listEl.appendChild(li);
  });
}

// 5. Quản lý Modal Xem trước lời mời
/**
 * Mở modal xem trước lời mời hoạt động
 * @param {Object} activity 
 */
function openInvitePreview(activity) {
  currentTargetActivity = activity;

  const modal = document.getElementById("invite-preview-modal");
  const titleEl = document.getElementById("preview-act-title");
  const durationEl = document.getElementById("preview-act-duration");

  if (titleEl) titleEl.textContent = activity.title || "Hoạt động chung";
  if (durationEl) durationEl.textContent = `${activity.minutes || 5} phút`;

  if (modal) {
    modal.style.display = "flex";
  }
}

/**
 * Đóng modal xem trước lời mời
 */
function closeInvitePreview() {
  currentTargetActivity = null;
  const modal = document.getElementById("invite-preview-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

// 6. Xử lý gửi lời mời qua POST API
/**
 * Gửi lời mời tham gia hoạt động lên backend.
 * Bắt buộc xử lý lỗi HTTP 409 Conflict (Xung đột phiên bản).
 */
export async function sendActivityInvite() {
  if (!currentTargetActivity) return;

  const recipientSelect = document.getElementById("invite-recipient-select");
  const recipient = recipientSelect ? recipientSelect.value : "Người thân";
  const confirmBtn = document.getElementById("btn-confirm-invite");
  const originalBtnText = confirmBtn ? confirmBtn.innerHTML : "Xác nhận gửi";

  const payload = {
    content_key: String(currentTargetActivity.content_key || "").trim(),
    content_revision: Number(currentTargetActivity.revision || 1),
    recipient: recipient,
    title: currentTargetActivity.title,
    minutes: currentTargetActivity.minutes,
  };

  // Đặt trạng thái Loading cho nút xác nhận
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.3"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>Đang gửi...</span>
    `;
  }

  const apiUrl = getInviteApiUrl();

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // RÀNG BUỘC CỐT LÕI: Bắt rõ HTTP Status 409 (Conflict) hoặc mã lỗi xung đột phiên bản
    if (response.status === 409) {
      closeInvitePreview();
      showConflictModal("Nội dung này đã có bản cập nhật mới. Vui lòng tải lại trang để xem bản mới nhất.");
      return;
    }

    if (!response.ok) {
      throw new Error(`Máy chủ phản hồi mã lỗi HTTP: ${response.status} (${response.statusText || "Lỗi gửi"})`);
    }

    // Đóng modal và hiển thị phản hồi thành công
    const actTitle = currentTargetActivity.title;
    closeInvitePreview();

    showFeedbackAlert(
      "success",
      `Đã chuyển lời mời cùng tham gia "${actTitle}" tới ${recipient}.`
    );
  } catch (error) {
    console.error("Lỗi khi gửi lời mời hoạt động F09:", error);

    // Kiểm tra xem có phải lỗi xung đột phiên bản từ payload trả về hay không
    if (error && (error.status === 409 || String(error.message).includes("409") || String(error.message).includes("conflict"))) {
      closeInvitePreview();
      showConflictModal("Nội dung này đã có bản cập nhật mới. Vui lòng tải lại trang để xem bản mới nhất.");
      return;
    }

    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const isNetworkError = error instanceof TypeError || /fetch|network|load failed/i.test(error.message || "");

    const errorMsg = (isOffline || isNetworkError)
      ? "Không có kết nối mạng. Vui lòng kiểm tra Wi-Fi/4G và thử lại."
      : (error.message || "Chưa thể gửi lời mời lúc này. Vui lòng thử lại sau.");

    showFeedbackAlert("error", errorMsg);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalBtnText;
    }
  }
}

// 7. Tải dữ liệu danh mục từ API GET
/**
 * Tải danh mục hoạt động & bài học từ máy chủ
 */
export async function loadActivitiesCatalog() {
  const loadingEl = document.getElementById("loading-state");
  if (loadingEl) loadingEl.style.display = "flex";

  const apiUrl = getActivitiesApiUrl();

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rows = Array.isArray(data) ? data : (data.results || data.data || []);

    if (rows.length > 0) {
      distributeCatalogData(rows);
      return;
    }
  } catch (err) {
    console.warn("Không tải được API từ máy chủ, dùng danh mục dự phòng đã xác minh.", err);
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }

  // Sử dụng danh mục dự phòng nếu API lỗi hoặc trả về rỗng
  distributeCatalogData(DEFAULT_CATALOG);
}

/**
 * Phân bổ dữ liệu vào 2 khu vực: Hoạt động và Viên nang 60s
 * @param {Array} allItems 
 */
function distributeCatalogData(allItems) {
  const activities = allItems.filter((item) => item.kind === "activity" || !item.kind || item.minutes > 1);
  const lessons = allItems.filter((item) => item.kind === "micro_lesson" || item.minutes === 1);

  renderActivities(activities);
  renderLessons(lessons);
}

// 8. Chuyển đổi Tab điều hướng
/**
 * Đổi tab hiển thị giữa Hoạt động chung và Viên nang 60s
 * @param {'activities'|'lessons'} tabKey 
 */
function switchTab(tabKey) {
  currentActiveTab = tabKey;
  const btnAct = document.getElementById("tab-btn-activities");
  const btnLes = document.getElementById("tab-btn-lessons");
  const secAct = document.getElementById("section-activities");
  const secLes = document.getElementById("section-lessons");
  const bannerTitle = document.getElementById("intro-title");
  const bannerDesc = document.getElementById("intro-desc");

  if (tabKey === "activities") {
    btnAct?.classList.add("active");
    btnLes?.classList.remove("active");
    if (secAct) secAct.style.display = "block";
    if (secLes) secLes.style.display = "none";
    if (bannerTitle) bannerTitle.textContent = "Hoạt động chung";
    if (bannerDesc) bannerDesc.textContent = "Chọn một hoạt động để mời người thân cùng làm trong ngày.";
  } else {
    btnLes?.classList.add("active");
    btnAct?.classList.remove("active");
    if (secLes) secLes.style.display = "block";
    if (secAct) secAct.style.display = "none";
    if (bannerTitle) bannerTitle.textContent = "Viên nang tâm lý 60 giây";
    if (bannerDesc) bannerDesc.textContent = "Những bài học ngắn gọn, thuần túy để đọc và chiêm nghiệm.";
  }
}

// 9. Khởi tạo khi DOM sẵn sàng
if (typeof document !== "undefined") {
  const initActivitiesPage = () => {
    // Sự kiện chuyển tab
    document.getElementById("tab-btn-activities")?.addEventListener("click", () => switchTab("activities"));
    document.getElementById("tab-btn-lessons")?.addEventListener("click", () => switchTab("lessons"));

    // Sự kiện Modal Xem trước
    document.getElementById("btn-cancel-invite")?.addEventListener("click", closeInvitePreview);
    document.getElementById("btn-confirm-invite")?.addEventListener("click", sendActivityInvite);

    // Sự kiện Modal Xung đột phiên bản 409
    document.getElementById("btn-reload-page")?.addEventListener("click", () => {
      window.location.reload();
    });

    // Tự động tải dữ liệu ban đầu
    loadActivitiesCatalog();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initActivitiesPage);
  } else {
    initActivitiesPage();
  }
}

// ============================================================================
// [DEV/QA TEST ONLY] MOCK FETCH TOOLBAR CHO F09
// Thanh công cụ gồm 3 nút bấm kiểm thử:
// 1. Case 1: Mời thành công (status 201)
// 2. Case 2: Bắt lỗi 409 Xung đột phiên bản (Conflict) -> mở modal cảnh báo & nút tải lại trang
// 3. Case 3: Lỗi mất kết nối mạng
// ============================================================================
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const setupF09MockToolbar = () => {
    if (document.getElementById("qa-f09-toolbar")) return;

    let postScenario = "success"; // "success" | "conflict_409" | "network_error"

    const bar = document.createElement("div");
    bar.id = "qa-f09-toolbar";
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
        🧪 <span>QA F09 Test:</span>
      </span>
      <button id="qa-f09-btn-success" type="button" style="cursor: pointer; padding: 6px 12px; border: 2px solid #fff; border-radius: 16px; background: #166534; color: #fff; font-weight: 600; font-size: 12px;">
        🟢 1. Mời thành công
      </button>
      <button id="qa-f09-btn-conflict" type="button" style="cursor: pointer; padding: 6px 12px; border: 1px solid transparent; border-radius: 16px; background: #56423E; color: #fff; font-weight: 600; font-size: 12px;">
        🟠 2. Bắt lỗi 409 Conflict
      </button>
      <button id="qa-f09-btn-error" type="button" style="cursor: pointer; padding: 6px 12px; border: 1px solid transparent; border-radius: 16px; background: #56423E; color: #fff; font-weight: 600; font-size: 12px;">
        🔴 3. Lỗi mạng
      </button>
    `;

    document.body.appendChild(bar);

    const btnSuccess = document.getElementById("qa-f09-btn-success");
    const btnConflict = document.getElementById("qa-f09-btn-conflict");
    const btnError = document.getElementById("qa-f09-btn-error");

    const updateActiveButton = (activeBtn, activeBg) => {
      [btnSuccess, btnConflict, btnError].forEach((btn) => {
        if (btn) {
          btn.style.background = "#56423E";
          btn.style.border = "1px solid transparent";
        }
      });
      if (activeBtn) {
        activeBtn.style.background = activeBg;
        activeBtn.style.border = "2px solid #fff";
      }
    };

    btnSuccess?.addEventListener("click", () => {
      postScenario = "success";
      updateActiveButton(btnSuccess, "#166534");
      console.log("[QA-F09] Kịch bản POST: Success (201)");
    });

    btnConflict?.addEventListener("click", () => {
      postScenario = "conflict_409";
      updateActiveButton(btnConflict, "#92400E");
      console.log("[QA-F09] Kịch bản POST: 409 Conflict (Xung đột phiên bản)");
    });

    btnError?.addEventListener("click", () => {
      postScenario = "network_error";
      updateActiveButton(btnError, "#B91C1C");
      console.log("[QA-F09] Kịch bản POST: Network Error");
    });

    // Mock fetch cho POST invite
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (options && options.method === "POST" && String(url).includes("/invite")) {
        await new Promise((r) => setTimeout(r, 600)); // Delay mô phỏng mạng

        if (postScenario === "conflict_409") {
          return {
            ok: false,
            status: 409,
            statusText: "Conflict",
            json: async () => ({
              error: "version_conflict",
              message: "Content revision has changed",
            }),
          };
        } else if (postScenario === "network_error") {
          throw new TypeError("Failed to fetch (Mất kết nối mạng)");
        } else {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              status: "sent",
              invite_id: "inv-" + Date.now(),
              message: "Lời mời đã được ghi nhận",
            }),
          };
        }
      }
      return originalFetch(url, options);
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupF09MockToolbar);
  } else {
    setupF09MockToolbar();
  }
}

