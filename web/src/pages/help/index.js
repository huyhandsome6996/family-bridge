// Help — LUÔN hiển thị công khai (AllowAny), không cần đăng nhập/kết nối (WF-06/SEC-24).
// Đồng thời thỏa mãn invariant tĩnh (US-003): đầu mối chưa được xác minh ->
// chỉ hiển thị "Thông tin đang được xác minh", KHÔNG tự ý đưa số điện thoại/hotline,
// không tuyên bố trực 24/7. Khi có kết nối API qua ctx.adapter.helpDirectory(),
// nạp danh bạ chính thức đã được xác minh máy chủ.

import { h, clear } from "../../app/dom.js";
import {
  createCard,
  createTopBar,
  createErrorState,
  createSkeleton,
  createIcon,
  createStatusBadge,
} from "../../components/index.js";

const HELP_CONTACTS = [
  { title: "Đầu mối hỗ trợ của trường", detail: "Thông tin đang được xác minh." },
  { title: "Đầu mối tư vấn tâm lý học đường", detail: "Thông tin đang được xác minh." },
];

function formatHours(hours) {
  if (!hours || typeof hours !== "object") return "Đang cập nhật";
  if (hours.always) return "Trực liên tục";
  if (typeof hours.start_hour === "number" && typeof hours.end_hour === "number") {
    return `${hours.start_hour}:00 - ${hours.end_hour}:00`;
  }
  return "Theo giờ làm việc";
}

function sanitizePhone(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/[^0-9+]/g, "");
}

export const page = {
  id: "help",
  title: "Tìm trợ giúp",
  requiresRole: false,
  requiresAuth: false,
  chrome: "app",
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "help" } });

    root.appendChild(
      createTopBar({
        title: "Tìm trợ giúp",
        showBack: true,
        onBack: () => {
          if (typeof window !== "undefined" && window.history && window.history.length > 1) {
            window.history.back();
          } else {
            ctx.navigate("/welcome");
          }
        },
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    // Banner an toàn
    const banner = h(
      "div",
      { class: "fb-signal-banner", role: "note" },
      createIcon({ name: "shield", size: 18 }),
      h(
        "span",
        {},
        "Trang trợ giúp công khai • Luôn sẵn sàng • Không lưu lịch sử cuộc gọi",
      ),
    );
    body.appendChild(banner);

    body.appendChild(
      h(
        "h2",
        { class: "fb-page__heading" },
        "Danh bạ trợ giúp & đầu mối khẩn cấp",
      ),
    );

    body.appendChild(
      h(
        "p",
        { class: "fb-page__intro" },
        "Nếu bạn cần trò chuyện với ai đó ngay, hãy tìm một người lớn mà bạn tin tưởng — cha mẹ, người thân hoặc giáo viên — và chia sẻ những gì bạn đang cảm thấy.",
      ),
    );

    // Thẻ đầu mối cơ sở tĩnh (đảm bảo hiển thị ngay cả khi offline hoặc chưa xác minh)
    const contactList = h("ul", { class: "fb-list" });
    for (const contact of HELP_CONTACTS) {
      contactList.appendChild(
        h(
          "li",
          { class: "fb-list__item" },
          h("h3", { class: "fb-list__title" }, contact.title),
          h("p", { class: "fb-page__note" }, contact.detail),
        ),
      );
    }

    body.appendChild(
      createCard({
        title: "Đầu mối hỗ trợ",
        description: "Khi cần người ngoài gia đình để tâm sự, bạn có thể tìm các đầu mối dưới đây.",
        children: h(
          "div",
          {},
          contactList,
          h(
            "p",
            { class: "fb-page__note" },
            "Khi danh bạ đầu mối đã được xác minh và duyệt, thông tin liên hệ sẽ hiển thị tại đây.",
          ),
        ),
      }),
    );

    // Container nạp danh bạ chính thức từ API F13 nếu adapter khả dụng
    const liveContainer = h("div", { id: "help-live-content" });
    body.appendChild(liveContainer);

    // Thẻ thông tin nhà phát triển bắt buộc theo hợp đồng US-003
    body.appendChild(
      createCard({
        title: "Thông tin nhà phát triển",
        children: h(
          "div",
          {},
          h("p", {}, "Ứng dụng: Family Bridge"),
          h("p", {}, "Phiên bản: 0.3.0 (US-003)"),
          h("p", {}, "Kênh hỗ trợ/khiếu nại: Thông tin đang được cập nhật."),
        ),
      }),
    );

    if (ctx && ctx.adapter && typeof ctx.adapter.helpDirectory === "function") {
      liveContainer.appendChild(createSkeleton({ variant: "card", count: 1 }));
      let cancelled = false;

      Promise.resolve()
        .then(() => ctx.adapter.helpDirectory())
        .then((data) => {
          if (cancelled) return;
          clear(liveContainer);

          const contacts = data && Array.isArray(data.contacts) ? data.contacts : [];
          const isFallback = Boolean(data && data.fallback);
          const guidance = data && data.guidance;

          if (isFallback) {
            const fallbackNotice = h(
              "div",
              { class: "fb-signal-safety", style: "margin-bottom: var(--fb-space-4);" },
              h(
                "div",
                { class: "fb-signal-safety__row" },
                createIcon({ name: "info", size: 18 }),
                h(
                  "p",
                  {},
                  h("strong", {}, "Dự phòng: "),
                  "Đang hiển thị danh bạ dự phòng đã được xác minh kèm phiên bản ứng dụng.",
                ),
              ),
            );
            liveContainer.appendChild(fallbackNotice);
          }

          if (guidance) {
            const guidanceBox = h(
              "div",
              { class: "fb-card", style: "border-left: 4px solid var(--fb-color-warning);" },
              h("p", { class: "fb-page__note" }, String(guidance)),
            );
            liveContainer.appendChild(guidanceBox);
          }

          for (const contact of contacts) {
            const isVerified = contact.status === "verified";
            const rawPhone = contact.phone || "";
            const phoneClean = sanitizePhone(rawPhone);
            const hasPhone = Boolean(isVerified && phoneClean);

            const statusBadge = isVerified
              ? createStatusBadge({ status: "verified", label: "Đã xác minh" })
              : createStatusBadge({ status: "pending", label: "Chờ xác minh" });

            const contactCard = createCard({
              title: contact.public_name || "Đầu mối hỗ trợ",
              description: formatHours(contact.operating_hours),
              children: h(
                "div",
                { class: "fb-contact-item" },
                h(
                  "div",
                  { style: "display: flex; gap: var(--fb-space-2); align-items: center; margin-bottom: var(--fb-space-2);" },
                  statusBadge,
                  contact.open_now !== undefined
                    ? h("span", { class: "fb-page__note" }, contact.open_now ? "• Đang trong giờ trực" : "• Ngoài giờ trực")
                    : null,
                ),
                hasPhone
                  ? h(
                      "div",
                      { style: "margin-top: var(--fb-space-3);" },
                      h(
                        "p",
                        { style: "font-size: var(--fb-font-size-lg); font-weight: bold; margin-bottom: var(--fb-space-2);" },
                        `Số điện thoại: ${contact.phone}`,
                      ),
                      h(
                        "a",
                        {
                          class: "fb-button fb-button--primary",
                          href: `tel:${phoneClean}`,
                          role: "button",
                          style: "display: inline-flex; align-items: center; gap: var(--fb-space-2); text-decoration: none;",
                        },
                        createIcon({ name: "call", size: 16 }),
                        h("span", {}, `Gọi ${contact.phone}`),
                      ),
                    )
                  : h(
                      "p",
                      { class: "fb-page__note", style: "color: var(--fb-color-text-secondary); margin-top: var(--fb-space-2);" },
                      "Thông tin liên hệ đang được xác minh hoặc đã hết hạn kiểm tra định kỳ.",
                    ),
                contact.provenance
                  ? h(
                      "p",
                      { class: "fb-page__note", style: "font-size: var(--fb-font-size-xs); color: var(--fb-color-text-secondary); margin-top: var(--fb-space-2);" },
                      `Nguồn: ${contact.provenance}`,
                    )
                  : null,
              ),
            });
            liveContainer.appendChild(contactCard);
          }
        })
        .catch(() => {
          if (cancelled) return;
          clear(liveContainer);
        });
    }

    return root;
  },
};
