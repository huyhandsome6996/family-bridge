// Home (U08 student / U10 caregiver) — Stitch upgrade 2026-10.
// Tái tạo hai màn trang chủ theo docs/design/stitch-reference/
// u08_trang_ch_h_c_sinh/ và u10_trang_ch_ng_i_ch_m_s_c/.
//
// LUỒNG GIỮ NGUYÊN từ nền tảng (pages.test / f01-flows / QA không-tự-gửi):
//   - demo (adapter mock): getConnectionStatus fixture "đã kết nối" ->
//     home đã kết nối kèm DemoBanner "Dữ liệu minh họa" rõ ràng.
//   - production (adapter zalo): cần phiên (F01); có phiên -> listConnections()
//     thật; chưa -> /connect. Không fake-success, không fallback mock.
//   - Nút amber "Mở lời chia sẻ an toàn" (kicker "Con cần được lắng nghe")
//     CHỈ mở Sheet xem trước — KHÔNG gửi tín hiệu, không báo "đã gửi".
//   - 401 -> /login?reason=expired; lỗi khác -> ErrorState + thử lại.
//
// Sự thật dữ liệu (PROMPT Stitch §7):
//   - Tên chào lấy từ profile/phiên thật (fixture có nhãn minh họa), không
//     hardcode "An"/"Mẹ".
//   - KHÔNG giả trạng thái online/presence (API không có) — chip kết nối nói
//     "Kết nối hai phía đang hoạt động" (sự thật từ status active).
//   - Chọn cảm xúc là hành vi CỤC BỘ, copy nói rõ chưa ghi nhận ở máy chủ —
//     module mood F07 chưa được nối adapter ở bản này.
//   - Hotline/số điện thoại chỉ dùng nguồn được duyệt: thanh trợ giúp dẫn về
//     trang Trợ giúp trong app, không tự nhét "Tổng đài 111" từ mẫu.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession, getSession } from "../../core/session.js";
import {
  createButton,
  createSheet,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createAppHeader,
  createIcon,
  createSkeleton,
} from "../../components/index.js";
import journeyRoomUrl from "../../assets/illustrations/journey-week1-room.jpg";
import familyDinnerUrl from "../../assets/illustrations/activity-family-dinner.jpg";

/** ctx.store có thể là snapshot hoặc module store — đọc state an toàn. */
function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Gắn sheet vào trang và dọn sạch khi đóng (phòng trường hợp component không tự xoá). */
function openSheetIn(root, sheetOptions) {
  let sheet;
  sheet = createSheet({
    ...sheetOptions,
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  root.appendChild(sheet);
  return sheet;
}

/** Ngày thật hiện tại, định dạng tiếng Việt ("Thứ Tư, 24 tháng 10"). */
function todayLabel() {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  } catch {
    return "";
  }
}

export const page = {
  id: "u08-home", // U08 student + U10 caregiver — dispatch theo vai trò
  title: "Trang chủ",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const role = state.role;

    const root = h("div", {
      class: "fb-page fb-page--under-header",
      dataset: { page: "u08-home" },
    });

    // App header Stitch (brand + Trợ giúp + avatar) — Trợ giúp luôn truy cập.
    root.appendChild(createAppHeader({
      subtitle: "Trang Chủ",
      onProfile: () => ctx.navigate("/profile"),
    }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    // Phòng thủ: router đã chặn trước, nhưng nếu render thiếu vai trò thì
    // không gọi adapter, hướng người dùng về chọn vai trò.
    if (role !== "student" && role !== "caregiver") {
      body.appendChild(
        createEmptyState({
          title: "Chưa chọn vai trò xem trước",
          description: "Hãy chọn vai trò để xem giao diện tương ứng.",
          action: { label: "Chọn vai trò", onClick: () => ctx.navigate("/role-select") },
        }),
      );
      return root;
    }

    const demo = Boolean(state.demoMode);

    // Production: chưa có phiên sống -> mời đăng nhập (không redirect cứng).
    if (!demo && !hasLiveSession()) {
      renderNeedsLogin(body, ctx);
      return root;
    }

    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải trang chủ…"));

    const currentRun = ++runId;

    Promise.resolve()
      .then(() => {
        if (demo) {
          return ctx.adapter.getConnectionStatus();
        }
        // A09: adapter trả { results, nextCursor } — home chỉ cần trang đầu.
        return ctx.adapter.listConnections({ limit: 20 })
          .then((pageData) => ({ rows: pageData.results || [], source: "backend" }));
      })
      .then((status) => {
        if (cancelled || currentRun !== runId) return null;
        if (status && status.source === "backend") return { status, profile: null };
        return Promise.resolve()
          .then(() => ctx.adapter.getProfile(role))
          .catch(() => null) // không có tên fixture -> chào chung, không chặn trang
          .then((profile) => ({ status, profile }));
      })
      .then((result) => {
        if (!result || cancelled || currentRun !== runId) return;
        if (result.status && result.status.source === "backend") {
          // Production thật: kết nối đọc từ backend.
          const rows = result.status.rows || [];
          if (rows.length) renderConnectedProduction(body, ctx, role, rows);
          else renderNotConnected(body, ctx);
          return;
        }
        renderConnected(body, ctx, role, result.status, result.profile);
      })
      .catch((error) => {
        if (cancelled || currentRun !== runId) return;
        if (error && error.status === 401) {
          // Phiên hết hạn/thu hồi: adapter đã clear session — về đăng nhập.
          ctx.navigate("/login?reason=expired");
          return;
        }
        renderLoadError(body, ctx, error);
      });

    return root;
  },
};

/** Dọn dẹp async/sheet khi router rời trang (router gọi page.destroy). */
let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* --------------------------- Khối dựng chung (Stitch) --------------------------- */

/** Section chào: pill ngữ cảnh + ngày thật + headline theo vai trò. */
function renderGreeting(body, { displayName, role }) {
  const section = h("section", { class: "fb-sec" });

  const row = h("div", { class: "fb-sec__row" });
  const contextPill = h("span", { class: "fb-chip" });
  contextPill.appendChild(h("span", { class: "fb-chip__dot", "aria-hidden": "true" }));
  contextPill.appendChild(
    h("span", {}, role === "student" ? "Không gian an toàn của bạn" : "Không gian an toàn của gia đình"),
  );
  row.appendChild(contextPill);
  const dateText = todayLabel();
  if (dateText) {
    row.appendChild(h("span", { class: "fb-sec__sub" }, dateText));
  }
  section.appendChild(row);

  const name = displayName ? String(displayName) : "";
  if (role === "student") {
    section.appendChild(
      h("h1", { class: "fb-sec__greeting" },
        name ? `Chào ${name}, hôm nay bạn cảm thấy thế nào?` : "Hôm nay bạn cảm thấy thế nào?"),
    );
    section.appendChild(
      h("p", { class: "fb-sec__sub" }, "Mọi cảm xúc ở đây đều được trân trọng và lắng nghe chân thành."),
    );
  } else {
    section.appendChild(
      h("h1", { class: "fb-sec__greeting" }, name ? `Chào ${name},` : "Chào bạn,"),
    );
    section.appendChild(
      h("p", { class: "fb-sec__sub" }, "Chúc bạn một ngày an lành và dịu êm."),
    );
  }
  body.appendChild(section);
}

/** Bộ chọn cảm xúc CỤC BỘ — không tự ghi nhận ở máy chủ (F07 chưa nối). */
function renderMoodPicker(parent, { moods, warm = false, ariaLabel }) {
  const grid = h("div", { class: `fb-mood-grid ${warm ? "fb-mood-grid--4" : "fb-mood-grid--3"}`, role: "group", "aria-label": ariaLabel });
  const feedback = h("div", { class: "fb-mood-feedback", role: "status", hidden: true });

  moods.forEach(({ emoji, label }) => {
    const btn = h("button", {
      class: `fb-mood${warm ? " fb-mood--warm" : ""}`,
      type: "button",
      "aria-pressed": "false",
    },
      h("span", { class: "fb-mood__emoji", "aria-hidden": "true" }, emoji),
      h("span", { class: "fb-mood__label" }, label),
    );
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".fb-mood").forEach((other) => other.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      clear(feedback);
      feedback.appendChild(
        h("span", {},
          `Bạn vừa chọn “${label}”. Thông tin này chỉ hiển thị trên máy của bạn — chưa được ghi nhận ở máy chủ.`,
        ),
      );
      feedback.hidden = false;
    });
    grid.appendChild(btn);
  });

  parent.appendChild(grid);
  parent.appendChild(feedback);
}

/* ----------------------------- Đã kết nối (demo) ----------------------------- */

function renderConnected(body, ctx, role, status, profile) {
  clear(body);

  const peer = status && status.peer;
  const isFixture = Boolean(status && status.source === "fixture");

  if (isFixture) body.appendChild(createDemoBanner());

  const displayName = profile && profile.displayName;
  renderGreeting(body, { displayName, role });

  const peerLabel = peer && peer.displayLabel ? String(peer.displayLabel) : "Người đồng hành";

  if (role === "student") {
    renderStudentHome(body, ctx, { peer, peerLabel, isFixture });
  } else {
    renderCaregiverHome(body, ctx, { isFixture });
  }
}

/* ------------------------------ Home học sinh (U08) ------------------------------ */

function renderStudentHome(body, ctx, { peer, peerLabel }) {
  // 1) CTA amber: "Khi lòng đầy tâm sự" — CHỈ mở sheet xem trước.
  const warm = h("section", { class: "fb-warm-card" });
  warm.appendChild(h("span", { class: "fb-warm-card__halo", "aria-hidden": "true" }));
  const warmHead = h("div", { class: "fb-sec__row" });
  const warmWho = h("div", { style: "display:flex;align-items:flex-start;gap:var(--fb-space-2);min-width:0;" });
  const forumCircle = h("span", { class: "fb-warm-card__icon", "aria-hidden": "true" });
  forumCircle.appendChild(createIcon({ name: "forum", size: 24, fill: true }));
  warmWho.appendChild(forumCircle);
  warmWho.appendChild(
    h("div", {},
      h("span", { class: "fb-warm-card__kicker" }, "Khi lòng đầy tâm sự"),
      h("span", { class: "fb-warm-card__title fb-warm-card__title--block" }, "Con cần được lắng nghe"),
    ),
  );
  warmHead.appendChild(warmWho);
  warmHead.appendChild(h("span", { class: "fb-chip" }, "Xem trước"));
  warm.appendChild(warmHead);
  warm.appendChild(
    h("p", { class: "fb-warm-card__body" },
      "Một cách an toàn, dịu dàng để mở lời với người đồng hành hoặc kênh trợ giúp khi bạn chưa biết bắt đầu từ đâu.",
    ),
  );
  const amberBtn = h("button", { class: "fb-btn-amber", type: "button" },
    createIcon({ name: "chat", size: 20, fill: true }),
    h("span", {}, "Mở lời chia sẻ an toàn"),
    createIcon({ name: "arrow_forward", size: 18 }),
  );
  amberBtn.addEventListener("click", () => {
    openSignalSheet(body.closest(".fb-page") || body, peer);
  });
  warm.appendChild(amberBtn);
  body.appendChild(warm);

  // 2) Cảm xúc lúc này — chỉ mình bạn thấy (chọn cục bộ, trung thực).
  const moodCard = h("section", { class: "fb-scard" });
  const moodHead = h("div", { class: "fb-sec__row" });
  const moodTitle = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" });
  moodTitle.appendChild(createIcon({ name: "psychology_alt", size: 20, className: "fb-stitch-primary-icon" }));
  moodTitle.appendChild(h("h2", { class: "fb-scard__title" }, "Cảm xúc lúc này"));
  moodHead.appendChild(moodTitle);
  const privacyChip = h("span", { class: "fb-chip" },
    createIcon({ name: "lock", size: 14 }),
    h("span", {}, "Chỉ mình bạn thấy"),
  );
  moodHead.appendChild(privacyChip);
  moodCard.appendChild(moodHead);
  renderMoodPicker(moodCard, {
    ariaLabel: "Chọn cảm xúc lúc này",
    moods: [
      { emoji: "😊", label: "Vui vẻ" },
      { emoji: "🍃", label: "Bình yên" },
      { emoji: "🥱", label: "Mệt mỏi" },
      { emoji: "💭", label: "Lo lắng" },
      { emoji: "🌧️", label: "Buồn bã" },
      { emoji: "⚡", label: "Căng thẳng" },
    ],
  });
  body.appendChild(moodCard);

  // 3) Kết nối + cam kết ranh giới (dữ liệu thật từ adapter/fixture).
  const connectCard = h("section", { class: "fb-scard" });
  const connectHead = h("div", { class: "fb-sec__row" });
  const connectWho = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" });
  const familyCircle = h("span", { class: "fb-connect__icon", "aria-hidden": "true" });
  familyCircle.appendChild(createIcon({ name: "family_restroom", size: 26 }));
  connectWho.appendChild(familyCircle);
  const whoText = h("div", { style: "display:flex;flex-direction:column;min-width:0;" });
  whoText.appendChild(h("span", { class: "fb-scard__title fb-connect__name" }, peerLabel));
  whoText.appendChild(
    h("span", { class: "fb-sec__sub fb-connect__status" },
      h("span", { class: "fb-connect__dot", "aria-hidden": "true" }),
      " Kết nối hai phía đang hoạt động",
    ),
  );
  connectWho.appendChild(whoText);
  connectHead.appendChild(connectWho);
  connectHead.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "verified_user", size: 14, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Ranh giới riêng tư"),
    ),
  );
  connectCard.appendChild(connectHead);

  // Dòng nguồn dữ liệu (giữ đúng thông báo minh họa của nền tảng).
  connectCard.appendChild(
    h("p", { class: "fb-page__note" }, `Đang đồng hành với: ${peerLabel}`),
  );

  const boundary = h("div", { class: "fb-connect__boundary" });
  boundary.appendChild(createIcon({ name: "shield", size: 20, className: "fb-stitch-primary-icon" }));
  boundary.appendChild(
    h("div", {},
      h("span", { class: "fb-connect__boundary-title" }, "Cam kết tôn trọng ranh giới"),
      h("p", { class: "fb-connect__boundary-text" },
        "Kết nối gia đình ",
        h("strong", {}, "không bao giờ tự động mở nhật ký hay tâm trạng"),
        " của bạn. Chỉ những gì bạn chủ động gửi mới xuất hiện ở phía người đồng hành.",
      ),
    ),
  );
  connectCard.appendChild(boundary);
  body.appendChild(connectCard);

  // 4) Hành trình 4 tuần — tuần 1, dẫn sang /companion (module có thật).
  const journey = h("section", { class: "fb-scard" });
  const journeyHead = h("div", { class: "fb-sec__row" });
  journeyHead.appendChild(
    h("div", {},
      h("span", { class: "fb-journey__kicker" }, "Hành trình thấu hiểu 4 tuần"),
      h("h2", { class: "fb-scard__title" }, "Tuần 1: Nhận diện cảm xúc & Tiếng lòng chưa nói"),
    ),
  );
  journeyHead.appendChild(h("span", { class: "fb-journey__count", "aria-label": "Tuần 1 của 4" }, "1/4"));
  journey.appendChild(journeyHead);

  journey.appendChild(
    h("figure", { class: "fb-photo" },
      h("img", {
        src: journeyRoomUrl,
        alt: "Góc phòng ấm áp với ánh nắng chiều qua khung cửa gỗ, sổ tay và tách trà",
        width: "1200",
        height: "655",
        loading: "lazy",
        decoding: "async",
      }),
      h("figcaption", { class: "fb-photo__overlay" },
        h("span", { class: "fb-photo__caption" }, "Hoạt động tự chọn • Không chấm điểm"),
      ),
    ),
  );

  const lessonRow = h("div", { class: "fb-sec__row" });
  lessonRow.appendChild(h("span", { class: "fb-journey__lesson-label" }, "Bài học hôm nay:"));
  lessonRow.appendChild(h("span", { class: "fb-sec__sub" }, "3 phút đọc"));
  journey.appendChild(lessonRow);
  journey.appendChild(
    h("p", { class: "fb-journey__lesson" }, "“Khoảng dừng 60 giây trước khi nói lời tổn thương”"),
  );
  journey.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Lắng nghe nhịp tim và cho chính mình quyền im lặng trong một phút khi cảm thấy bị hiểu lầm.",
    ),
  );
  journey.appendChild(
    h("button", {
      class: "fb-btn fb-btn--primary fb-btn--lg fb-journey__cta",
      type: "button",
      onclick: () => ctx.navigate("/companion"),
    },
      createIcon({ name: "play_circle", size: 20 }),
      h("span", {}, "Bắt đầu khoảng dừng hôm nay"),
    ),
  );
  body.appendChild(journey);

  // 5) Lối tắt nhanh — chỉ dẫn tới route/module được support (thẻ cảm xúc
  //    F03 chưa nối -> tile disabled trung thực).
  const shortcuts = h("section", { class: "fb-sec" });
  shortcuts.appendChild(h("h2", { class: "fb-scard__title" }, "Lối tắt nhanh"));
  const tiles = h("div", { class: "fb-tiles" });

  const diaryTile = h("a", { class: "fb-tile", href: "#/diary" });
  const diaryIcon = h("span", { class: "fb-tile__icon fb-tile__icon--primary", "aria-hidden": "true" });
  diaryIcon.appendChild(createIcon({ name: "edit_note", size: 22, fill: true }));
  diaryTile.appendChild(diaryIcon);
  diaryTile.appendChild(h("span", { class: "fb-tile__label" }, "Viết nhật ký riêng"));
  diaryTile.appendChild(h("span", { class: "fb-tile__hint" }, "Bảo mật"));
  tiles.appendChild(diaryTile);

  const cardsTile = h("button", {
    class: "fb-tile",
    type: "button",
    disabled: true,
    title: "Tính năng thẻ cảm xúc sẽ có ở bản đầy đủ.",
  });
  const cardsIcon = h("span", { class: "fb-tile__icon fb-tile__icon--warm", "aria-hidden": "true" });
  cardsIcon.appendChild(createIcon({ name: "style", size: 22, fill: true }));
  cardsTile.appendChild(cardsIcon);
  cardsTile.appendChild(h("span", { class: "fb-tile__label" }, "Gửi thẻ cảm xúc"));
  cardsTile.appendChild(h("span", { class: "fb-tile__hint" }, "Sắp có"));
  tiles.appendChild(cardsTile);

  const mailboxTile = h("a", { class: "fb-tile", href: "#/mailbox" });
  const mailboxIcon = h("span", { class: "fb-tile__icon fb-tile__icon--amber", "aria-hidden": "true" });
  mailboxIcon.appendChild(createIcon({ name: "drafts", size: 22, fill: true }));
  mailboxTile.appendChild(mailboxIcon);
  mailboxTile.appendChild(h("span", { class: "fb-tile__label" }, "Hộp thư gia đình"));
  mailboxTile.appendChild(h("span", { class: "fb-tile__hint" }, "Lá thư chậm"));
  tiles.appendChild(mailboxTile);

  shortcuts.appendChild(tiles);
  body.appendChild(shortcuts);

  // 6) Thanh trợ giúp — dẫn về nguồn được duyệt (trang Trợ giúp), không tự
  //    nhét số hotline từ mẫu thiết kế.
  body.appendChild(renderHelpBar());
}

/** Sheet xem trước tín hiệu — GIỮ NGUYÊN hành vi/copy nền tảng (QA pin). */
function openSignalSheet(root, peer) {
  const notice = h(
    "p",
    { class: "fb-page__note", role: "status" },
    "Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ.",
  );

  const content = h("div", {},
    h("p", {}, "Đây là bản xem trước. Bạn có thể chọn người nhận để xem giao diện — chưa có tín hiệu nào được gửi đi."),
  );

  if (peer && peer.displayLabel) {
    content.appendChild(
      createButton({
        label: peer.displayLabel,
        variant: "primary",
        onClick: () => {
          notice.textContent = `Đã chọn: ${peer.displayLabel}. Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ.`;
        },
      }),
    );
  }

  content.appendChild(notice);

  openSheetIn(root, {
    title: "Con cần được lắng nghe",
    content,
  });
}

/** Thanh trợ giúp khẩn cấp dùng chung (U08). */
function renderHelpBar() {
  const bar = h("section", { class: "fb-help-bar" });
  const who = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-2);min-width:0;" });
  const heartCircle = h("span", { class: "fb-help-bar__heart", "aria-hidden": "true" });
  heartCircle.appendChild(createIcon({ name: "favorite", size: 20 }));
  who.appendChild(heartCircle);
  who.appendChild(
    h("div", { style: "display:flex;flex-direction:column;min-width:0;" },
      h("span", { class: "fb-help-bar__title" }, "Cần người chia sẻ ngay?"),
      h("span", { class: "fb-sec__sub" }, "Xem các kênh trợ giúp đã được xác minh"),
    ),
  );
  bar.appendChild(who);
  bar.appendChild(
    h("a", { class: "fb-help-bar__action", href: "#/help" },
      createIcon({ name: "call", size: 16 }),
      h("span", {}, "Tìm trợ giúp"),
    ),
  );
  return bar;
}

/* ---------------------------- Home người chăm sóc (U10) ---------------------------- */

function renderCaregiverHome(body, ctx, { isFixture }) {
  // 1) Tự chăm sóc bản thân — bộ chọn cảm xúc 4 mục (cục bộ, trung thực).
  const selfCare = h("section", { class: "fb-scard" });
  const selfHead = h("div", { class: "fb-sec__row" });
  const selfTitle = h("div", {});
  selfTitle.appendChild(
    h("span", { class: "fb-care__kicker" }, "Tự chăm sóc bản thân"),
  );
  selfTitle.appendChild(h("h2", { class: "fb-scard__title" }, "Ghi nhận cảm xúc của bạn hôm nay"));
  selfHead.appendChild(selfTitle);
  const spaCircle = h("span", { class: "fb-care__icon", "aria-hidden": "true" });
  spaCircle.appendChild(createIcon({ name: "spa", size: 22, fill: true }));
  selfHead.appendChild(spaCircle);
  selfCare.appendChild(selfHead);
  selfCare.appendChild(
    h("p", { class: "fb-care__reminder" },
      h("span", { class: "fb-care__reminder-strong" }, "Lời nhắc ấm áp: "),
      "Chăm sóc cảm xúc của chính mình là bước đầu tiên để lắng nghe con một cách trọn vẹn nhất.",
    ),
  );
  renderMoodPicker(selfCare, {
    warm: true,
    ariaLabel: "Ghi nhận cảm xúc của bạn",
    moods: [
      { emoji: "🌱", label: "An lòng" },
      { emoji: "🌧️", label: "Hơi mệt" },
      { emoji: "💭", label: "Băn khoăn" },
      { emoji: "☀️", label: "Biết ơn" },
    ],
  });
  body.appendChild(selfCare);

  // 2) Rust card: thư viện thẻ mở đầu (F03 chưa nối) — sheet trung thực,
  //    không tự khởi tạo gửi hay lời mời khi chỉ render thẻ.
  const rust = h("section", { class: "fb-rust-card" });
  rust.appendChild(h("span", { class: "fb-rust-card__halo", "aria-hidden": "true" }));
  const rustHead = h("div", { style: "display:flex;flex-direction:column;gap:var(--fb-space-1);position:relative;z-index:1;" });
  rustHead.appendChild(
    h("span", { class: "fb-rust-card__kicker" },
      createIcon({ name: "volunteer_activism", size: 16 }),
      h("span", {}, "Thư viện gợi ý mở đầu"),
    ),
  );
  rustHead.appendChild(h("h2", { class: "fb-rust-card__title" }, "Chủ động kết nối nhẹ nhàng"));
  rustHead.appendChild(
    h("p", { class: "fb-rust-card__body" },
      "Bạn chưa biết bắt đầu thế nào mà không làm con ngại? Thư viện thiệp và lời mở đầu sẽ có ở bản đầy đủ.",
    ),
  );
  rust.appendChild(rustHead);
  const rustCta = h("button", { class: "fb-btn-inverse", type: "button" });
  rustCta.appendChild(h("span", {}, "Mở lời với con"));
  rustCta.appendChild(createIcon({ name: "arrow_forward", size: 20 }));
  rustCta.addEventListener("click", () => {
    const note = h("p", { class: "fb-page__note", role: "status" },
      "Thư viện thẻ mở đầu sẽ sớm có ở bản đầy đủ. Trong lúc chờ, bạn có thể dùng hộp thư để nhắn cho con.");
    const content = h("div", {},
      h("p", {}, "Đây là bản xem trước giao diện — chưa gửi gì cho con."),
      note,
      createButton({
        label: "Mở hộp thư",
        variant: "primary",
        onClick: () => ctx.navigate("/mailbox"),
      }),
    );
    openSheetIn(body.closest(".fb-page") || body, {
      title: "Chủ động kết nối nhẹ nhàng",
      content,
    });
  });
  rust.appendChild(h("div", { style: "position:relative;z-index:1;padding-top:var(--fb-space-1);" }, rustCta));
  body.appendChild(rust);

  // 3) Hộp thư & tín hiệu — trạng thái thật (rỗng) với hình khối như mẫu.
  const inbox = h("section", { class: "fb-sec" });
  const inboxHead = h("div", { class: "fb-sec__row" });
  const inboxTitle = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" });
  inboxTitle.appendChild(createIcon({ name: "mark_email_unread", size: 20, fill: true, className: "fb-stitch-primary-icon" }));
  inboxTitle.appendChild(h("h2", { class: "fb-scard__title" }, "Tin nhắn & tín hiệu gửi riêng"));
  inboxHead.appendChild(inboxTitle);
  inboxHead.appendChild(h("span", { class: "fb-chip fb-chip--warm" }, "Chưa có mục mới"));
  inbox.appendChild(inboxHead);

  const inboxCard = h("section", { class: "fb-scard" });
  inboxCard.appendChild(
    h("p", { class: "fb-page__note" },
      "Chưa có tín hiệu mới. Khi con chủ động gửi thẻ cảm xúc hay lời nhắn, nội dung sẽ hiện tại đây.",
    ),
  );
  inboxCard.appendChild(
    createButton({
      label: "Mở hộp thư",
      variant: "primary",
      onClick: () => ctx.navigate("/mailbox"),
    }),
  );
  inbox.appendChild(inboxCard);
  body.appendChild(inbox);

  // 4) Cam kết tôn trọng không gian riêng của con.
  const trust = h("section", { class: "fb-scard fb-trust" });
  const trustRow = h("div", { style: "display:flex;align-items:flex-start;gap:var(--fb-space-3);" });
  const lockCircle = h("span", { class: "fb-trust__icon", "aria-hidden": "true" });
  lockCircle.appendChild(createIcon({ name: "lock", size: 22 }));
  trustRow.appendChild(lockCircle);
  trustRow.appendChild(
    h("div", { style: "display:flex;flex-direction:column;gap:4px;min-width:0;" },
      h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);flex-wrap:wrap;" },
        h("h3", { class: "fb-trust__title" }, "Tôn trọng không gian riêng của con"),
        h("span", { class: "fb-chip--safety fb-trust__chip" }, "Cam kết"),
      ),
      h("p", { class: "fb-sec__sub" },
        "Bạn chỉ nhìn thấy nội dung con chủ động chọn lọc và gửi trực tiếp. Family Bridge tuyệt đối ",
        h("strong", {}, "không có tính năng đọc lén, xem trộm nhật ký cá nhân hay theo dõi ngầm"),
        ". Niềm tin bắt đầu từ sự tôn trọng khoảng trời riêng của con.",
      ),
    ),
  );
  trust.appendChild(trustRow);
  body.appendChild(trust);

  // 5) Bài học ngắn 60 giây — nội dung mẫu từ thiết kế được duyệt (sẽ thay
  //    bằng nội dung Thầy duyệt trước pilot — US-047); nút xem thêm Sắp có.
  const lesson = h("section", { class: "fb-sec" });
  const lessonHead = h("div", { class: "fb-sec__row" });
  const lessonTitle = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" });
  lessonTitle.appendChild(createIcon({ name: "timer", size: 20, fill: true, className: "fb-stitch-tertiary-icon" }));
  lessonTitle.appendChild(h("h2", { class: "fb-scard__title" }, "Bài học ngắn 60 giây"));
  lessonHead.appendChild(lessonTitle);
  lessonHead.appendChild(h("span", { class: "fb-sec__sub" }, "1 phút đọc"));
  lesson.appendChild(lessonHead);

  const lessonCard = h("section", { class: "fb-scard" });
  lessonCard.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "headset_mic", size: 15 }),
      h("span", {}, "Kỹ năng cha mẹ thời Gen Z"),
    ),
  );
  lessonCard.appendChild(
    h("h3", { class: "fb-scard__title" }, "Lắng nghe không ngắt lời: 3 điều cần tránh khi con chia sẻ khó khăn"),
  );
  const items = h("div", { style: "display:flex;flex-direction:column;gap:var(--fb-space-2);" });
  [
    ["Đừng vội đưa giải pháp:", " Con thường cần giải tỏa cảm xúc trước khi tìm cách giải quyết vấn đề."],
    ["Tránh so sánh thời xưa:", " Cụm từ “Thời bố mẹ ngày xưa…” dễ làm con đóng chặt cánh cửa chia sẻ."],
    ["Không giảm nhẹ nỗi đau của con:", " “Chuyện có gì đâu mà khóc” khiến con cảm thấy mình không được thấu cảm."],
  ].forEach(([strong, rest], index) => {
    items.appendChild(
      h("div", { class: "fb-numbered" },
        h("span", { class: "fb-numbered__n", "aria-hidden": "true" }, String(index + 1)),
        h("p", { class: "fb-numbered__text" }, h("strong", {}, strong), rest),
      ),
    );
  });
  lessonCard.appendChild(items);
  lessonCard.appendChild(
    createButton({
      label: "Sắp có",
      variant: "ghost",
      disabled: true,
      title: "Tính năng bài học ngắn sẽ có ở bản đầy đủ.",
    }),
  );
  lesson.appendChild(lessonCard);
  body.appendChild(lesson);

  // 6) Hoạt động gia đình tuần 1 — tự nguyện, không tick giúp người dùng.
  const activity = h("section", { class: "fb-scard" });
  const activityHead = h("div", { class: "fb-sec__row" });
  activityHead.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "calendar_month", size: 15 }),
      h("span", {}, "Thử thách gắn kết • Tuần 1"),
    ),
  );
  activityHead.appendChild(
    h("span", { class: "fb-sec__sub", style: "display:inline-flex;align-items:center;gap:4px;" },
      createIcon({ name: "volunteer_activism", size: 14 }),
      "Hoàn toàn tự nguyện",
    ),
  );
  activity.appendChild(activityHead);
  activity.appendChild(
    h("figure", { class: "fb-photo" },
      h("img", {
        src: familyDinnerUrl,
        alt: "Mâm cơm gia đình ấm cúng dưới ánh đèn buổi tối, không có điện thoại trên bàn",
        width: "1200",
        height: "655",
        loading: "lazy",
        decoding: "async",
      }),
      h("figcaption", { class: "fb-photo__overlay" },
        h("span", { class: "fb-photo__caption fb-photo__caption--plain" },
          "Cùng con: Bữa tối 15 phút không dùng điện thoại",
        ),
      ),
    ),
  );
  activity.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Dành trọn vẹn 15 phút bên mâm cơm ấm cúng, cất điện thoại sang một bên để cùng nghe tiếng cười và những mẩu chuyện nhỏ ở trường của con.",
    ),
  );
  activity.appendChild(
    h("div", { class: "fb-connect__boundary" },
      h("div", { style: "display:flex;flex-direction:column;gap:2px;" },
        h("span", { class: "fb-connect__boundary-title" }, "Mẹ đã sẵn sàng thử hôm nay?"),
        h("span", { class: "fb-sec__sub" }, "Không áp lực hoàn thành hay tính điểm"),
      ),
      createButton({
        label: "Sắp có",
        variant: "ghost",
        disabled: true,
        title: "Ghi nhận tham gia hoạt động sẽ có ở bản đầy đủ — bạn luôn tự nguyện.",
      }),
    ),
  );
  body.appendChild(activity);

  // 7) Footer ghi chú + thanh trợ giúp.
  body.appendChild(
    h("footer", { class: "fb-page-footer" },
      h("p", { class: "fb-sec__sub" }, "Family Bridge • Đồng hành xây đắp cầu nối thế hệ yêu thương"),
      h("div", { class: "fb-page-footer__line", "aria-hidden": "true" }),
    ),
  );
  body.appendChild(renderHelpBar());

  if (isFixture) {
    // Nhãn minh họa đã ở DemoBanner đầu trang — nhắc lại ở cuối cho rõ.
    body.appendChild(
      h("p", { class: "fb-page__note", role: "status" }, "Dữ liệu minh họa — chế độ xem trước."),
    );
  }
}

/* --------------------------- Chưa kết nối (production) --------------------------- */

function renderNeedsLogin(body, ctx) {
  clear(body);
  body.appendChild(h("h1", { class: "fb-sec__greeting" }, "Xin chào!"));
  body.appendChild(
    createEmptyState({
      title: "Chưa đăng nhập",
      description:
        "Đăng nhập bằng tài khoản Zalo để tạo phiên riêng của bạn. " +
        "Chúng tôi chỉ nhận mã định danh Zalo, không xin quyền đọc thông tin cá nhân.",
      action: {
        label: "Đăng nhập",
        onClick: () => ctx.navigate("/login"),
      },
    }),
  );
  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Tìm trợ giúp luôn truy cập được mà không cần đăng nhập.",
    ),
  );
}

function renderLoadError(body, ctx, error) {
  clear(body);
  body.appendChild(
    createErrorState({
      title: "Không tải được trang chủ",
      description: error && error.kind === "timeout"
        ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
        : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

function renderConnectedProduction(body, ctx, role, rows) {
  clear(body);

  // A11: KHÔNG chọn mù rows[0] — ưu tiên kết nối "primary" nếu có nhiều;
  // khi có nhiều kết nối cùng hoạt động, nêu rõ số lượng để không khiến
  // người dùng nhầm người đồng hành.
  const primary = rows.find((row) => row && row.relationship_kind === "primary")
    || rows[0];
  const kindLabel = primary && primary.relationship_kind === "backup"
    ? "Người hỗ trợ dự phòng"
    : "Người đồng hành chính";
  const peerName = primary && primary.counterpart && primary.counterpart.display_name
    ? String(primary.counterpart.display_name)
    : "Người đồng hành";
  const countNote = rows.length > 1
    ? ` Hiện có ${rows.length} kết nối đang hoạt động — xem tất cả trong "Quản lý kết nối".`
    : "";

  renderGreeting(body, {
    displayName: (getSession() && getSession().displayName) || "",
    role,
  });

  // Thẻ kết nối (hình khối U08/U10, dữ liệu thật từ backend).
  const connectCard = h("section", { class: "fb-scard" });
  const connectHead = h("div", { class: "fb-sec__row" });
  const connectWho = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" });
  const familyCircle = h("span", { class: "fb-connect__icon", "aria-hidden": "true" });
  familyCircle.appendChild(createIcon({ name: "family_restroom", size: 26 }));
  connectWho.appendChild(familyCircle);
  const whoText = h("div", { style: "display:flex;flex-direction:column;min-width:0;" });
  whoText.appendChild(h("span", { class: "fb-scard__title fb-connect__name" }, peerName));
  whoText.appendChild(
    h("span", { class: "fb-sec__sub fb-connect__status" },
      h("span", { class: "fb-connect__dot", "aria-hidden": "true" }),
      ` ${kindLabel}${primary && primary.generation ? `, thế hệ ${primary.generation}` : ""}`,
    ),
  );
  connectWho.appendChild(whoText);
  connectHead.appendChild(connectWho);
  connectHead.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "verified_user", size: 14, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Ranh giới riêng tư"),
    ),
  );
  connectCard.appendChild(connectHead);
  connectCard.appendChild(
    h("p", { class: "fb-page__note" },
      "Bạn có một kết nối đang hoạt động." + countNote +
      " Chúng tôi hiển thị kết nối mà không lộ thông tin cá nhân của hai bên.",
    ),
  );
  connectCard.appendChild(
    createButton({
      label: "Quản lý kết nối",
      variant: "ghost",
      onClick: () => ctx.navigate("/connect"),
    }),
  );
  body.appendChild(connectCard);

  if (role === "student") {
    renderStudentHome(body, ctx, { peer: null, peerLabel: peerName });
  } else {
    renderCaregiverHome(body, ctx, { isFixture: false });
  }
}

function renderNotConnected(body, ctx) {
  clear(body);

  body.appendChild(h("h1", { class: "fb-sec__greeting" }, "Xin chào!"));

  body.appendChild(
    createEmptyState({
      title: "Chưa kết nối với người đồng hành",
      description:
        "Hai bên sẽ kết nối với nhau bằng một mã mời riêng và xác nhận hai chiều. " +
        "Bạn có thể tạo mã mời hoặc nhập mã nhận được ngay bây giờ.",
      action: {
        label: "Kết nối với người đồng hành",
        onClick: () => ctx.navigate("/connect"),
      },
    }),
  );

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Kết nối không cho phép đọc nhật ký hay dữ liệu riêng của nhau — mọi mục chia sẻ vẫn do bạn quyết định.",
    ),
  );

  body.appendChild(renderHelpBar());
}
