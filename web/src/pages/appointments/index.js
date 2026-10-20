// F12 — Đầu mối trường & Lịch hẹn (US-038 & US-046).
// Tích hợp hoàn chỉnh vào Web SPA chính:
// 1. Danh bạ trường học đã xác minh (school directory).
// 2. Yêu cầu gặp riêng & chu trình lịch hẹn (create, claim, propose slot, accept/decline, complete/cancel).
// 3. Giữ trung thực gate scheduling_no_staff khi chưa có nhân sự tiếp nhận.

import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createCard,
  createButton,
  createEmptyState,
  createErrorState,
  createSkeleton,
  createIcon,
  createStatusBadge,
  createDemoBanner,
} from "../../components/index.js";

const TOPIC_LABELS = {
  hoc_tap: "Học tập & định hướng",
  tinh_cam: "Tâm tư & tình cảm",
  khac: "Nội dung khác",
};

const STATUS_LABELS = {
  submitted: "Đang chờ tiếp nhận",
  assigned: "Đã có người tiếp nhận",
  slot_proposed: "Có đề xuất thời gian",
  proposed: "Có đề xuất thời gian",
  scheduled: "Đã chốt lịch hẹn",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
  declined: "Từ chối",
};

function statusTone(status) {
  switch (status) {
    case "scheduled":
    case "completed":
      return "success";
    case "slot_proposed":
    case "proposed":
      return "info";
    case "submitted":
    case "assigned":
    case "pending":
      return "warning";
    case "cancelled":
    case "declined":
    default:
      return "neutral";
  }
}

function sanitizePhone(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/[^0-9+]/g, "");
}

function formatDateTimeVN(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function isSchedulingNoStaffError(err) {
  return Boolean(
    err &&
      ((err.details && err.details.reason === "scheduling_no_staff") ||
        (err.data && err.data.reason === "scheduling_no_staff") ||
        err.code === "module_unavailable" ||
        (err.details && err.details.code === "scheduling_no_staff")),
  );
}

let activeOverlays = [];
let pageCleanup = null;

export const page = {
  id: "appointments",
  title: "Lịch hẹn & Đầu mối trường",
  requiresRole: false,
  requiresAuth: false,
  chrome: "app",
  showBottomNav: true,

  render(ctx) {
    let cancelled = false;

    pageCleanup = () => {
      cancelled = true;
      activeOverlays.forEach((el) => {
        if (el && typeof el.remove === "function") el.remove();
      });
      activeOverlays = [];
    };

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "appointments" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const state = (ctx.store && typeof ctx.store.getState === "function") ? ctx.store.getState() : {};
    const demo = Boolean(state.demoMode);

    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để sử dụng lịch hẹn",
          description: "Đăng nhập để xem danh bạ nhà trường và đặt lịch hẹn trao đổi riêng.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) {
      body.appendChild(createDemoBanner({ onExit: () => ctx.exitDemo() }));
    }

    body.appendChild(h("h2", { class: "fb-page__heading" }, "Đầu mối trường & Lịch hẹn"));
    body.appendChild(
      h(
        "p",
        { class: "fb-page__intro" },
        "Danh bạ liên hệ chính thức của nhà trường và cổng đăng ký hẹn gặp riêng với thầy cô hoặc chuyên viên tâm lý.",
      ),
    );

    // Banner an toàn & link F13
    const banner = h(
      "div",
      { class: "fb-signal-safety", style: "margin-bottom: var(--fb-space-4);" },
      h(
        "div",
        { class: "fb-signal-safety__row" },
        createIcon({ name: "history_edu", size: 18 }),
        h(
          "p",
          {},
          "Mọi trao đổi được giữ kín giữa bạn và người tiếp nhận. Nếu có tình huống khẩn cấp, vui lòng mở ",
          h("a", { href: "#/help" }, "Trang tìm trợ giúp (F13)"),
          " ngay.",
        ),
      ),
    );
    body.appendChild(banner);

    const mainContainer = h("div", { id: "appointments-main" });
    body.appendChild(mainContainer);

    function refresh() {
      clear(mainContainer);
      mainContainer.appendChild(createSkeleton({ variant: "card", count: 2 }));
      mainContainer.appendChild(h("p", { class: "fb-status" }, "Đang tải dữ liệu…"));

      Promise.all([
        Promise.resolve().then(() => ctx.adapter.getSchoolDirectory()).catch((e) => {
          if (e && e.status === 401) throw e;
          return [];
        }),
        Promise.resolve().then(() => ctx.adapter.listAppointmentRequests()).catch((e) => {
          if (e && e.status === 401) throw e;
          if (isSchedulingNoStaffError(e)) {
            return { schedulingDisabled: true };
          }
          return [];
        }),
        Promise.resolve().then(() => ctx.adapter.getAppointmentQueue()).catch((e) => {
          if (e && e.status === 401) throw e;
          return [];
        }),
      ])
        .then(([directory, requestsResult, queue]) => {
          if (cancelled) return;
          clear(mainContainer);

          const isSchedulingDisabled = Boolean(requestsResult && requestsResult.schedulingDisabled);
          const requests = Array.isArray(requestsResult) ? requestsResult : [];

          // 1. Render School Directory
          renderDirectorySection(mainContainer, directory || []);

          // 2. Render Staff Queue if available
          if (Array.isArray(queue) && queue.length > 0) {
            renderQueueSection(mainContainer, ctx, queue, refresh);
          }

          // 3. Render Appointments / Scheduling Section
          renderSchedulingSection(mainContainer, ctx, {
            requests,
            isSchedulingDisabled,
            refresh,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (err && err.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          clear(mainContainer);
          mainContainer.appendChild(
            createErrorState({
              title: "Không thể tải dữ liệu",
              description: "Vui lòng kiểm tra kết nối mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: refresh,
            }),
          );
        });
    }

    refresh();
    return root;
  },

  destroy() {
    if (typeof pageCleanup === "function") pageCleanup();
    pageCleanup = null;
  },
};

/* ------------------- Section 1: School Directory ------------------- */
function renderDirectorySection(container, contacts) {
  const card = createCard({
    title: "Danh bạ đầu mối trường học",
    description: "Các phòng ban và cán bộ tư vấn sẵn sàng tiếp nhận trao đổi.",
    children: h("div", {},
      contacts.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-2) 0;" },
            "Thông tin danh bạ trường học đang được cập nhật."
          )
        : h("div", { class: "fb-list" },
            ...contacts.map((contact) => createContactItem(contact))
          )
    ),
  });
  container.appendChild(card);
}

function createContactItem(contact) {
  const isVerified = contact.verified === true || contact.status === "verified";
  const rawPhone = contact.phone || "";
  const phoneClean = sanitizePhone(rawPhone);
  const hasPhone = Boolean(isVerified && phoneClean);

  const el = h("div", {
    class: "fb-list__item",
    style: "display: flex; justify-content: space-between; align-items: center; padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const hoursText = contact.operating_hours && contact.operating_hours.always
    ? "Trực 24/7"
    : (contact.operating_hours && contact.operating_hours.start_hour !== undefined)
      ? `${contact.operating_hours.start_hour}:00 - ${contact.operating_hours.end_hour}:00`
      : (contact.hours && contact.hours.always)
        ? "Trực 24/7"
        : (contact.hours && contact.hours.start_hour !== undefined)
          ? `${contact.hours.start_hour}:00 - ${contact.hours.end_hour}:00`
          : "Giờ hành chính";

  const info = h("div", {},
    h("h4", { style: "margin: 0;" }, contact.public_name || "Đầu mối trường"),
    h("div", { style: "display: flex; gap: var(--fb-space-2); align-items: center; margin-top: var(--fb-space-1);" },
      createStatusBadge({
        label: isVerified ? "Đã xác minh" : "Chờ xác minh",
        tone: isVerified ? "success" : "neutral",
      }),
      h("span", { class: "fb-page__note" }, `Thời gian: ${hoursText}`),
    ),
  );

  const action = h("div", {});
  if (hasPhone) {
    action.appendChild(
      h("a", {
        class: "fb-btn fb-btn--primary",
        href: `tel:${phoneClean}`,
        role: "button",
        style: "display: inline-flex; align-items: center; gap: var(--fb-space-2); text-decoration: none;",
      },
        createIcon({ name: "call", size: 16 }),
        h("span", {}, `Gọi ${contact.phone}`),
      ),
    );
  }

  el.appendChild(info);
  el.appendChild(action);
  return el;
}

/* ------------------- Section 2: Scheduling & Requests ------------------- */
function renderSchedulingSection(container, ctx, { requests, isSchedulingDisabled, refresh }) {
  if (isSchedulingDisabled) {
    const disabledCard = createCard({
      title: "Đăng ký lịch hẹn gặp riêng",
      children: h("div", { style: "padding: var(--fb-space-2) 0;" },
        h("div", { class: "fb-status fb-status--info", style: "margin-bottom: var(--fb-space-3);" },
          createIcon({ name: "info", size: 16 }),
          h("span", {}, "Hệ thống đặt lịch hẹn hiện đang tạm đóng do nhà trường đang sắp xếp nhân sự tiếp nhận."),
        ),
        h("p", { class: "fb-page__note" },
          "Bạn vẫn có thể liên hệ trực tiếp với các đầu mối trên danh bạ hoặc tìm trợ giúp khẩn cấp qua tổng đài 111."
        ),
      ),
    });
    container.appendChild(disabledCard);
    return;
  }

  // Danh sách yêu cầu hẹn gặp của bạn
  const listCard = createCard({
    title: "Yêu cầu lịch hẹn của bạn",
    description: "Theo dõi tiến độ xử lý và xác nhận thời gian hẹn gặp.",
    children: h("div", {},
      requests.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-2) 0;" },
            "Bạn chưa có yêu cầu hẹn gặp nào."
          )
        : h("div", { class: "fb-list" },
            ...requests.map((req) => createRequestItem(req, ctx, refresh))
          )
    ),
  });
  container.appendChild(listCard);

  // Form tạo yêu cầu mới
  const createCardEl = createCard({
    title: "Gửi yêu cầu hẹn gặp mới",
    description: "Chọn chủ đề và ghi chú (tùy chọn) để nhà trường bố trí nhân sự phù hợp.",
    children: createRequestForm(ctx, refresh),
  });
  container.appendChild(createCardEl);
}

function createRequestItem(req, ctx, refresh) {
  const reqId = req.request_id || req.id;
  const el = h("div", {
    class: "fb-list__item",
    style: "padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const header = h("div", { style: "display: flex; justify-content: space-between; align-items: center;" },
    h("h4", { style: "margin: 0;" }, TOPIC_LABELS[req.topic] || req.topic),
    createStatusBadge({
      tone: statusTone(req.status),
      label: STATUS_LABELS[req.status] || req.status,
    }),
  );
  el.appendChild(header);

  if (req.note) {
    el.appendChild(h("p", { style: "margin: var(--fb-space-2) 0 var(--fb-space-1); font-size: var(--fb-font-size-sm);" }, req.note));
  }

  const meta = h("p", { class: "fb-page__note", style: "margin: 0;" },
    `Gửi ngày: ${formatDateTimeVN(req.created_at)}`
  );
  el.appendChild(meta);

  // Hiển thị khung giờ được đề xuất (nếu có)
  const slots = Array.isArray(req.slots) ? req.slots : [];
  const proposedSlot = slots.find((s) => s.status === "proposed" || !s.status);

  if ((req.status === "slot_proposed" || req.status === "proposed") && proposedSlot) {
    const slotId = proposedSlot.slot_id || proposedSlot.id;
    const slotTimeStr = formatDateTimeVN(proposedSlot.start_at || proposedSlot.startAt);
    const locNote = proposedSlot.location_note || proposedSlot.locationNote;

    const slotBox = h("div", {
      style: "background: var(--fb-color-bg-secondary, #f8f9fa); padding: var(--fb-space-3); border-radius: var(--fb-radius-md); margin-top: var(--fb-space-2);",
    },
      h("p", { style: "font-weight: 600; margin: 0 0 var(--fb-space-1);" },
        `Thời gian đề xuất: ${slotTimeStr}`
      ),
      locNote ? h("p", { class: "fb-page__note", style: "margin: 0 0 var(--fb-space-2);" }, `Địa điểm: ${locNote}`) : null,
      h("div", { style: "display: flex; gap: var(--fb-space-2);" },
        createButton({
          label: "Chấp nhận lịch",
          variant: "primary",
          onClick: async () => {
            try {
              await ctx.adapter.acceptAppointmentSlot({ requestId: reqId, slotId });
              refresh();
            } catch (err) {
              if (err && err.status === 401) {
                ctx.navigate("/login?reason=expired");
                return;
              }
              alert("Không thể chấp nhận: " + (err.message || "Lỗi máy chủ"));
            }
          },
        }),
        createButton({
          label: "Từ chối",
          variant: "ghost",
          onClick: async () => {
            try {
              await ctx.adapter.declineAppointmentSlot({ requestId: reqId, slotId });
              refresh();
            } catch (err) {
              if (err && err.status === 401) {
                ctx.navigate("/login?reason=expired");
                return;
              }
              alert("Lỗi: " + (err.message || "Không thể từ chối"));
            }
          },
        }),
      )
    );
    el.appendChild(slotBox);
  }

  // Nút hành động theo trạng thái
  const actions = h("div", { style: "display: flex; gap: var(--fb-space-2); margin-top: var(--fb-space-2);" });

  if (req.status !== "completed" && req.status !== "cancelled") {
    actions.appendChild(
      createButton({
        label: "Hủy yêu cầu",
        variant: "ghost",
        onClick: async () => {
          if (!confirm("Bạn có chắc muốn hủy yêu cầu này?")) return;
          try {
            await ctx.adapter.cancelAppointmentRequest(reqId);
            refresh();
          } catch (e) {
            if (e && e.status === 401) {
              ctx.navigate("/login?reason=expired");
              return;
            }
            alert("Lỗi hủy yêu cầu: " + (e.message || "Lỗi máy chủ"));
          }
        },
      }),
    );
    el.appendChild(actions);
  }

  return el;
}

function createRequestForm(ctx, refresh) {
  const form = h("form", {
    style: "display: flex; flex-direction: column; gap: var(--fb-space-3); margin-top: var(--fb-space-2);",
  });

  const feedbackContainer = h("div", {});
  form.appendChild(feedbackContainer);

  form.onsubmit = async (e) => {
    e.preventDefault();
    clear(feedbackContainer);
    const topic = form.querySelector("#req-topic").value;
    const note = form.querySelector("#req-note").value.trim();

    try {
      await ctx.adapter.createAppointmentRequest({ topic, note });
      feedbackContainer.appendChild(
        h("div", { class: "fb-status fb-status--success", style: "margin-bottom: var(--fb-space-2);" },
          h("span", {}, "Yêu cầu hẹn gặp đã được chuyển tới nhà trường."),
        ),
      );
      form.querySelector("#req-note").value = "";
      refresh();
    } catch (err) {
      if (err && err.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      if (isSchedulingNoStaffError(err)) {
        refresh();
      } else {
        feedbackContainer.appendChild(
          h("div", { class: "fb-status fb-status--error", style: "margin-bottom: var(--fb-space-2);" },
            h("span", {}, "Không thể gửi yêu cầu: " + (err.message || "Lỗi máy chủ")),
          ),
        );
      }
    }
  };

  const topicGroup = h("div", {},
    h("label", { for: "req-topic", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Chủ đề muốn trao đổi:"),
    h("select", {
      id: "req-topic",
      class: "fb-select",
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    },
      h("option", { value: "hoc_tap" }, "Học tập & định hướng"),
      h("option", { value: "tinh_cam" }, "Tâm tư & tình cảm"),
      h("option", { value: "khac" }, "Nội dung khác"),
    ),
  );
  form.appendChild(topicGroup);

  const noteGroup = h("div", {},
    h("label", { for: "req-note", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Ghi chú thêm (riêng tư):"),
    h("textarea", {
      id: "req-note",
      class: "fb-textarea",
      rows: 3,
      maxlength: 4000,
      placeholder: "Mô tả ngắn gọn điều bạn muốn trao đổi để chuyên viên chuẩn bị…",
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    }),
  );
  form.appendChild(noteGroup);

  const submitBtn = createButton({
    label: "Gửi yêu cầu hẹn gặp",
    variant: "primary",
    type: "submit",
  });
  form.appendChild(submitBtn);

  return form;
}

/* ------------------- Section 3: Staff Queue (Operators) ------------------- */
function renderQueueSection(container, ctx, queue, refresh) {
  const card = createCard({
    title: "Hàng đợi tiếp nhận (Dành cho cán bộ tư vấn)",
    description: "Các yêu cầu hẹn gặp đang chờ xử lý hoặc do bạn phụ trách.",
    children: h("div", { class: "fb-list" },
      ...queue.map((req) => createQueueItem(req, ctx, refresh))
    ),
  });
  container.appendChild(card);
}

function createQueueItem(req, ctx, refresh) {
  const reqId = req.request_id || req.id;
  const el = h("div", {
    class: "fb-list__item",
    style: "padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  el.appendChild(
    h("div", { style: "display: flex; justify-content: space-between; align-items: center;" },
      h("h4", { style: "margin: 0;" }, `Yêu cầu: ${TOPIC_LABELS[req.topic] || req.topic}`),
      createStatusBadge({
        tone: statusTone(req.status),
        label: STATUS_LABELS[req.status] || req.status,
      }),
    ),
  );

  if (req.note) {
    el.appendChild(h("p", { style: "margin: var(--fb-space-2) 0; font-size: var(--fb-font-size-sm);" }, `Ghi chú: ${req.note}`));
  }

  const actions = h("div", { style: "display: flex; gap: var(--fb-space-2); margin-top: var(--fb-space-2);" });

  if (req.status === "submitted" && !req.has_handler) {
    actions.appendChild(
      createButton({
        label: "Tiếp nhận xử lý",
        variant: "primary",
        onClick: async () => {
          try {
            await ctx.adapter.claimAppointmentRequest(reqId);
            refresh();
          } catch (e) {
            if (e && e.status === 401) {
              ctx.navigate("/login?reason=expired");
              return;
            }
            alert("Không thể tiếp nhận: " + (e.message || "Lỗi máy chủ"));
          }
        },
      }),
    );
  }

  if (req.status === "assigned" || req.status === "slot_proposed") {
    actions.appendChild(
      createButton({
        label: "Đề xuất giờ hẹn",
        variant: "primary",
        onClick: () => openProposeSlotModal(req, ctx, refresh),
      }),
    );
  }

  if (req.status === "scheduled") {
    actions.appendChild(
      createButton({
        label: "Đánh dấu hoàn thành",
        variant: "primary",
        onClick: async () => {
          try {
            await ctx.adapter.completeAppointmentRequest(reqId);
            refresh();
          } catch (e) {
            if (e && e.status === 401) {
              ctx.navigate("/login?reason=expired");
              return;
            }
            alert("Lỗi: " + (e.message || "Lỗi máy chủ"));
          }
        },
      }),
    );
  }

  el.appendChild(actions);
  return el;
}

function openProposeSlotModal(req, ctx, refresh) {
  const overlay = h("div", {
    class: "fb-overlay",
    style: "position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: var(--fb-space-4);",
  });
  activeOverlays.push(overlay);

  const modal = h("div", {
    class: "fb-card",
    style: "max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; background: white; padding: var(--fb-space-4); border-radius: var(--fb-radius-lg);",
  });
  overlay.appendChild(modal);

  modal.appendChild(h("h3", { style: "margin-top: 0;" }, "Đề xuất thời gian hẹn gặp"));
  modal.appendChild(
    h("p", { class: "fb-page__note" }, "Chọn ngày, giờ và địa điểm phòng gặp để học sinh xác nhận."),
  );

  const form = h("form", { style: "display: flex; flex-direction: column; gap: var(--fb-space-3); margin-top: var(--fb-space-2);" });

  const dtGroup = h("div", {},
    h("label", { for: "slot-datetime", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Thời gian bắt đầu:"),
    h("input", {
      id: "slot-datetime",
      type: "datetime-local",
      class: "fb-input",
      required: true,
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    }),
  );
  form.appendChild(dtGroup);

  const durGroup = h("div", {},
    h("label", { for: "slot-duration", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Thời lượng (phút):"),
    h("input", {
      id: "slot-duration",
      type: "number",
      class: "fb-input",
      value: "30",
      min: "15",
      max: "180",
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    }),
  );
  form.appendChild(durGroup);

  const locGroup = h("div", {},
    h("label", { for: "slot-location", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Địa điểm / Phòng gặp:"),
    h("input", {
      id: "slot-location",
      type: "text",
      class: "fb-input",
      placeholder: "Ví dụ: Phòng Tham vấn P.204",
      value: "Phòng Tham vấn học đường",
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    }),
  );
  form.appendChild(locGroup);

  const btnRow = h("div", { style: "display: flex; gap: var(--fb-space-2); justify-content: flex-end; margin-top: var(--fb-space-3);" });

  const cancelBtn = createButton({
    label: "Hủy",
    variant: "ghost",
    onClick: () => {
      overlay.remove();
      activeOverlays = activeOverlays.filter((o) => o !== overlay);
    },
  });

  const submitBtn = createButton({
    label: "Gửi đề xuất",
    variant: "primary",
    type: "submit",
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const dtVal = form.querySelector("#slot-datetime").value;
    if (!dtVal) return;
    const startAt = new Date(dtVal).toISOString();
    const durMins = parseInt(form.querySelector("#slot-duration").value, 10) || 30;
    const endAt = new Date(new Date(dtVal).getTime() + durMins * 60000).toISOString();
    const locationNote = form.querySelector("#slot-location").value.trim();

    try {
      await ctx.adapter.proposeAppointmentSlot({
        requestId: req.request_id || req.id,
        startAt,
        endAt,
        locationNote,
      });
      overlay.remove();
      activeOverlays = activeOverlays.filter((o) => o !== overlay);
      refresh();
    } catch (err) {
      if (err && err.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      alert("Lỗi đề xuất giờ: " + (err.message || "Lỗi máy chủ"));
    }
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(submitBtn);
  form.appendChild(btnRow);
  modal.appendChild(form);

  document.body.appendChild(overlay);
}

