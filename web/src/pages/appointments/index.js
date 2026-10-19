// F12 — Đầu mối trường & Lịch hẹn (US-038 & US-046).
// Tích hợp hoàn chỉnh vào Web SPA chính:
// 1. Danh bạ trường học đã xác minh (school directory).
// 2. Yêu cầu gặp riêng & chu trình lịch hẹn (create, claim, propose slot, accept/decline, complete/cancel).
// 3. Giữ trung thực gate scheduling_no_staff khi chưa có nhân sự tiếp nhận.

import { h, clear } from "../../app/dom.js";
import {
  createCard,
  createButton,
  createEmptyState,
  createErrorState,
  createSkeleton,
  createIcon,
  createStatusBadge,
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
  scheduled: "Đã chốt lịch hẹn",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

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

export const page = {
  id: "appointments",
  title: "Lịch hẹn & Đầu mối trường",
  requiresRole: true,
  requiresAuth: true,
  chrome: "app",
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "appointments" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

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
        createIcon({ name: "school", size: 18 }),
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

    let cancelled = false;

    function refresh() {
      clear(mainContainer);
      mainContainer.appendChild(createSkeleton({ variant: "card", count: 2 }));
      mainContainer.appendChild(h("p", { class: "fb-status" }, "Đang tải dữ liệu…"));

      Promise.all([
        Promise.resolve().then(() => ctx.adapter.getSchoolDirectory()).catch(() => []),
        Promise.resolve().then(() => ctx.adapter.listAppointmentRequests()).catch((e) => {
          if (e && e.data && e.data.reason === "scheduling_no_staff") {
            return { schedulingDisabled: true };
          }
          return [];
        }),
        Promise.resolve().then(() => ctx.adapter.getAppointmentQueue()).catch(() => []),
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
  const isVerified = contact.status === "verified";
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
      : "Giờ hành chính";

  const info = h("div", {},
    h("h4", { style: "margin: 0;" }, contact.public_name || "Đầu mối trường"),
    h("p", { class: "fb-page__note", style: "margin: var(--fb-space-1) 0 0;" },
      `Thời gian: ${hoursText} • ${isVerified ? "Đã xác minh" : "Chờ xác minh"}`
    ),
  );

  const action = h("div", {});
  if (hasPhone) {
    action.appendChild(
      h("a", {
        class: "fb-button fb-button--primary",
        href: `tel:${phoneClean}`,
        role: "button",
        style: "display: inline-flex; align-items: center; gap: var(--fb-space-2); text-decoration: none;",
      },
        createIcon({ name: "phone", size: 16 }),
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
  const el = h("div", {
    class: "fb-list__item",
    style: "padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const header = h("div", { style: "display: flex; justify-content: space-between; align-items: center;" },
    h("h4", { style: "margin: 0;" }, TOPIC_LABELS[req.topic] || req.topic),
    createStatusBadge({
      status: req.status === "scheduled" ? "verified" : (req.status === "cancelled" ? "declined" : "pending"),
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

  // Nút hành động theo trạng thái
  const actions = h("div", { style: "display: flex; gap: var(--fb-space-2); margin-top: var(--fb-space-2);" });

  if (req.status === "slot_proposed" && req.slots && req.slots.length > 0) {
    const slot = req.slots[0];
    const slotBox = h("div", {
      style: "background: var(--fb-color-bg-secondary, #f8f9fa); padding: var(--fb-space-3); border-radius: var(--fb-radius-md); margin-top: var(--fb-space-2);",
    },
      h("p", { style: "font-weight: 600; margin: 0 0 var(--fb-space-2);" },
        `Thời gian đề xuất: ${formatDateTimeVN(slot.start_at)}`
      ),
      h("div", { style: "display: flex; gap: var(--fb-space-2);" },
        createButton({
          label: "Đồng ý giờ này",
          variant: "primary",
          onClick: async () => {
            try {
              await ctx.adapter.acceptAppointmentSlot({ requestId: req.request_id, slotId: slot.slot_id });
              refresh();
            } catch (err) {
              alert("Không thể chấp nhận: " + (err.message || "Lỗi máy chủ"));
            }
          },
        }),
        createButton({
          label: "Từ chối",
          variant: "secondary",
          onClick: async () => {
            try {
              await ctx.adapter.declineAppointmentSlot({ requestId: req.request_id, slotId: slot.slot_id });
              refresh();
            } catch (err) {
              alert("Lỗi: " + (err.message || "Không thể từ chối"));
            }
          },
        }),
      )
    );
    el.appendChild(slotBox);
  }

  if (req.status !== "completed" && req.status !== "cancelled") {
    actions.appendChild(
      createButton({
        label: "Hủy yêu cầu",
        variant: "secondary",
        onClick: async () => {
          if (!confirm("Bạn có chắc muốn hủy yêu cầu này?")) return;
          try {
            await ctx.adapter.cancelAppointmentRequest(req.request_id);
            refresh();
          } catch (e) {
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

  form.onsubmit = async (e) => {
    e.preventDefault();
    const topic = form.querySelector("#req-topic").value;
    const note = form.querySelector("#req-note").value.trim();

    try {
      await ctx.adapter.createAppointmentRequest({ topic, note });
      alert("Yêu cầu hẹn gặp đã được chuyển tới nhà trường.");
      refresh();
    } catch (err) {
      if (err && err.data && err.data.reason === "scheduling_no_staff") {
        alert("Hiện chưa có nhân sự tiếp nhận lịch hẹn. Vui lòng thử lại sau.");
      } else {
        alert("Không thể gửi yêu cầu: " + (err.message || "Lỗi máy chủ"));
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
  const el = h("div", {
    class: "fb-list__item",
    style: "padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  el.appendChild(
    h("div", { style: "display: flex; justify-content: space-between; align-items: center;" },
      h("h4", { style: "margin: 0;" }, `Yêu cầu: ${TOPIC_LABELS[req.topic] || req.topic}`),
      createStatusBadge({ status: "pending", label: STATUS_LABELS[req.status] || req.status }),
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
            await ctx.adapter.claimAppointmentRequest(req.request_id);
            refresh();
          } catch (e) {
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
        onClick: async () => {
          const raw = prompt("Nhập thời gian đề xuất (ISO format, ví dụ: 2026-10-25T09:00:00Z):");
          if (!raw) return;
          try {
            await ctx.adapter.proposeAppointmentSlot({ requestId: req.request_id, startAt: raw });
            refresh();
          } catch (e) {
            alert("Lỗi đề xuất giờ: " + (e.message || "Định dạng thời gian không hợp lệ"));
          }
        },
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
            await ctx.adapter.completeAppointmentRequest(req.request_id);
            refresh();
          } catch (e) {
            alert("Lỗi: " + (e.message || "Lỗi máy chủ"));
          }
        },
      }),
    );
  }

  el.appendChild(actions);
  return el;
}
