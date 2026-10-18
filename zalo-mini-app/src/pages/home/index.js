// Home (w08 student / w09 caregiver) — Web Render Task 2, dữ liệu THẬT.
// Tham chiếu Stitch: stitch_family_bridge_web_design_system/
//   w08_trang_ch_h_c_sinh/ + w09_trang_ch_ng_i_ch_m_s_c/.
//
// Trang được bọc trong app-shell (page.chrome = "app" — router M1 tự bọc,
// KHÔNG render createAppHeader riêng nữa).
//
// Sự thật dữ liệu (hợp đồng worklog Task 19):
//   - Kết nối: listConnections() thật (production) / fixture (demo, có
//     DemoBanner). Không fake-success, không fallback mock khi lỗi.
//   - Cảm xúc: 5 pill bunbind MÃ CẢM XÚC THẬT của backend F07
//     (packages/family_bridge_features/f07_mood/models.py: vui, binh_an,
//     met, buon, lo, buc, kho_noi) → POST /api/v1/mood/entries. Nhãn hiển
//     thị là EMOTION_LABELS tiếng Việt của máy chủ (Stitch w08 dùng nhãn
//     khác — Deviation đã ghi trong báo cáo task-3b2).
//   - Trạng thái chọn hôm nay: GET /api/v1/mood/entries (listMoodEntries),
//     so entry_date == ngày VN hôm nay; không có endpoint hôm-nay riêng →
//     client so sánh trung thực trên dữ liệu đã tải.
//   - Chương trình: programMy() (+ opted-out) → chưa tham gia hiển thị
//     trung thực, KHÔNG gauge phần trăm, KHÔNG bịa số bước.
//   - Hộp thư: listMessages chỉ metadata (không body); "Mới" chỉ khi
//     received && !read.
//   - 401 → /login?reason=expired; lỗi khác → ErrorState + thử lại.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession, getSession } from "../../core/session.js";
import {
  createButton,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createIcon,
  createSkeleton,
} from "../../components/index.js";

// ---- Hợp đồng backend F07: mã cảm xúc cho phép (đọc trực tiếp từ repo) ----
const MOOD_PILLS = [
  { code: "vui", label: "Vui", hint: "Một điều ấm áp" },
  { code: "binh_an", label: "Bình an", hint: "Nhẹ nhõm và bình yên" },
  { code: "lo", label: "Lo lắng", hint: "Nhiều gánh nặng" },
  { code: "met", label: "Mệt", hint: "Cần được nạp lại năng lượng" },
  { code: "kho_noi", label: "Khó nói thành lời", hint: "Có điều khó nói" },
];

// kind của F05 MessageTransport (packages/.../f05_inbox/models.py KINDS).
const MESSAGE_KIND_LABELS = {
  text: "Lời nhắn",
  emotion_card: "Thẻ cảm xúc",
  listening_signal: "Tín hiệu lắng nghe",
  journal_reply: "Phản hồi nhật ký",
  mood_reply: "Phản hồi cảm xúc",
  quick_reply: "Trả lời nhanh",
};

/** ctx.store có thể là snapshot hoặc module store — đọc state an toàn. */
function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
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

/** Ngày hôm nay theo múi giờ VN (định dạng YYYY-MM-DD) để so entry_date. */
function todayVnIso() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Nhãn thời gian trung thực: "Hôm nay, 16:45" / "Hôm qua, 20:15" / ngày. */
function messageTimeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const vnDay = (d) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };
  const day = vnDay(date);
  const time = (() => {
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return "";
    }
  })();
  if (day === todayVnIso()) return time ? `Hôm nay, ${time}` : "Hôm nay";
  const yesterday = new Date(date.getTime() - 24 * 3600 * 1000);
  if (day === vnDay(yesterday)) return time ? `Hôm qua, ${time}` : "Hôm qua";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "numeric",
      month: "numeric",
    }).format(date);
  } catch {
    return day;
  }
}

function messageKindLabel(kind) {
  return MESSAGE_KIND_LABELS[kind] || "Trao đổi";
}

/** Trạng thái hoạt động tuần (F02 WeekProgress: done | skipped | reset|none). */
function activityStatusLabel(status) {
  if (status === "done") return "Hoàn thành";
  if (status === "skipped") return "Đã bỏ qua";
  return "Chưa làm";
}

export const page = {
  id: "u08-home", // w08 student + w09 caregiver — dispatch theo vai trò
  title: "Trang chủ",
  requiresRole: true,
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web (router M1); không header riêng

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const role = state.role;

    const root = h("div", {
      class: "fb-page fb-page--web",
      dataset: { page: "u08-home" },
    });
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

    body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải trang chủ…"));

    const currentRun = ++runId;

    // Mọi dữ liệu home được nạp SONG SONG; từng phần lỗi → null (hiển thị
    // ghi chú trung thực trong thẻ đó) — CHỈ lỗi kết nối chính mới chặn trang.
    const demoStatusPromise = demo
      ? Promise.resolve()
          .then(() => ctx.adapter.getConnectionStatus())
          .then((status) => ({ source: "fixture", status }))
      : null;
    const profilePromise = demo
      ? Promise.resolve()
          .then(() => ctx.adapter.getProfile(role))
          .catch(() => null)
      : null;
    const mailboxPromise = Promise.resolve()
      .then(() => ctx.adapter.listMessages({ limit: role === "student" ? 3 : 20 }))
      .then((pageData) => pageData && Array.isArray(pageData.results) ? pageData.results : [])
      .then(async (rows) => {
        if (role !== "caregiver") return { rows, detail: null };
        const firstReceived = rows.find(
          (row) => row && row.direction === "received",
        );
        if (!firstReceived) return { rows, detail: null };
        const detail = await Promise.resolve()
          .then(() => ctx.adapter.getMessage(firstReceived.message_id))
          .catch(() => null);
        return { rows, detail };
      })
      .catch(() => null);
    const programPromise = Promise.resolve()
      .then(() => ctx.adapter.programMy())
      .then((data) => {
        const rows = (data && Array.isArray(data.results) ? data.results : [])
          .filter((row) => row && row.active);
        const enrollment = rows[0] || null;
        if (!enrollment) return { enrollment: null, weeks: null };
        return Promise.resolve()
          .then(() => ctx.adapter.programWeeks(enrollment.program_key))
          .then((weeks) => ({ enrollment, weeks: weeks || null }))
          .catch(() => ({ enrollment, weeks: null }));
      })
      .catch(() => null);
    const moodPromise = Promise.resolve()
      .then(() => ctx.adapter.listMoodEntries({ limit: 5 }))
      .then((data) => (data && Array.isArray(data.results) ? data.results : []))
      .catch(() => null);
    const lessonPromise = role === "caregiver"
      ? Promise.resolve()
          .then(() => ctx.adapter.activitiesCatalog({ kind: "micro_lesson", audience: "caregiver" }))
          .then((data) => (data && Array.isArray(data.results) ? data.results : []))
          .catch(() => null)
      : Promise.resolve(null);
    // F16: đề xuất ghép đôi từ lớp học — chỉ production (demo dùng fixture
    // "đã kết nối"). Một request có bound (limit 20); lỗi → null (không chặn
    // trang chủ, thẻ entry trung thực riêng bên dưới).
    const proposalsPromise = demo
      ? Promise.resolve(null)
      : Promise.resolve()
          .then(() => ctx.adapter.listClassProposals({ limit: 20 }))
          .then((data) => (data && Array.isArray(data.results) ? data.results : []))
          .catch(() => null);

    Promise.all([
      demo ? demoStatusPromise : Promise.resolve(null),
      demo ? profilePromise : Promise.resolve(null),
      demo ? Promise.resolve(null) :
        Promise.resolve()
          .then(() => ctx.adapter.listConnections({ limit: 20 }))
          .then((pageData) => ({ source: "backend", rows: (pageData && pageData.results) || [] })),
      mailboxPromise,
      programPromise,
      moodPromise,
      lessonPromise,
      proposalsPromise,
    ])
      .then(([demoStatus, profile, backendStatus, mailbox, program, mood, lessons, proposals]) => {
        if (cancelled || currentRun !== runId) return;
        const connection = backendStatus || demoStatus;
        if (!connection) throw new Error("connection_unavailable");
        if (connection.source === "backend") {
          const rows = connection.rows || [];
          renderHome(body, ctx, {
            role,
            demo,
            connected: rows.length > 0,
            rows,
            profile: null,
            mailbox,
            program,
            mood,
            lessons,
            proposals: Array.isArray(proposals) ? proposals : null,
          });
          return;
        }
        // Demo fixture: luôn "đã kết nối" với peer minh họa.
        renderHome(body, ctx, {
          role,
          demo,
          connected: true,
          rows: [],
          fixturePeer: connection.status && connection.status.peer,
          profile,
          mailbox,
          program,
          mood,
          lessons,
          proposals: null,
        });
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

/* ------------------------------ Dựng home chung ------------------------------ */

function renderHome(body, ctx, data) {
  clear(body);
  const isFixture = Boolean(data.demo);

  if (isFixture) body.appendChild(createDemoBanner());

  const displayName = data.profile && data.profile.displayName
    ? String(data.profile.displayName)
    : ((getSession() && getSession().displayName) || "");

  // Production chưa có kết nối: hiện đề xuất ghép đôi từ lớp (nếu có) rồi
  // mời sang /connect — không dựng phần home đã kết nối (trung thực).
  if (!data.connected) {
    renderGreeting(body, { displayName, role: data.role });
    renderProposalEntry(body, ctx, data.proposals);
    renderNotConnected(body, ctx);
    return;
  }

  renderGreeting(body, { displayName, role: data.role });

  if (data.role === "student") {
    renderStudentHome(body, ctx, data);
  } else {
    renderCaregiverHome(body, ctx, data);
  }
}

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
      h("h1", { class: "fb-sec__greeting" }, name ? `Chào ${name},` : "Chào anh/chị,"),
    );
    section.appendChild(
      h("p", { class: "fb-sec__sub" }, "Dành một khoảng tĩnh lặng để cùng thấu hiểu và đồng hành."),
    );
  }
  body.appendChild(section);
}

/* ------------------------- Thẻ kết nối (dữ liệu thật) ------------------------- */

/**
 * data.rows: kết nối active thật; data.fixturePeer: peer minh họa (demo).
 * Trả peerLabel để các thẻ khác dùng (tên người đồng hành tự khai báo).
 */
function renderConnectionCard(body, ctx, data) {
  let peerLabel;
  let statusText;
  let extraNote = "";

  if (data.fixturePeer) {
    peerLabel = data.fixturePeer.displayLabel || "Người đồng hành (minh họa)";
    statusText = `Đã kết nối cùng ${peerLabel}`;
    extraNote = `Đang đồng hành với: ${peerLabel}`;
  } else {
    // A11: ưu tiên kết nối "primary"; khi có nhiều kết nối cùng hoạt động,
    // nêu rõ số lượng để không khiến người dùng nhầm người đồng hành.
    const primary = data.rows.find((row) => row && row.relationship_kind === "primary")
      || data.rows[0];
    const kindLabel = primary && primary.relationship_kind === "backup"
      ? "Người hỗ trợ dự phòng"
      : "Người đồng hành chính";
    const peerName = primary && primary.counterpart && primary.counterpart.display_name
      ? String(primary.counterpart.display_name)
      : "Người đồng hành";
    peerLabel = peerName;
    statusText = `Đã kết nối cùng ${peerName}`;
    extraNote = data.rows.length > 1
      ? `Đang đồng hành với: ${peerName} — bạn có ${data.rows.length} kết nối đang hoạt động.`
      : `Đang đồng hành với: ${peerName} (${kindLabel}) — kết nối đang hoạt động.`;
  }

  const card = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  const who = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" });
  const circle = h("span", { class: "fb-connect__icon", "aria-hidden": "true" });
  circle.appendChild(createIcon({ name: "family_restroom", size: 26 }));
  who.appendChild(circle);
  const whoText = h("div", { style: "display:flex;flex-direction:column;min-width:0;" });
  whoText.appendChild(h("span", { class: "fb-scard__title fb-connect__name" }, statusText));
  whoText.appendChild(
    h("span", { class: "fb-sec__sub fb-connect__status" },
      h("span", { class: "fb-connect__dot", "aria-hidden": "true" }),
      " Kết nối hai phía đang hoạt động",
    ),
  );
  who.appendChild(whoText);
  head.appendChild(who);
  head.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "verified_user", size: 14, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Ranh giới riêng tư"),
    ),
  );
  card.appendChild(head);
  card.appendChild(h("p", { class: "fb-page__note" }, extraNote));
  card.appendChild(
    h("p", { class: "fb-page__note" },
      "Chỉ những thông điệp bạn chủ động bấm gửi mới đến được người đồng hành.",
    ),
  );
  if (!data.fixturePeer) {
    card.appendChild(
      createButton({
        label: "Quản lý kết nối",
        variant: "ghost",
        onClick: () => ctx.navigate("/connect"),
      }),
    );
  }
  body.appendChild(card);
  return peerLabel;
}

/* --------------------------- Cảm xúc (F07 thật) --------------------------- */

function renderMoodCard(body, ctx, { kicker, title, moodResults }) {
  const todayIso = todayVnIso();
  const todayEntry = Array.isArray(moodResults)
    ? moodResults.find((row) => row && row.entry_date === todayIso)
    : null;

  const card = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  const titleWrap = h("div", {});
  if (kicker) titleWrap.appendChild(h("span", { class: "fb-care__kicker" }, kicker));
  titleWrap.appendChild(h("h2", { class: "fb-scard__title" }, title));
  head.appendChild(titleWrap);
  head.appendChild(
    h("span", { class: "fb-chip" },
      createIcon({ name: "lock", size: 14 }),
      h("span", {}, "Chỉ mình bạn thấy ghi chú"),
    ),
  );
  card.appendChild(head);

  card.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Không có cảm xúc nào là đúng hay sai. Mọi cảm xúc đều đáng được lắng nghe.",
    ),
  );

  const feedback = h("div", { class: "fb-mood-feedback", role: "status" });
  const grid = h("div", {
    class: "fb-mood-grid fb-mood-grid--4",
    role: "group",
    "aria-label": "Ghi nhận cảm xúc hôm nay",
  });

  MOOD_PILLS.forEach(({ code, label, hint }) => {
    const btn = h("button", {
      class: "fb-mood fb-mood--warm",
      type: "button",
      dataset: { emotion: code },
      "aria-pressed": todayEntry && todayEntry.emotion === code ? "true" : "false",
    },
      h("span", { class: "fb-mood__label" }, label),
      h("span", { class: "fb-sec__sub" }, hint),
    );
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".fb-mood").forEach((other) => other.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      clear(feedback);
      feedback.appendChild(h("span", {}, `Đang ghi nhận cảm xúc “${label}”…`));
      feedback.hidden = false;
      Promise.resolve()
        .then(() => ctx.adapter.createMoodEntry({ emotion: code }))
        .then((entry) => {
          clear(feedback);
          feedback.appendChild(
            h("span", {},
              `Bạn vừa ghi nhận “${(entry && entry.emotion_label) || label}” vào ngày ${todayIso}. `
              + "Ghi chú cảm xúc chỉ mình bạn thấy.",
            ),
          );
        })
        .catch((error) => {
          btn.setAttribute("aria-pressed", "false");
          clear(feedback);
          if (error && error.details && error.details.reason === "entry_already_exists_use_edit") {
            const link = h("a", { href: "#/mood", class: "fb-sec__sub" },
              "Mở Tâm trạng của mình để sửa mục hôm nay.");
            feedback.appendChild(
              h("span", {},
                `Hôm nay (${todayIso}) bạn đã ghi nhận cảm xúc rồi — mỗi ngày một ghi nhận. `,
              ),
            );
            feedback.appendChild(link);
          } else if (error && error.kind === "timeout") {
            feedback.appendChild(
              h("span", {}, "Kết nối quá thời gian chờ. Vui lòng thử lại."),
            );
          } else {
            feedback.appendChild(
              h("span", {}, "Chưa ghi được cảm xúc vào máy chủ. Vui lòng thử lại."),
            );
          }
        });
    });
    grid.appendChild(btn);
  });

  card.appendChild(grid);
  if (todayEntry) {
    feedback.appendChild(
      h("span", {},
        `Hôm nay bạn đã ghi nhận: ${(todayEntry.emotion_label
          || (MOOD_PILLS.find((m) => m.code === todayEntry.emotion) || {}).label
          || todayEntry.emotion)}.`,
      ),
    );
    feedback.hidden = false;
  } else if (Array.isArray(moodResults)) {
    feedback.appendChild(
      h("span", {}, "Hôm nay chưa có ghi nhận cảm xúc nào."),
    );
  } else {
    feedback.appendChild(
      h("span", {}, "Chưa tải được lịch sử cảm xúc — chọn pill để ghi nhận mới."),
    );
  }
  card.appendChild(feedback);

  // Đường đi rõ sang trang F07 đầy đủ (lịch sử/sửa/chia sẻ từng mục) —
  // quick mood giữ nguyên hành vi, không tạo entry thứ hai cho hôm nay.
  card.appendChild(
    h("a", { href: "#/mood", class: "fb-sec__sub" },
      "Xem lịch sử, sửa và chia sẻ từng mục →"),
  );
  body.appendChild(card);
}

/* ------------------------------ Home học sinh (w08) ------------------------------ */

function renderStudentHome(body, ctx, data) {
  const peerLabel = renderConnectionCard(body, ctx, data);

  // 1) Cảm xúc lúc này — ghi nhận thật qua F07.
  renderMoodCard(body, ctx, {
    title: "Cảm xúc lúc này",
    moodResults: data.mood,
  });

  // 2) Hành động mở lời (w08): thẻ cảm xúc / soạn lời / tín hiệu.
  const actions = h("section", { class: "fb-scard" });
  actions.appendChild(
    h("h2", { class: "fb-scard__title" }, "Mở lời nhẹ nhàng"),
  );
  const tiles = h("div", { class: "fb-tiles" });

  const cardsTile = h("a", { class: "fb-tile", href: "#/cards" });
  const cardsIcon = h("span", { class: "fb-tile__icon fb-tile__icon--warm", "aria-hidden": "true" });
  cardsIcon.appendChild(createIcon({ name: "style", size: 22, fill: true }));
  cardsTile.appendChild(cardsIcon);
  cardsTile.appendChild(h("span", { class: "fb-tile__label" }, "Thư viện thẻ cảm xúc"));
  cardsTile.appendChild(h("span", { class: "fb-tile__hint" }, "Chọn mẫu, bạn duyệt trước khi gửi"));
  tiles.appendChild(cardsTile);

  const composeTile = h("a", { class: "fb-tile", href: "#/compose" });
  const composeIcon = h("span", { class: "fb-tile__icon fb-tile__icon--primary", "aria-hidden": "true" });
  composeIcon.appendChild(createIcon({ name: "edit_note", size: 22, fill: true }));
  composeTile.appendChild(composeIcon);
  composeTile.appendChild(h("span", { class: "fb-tile__label" }, "Soạn lời nhắn"));
  composeTile.appendChild(h("span", { class: "fb-tile__hint" }, "Có khoảng dừng 5 phút trước khi gửi"));
  tiles.appendChild(composeTile);

  const signalTile = h("a", { class: "fb-tile fb-tile--amber", href: "#/signal" });
  const signalIcon = h("span", { class: "fb-tile__icon fb-tile__icon--amber", "aria-hidden": "true" });
  signalIcon.appendChild(createIcon({ name: "hearing", size: 22, fill: true }));
  signalTile.appendChild(signalIcon);
  signalTile.appendChild(h("span", { class: "fb-tile__label" }, "Con cần được lắng nghe"));
  signalTile.appendChild(h("span", { class: "fb-tile__hint" }, "Gửi tín hiệu bằng một lần chạm xác nhận"));
  tiles.appendChild(signalTile);

  actions.appendChild(tiles);
  body.appendChild(actions);

  // 3) Hộp thư trao đổi gần đây — metadata thật, không body trong danh sách.
  body.appendChild(renderMailboxPreview(ctx, data));

  // 4) Hành trình 4 tuần — dữ liệu thật từ F02, không gauge.
  body.appendChild(renderProgramCard(ctx, data));

  // 5) Nhật ký riêng tư — dẫn sang trang nhật ký (stub trung thực còn giữ).
  const journal = h("section", { class: "fb-scard" });
  journal.appendChild(
    h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" },
      createIcon({ name: "menu_book", size: 20, className: "fb-stitch-primary-icon" }),
      h("h2", { class: "fb-scard__title" }, "Nhật ký riêng tư của bạn"),
    ),
  );
  journal.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Góc ghi chép riêng của bạn. Người đồng hành và giáo viên không thể xem nếu bạn không chủ động bấm chia sẻ.",
    ),
  );
  journal.appendChild(
    createButton({
      label: "Mở nhật ký cá nhân",
      variant: "ghost",
      onClick: () => ctx.navigate("/diary"),
    }),
  );
  body.appendChild(journal);

  // 6) Thanh trợ giúp — dẫn về nguồn được duyệt (trang Trợ giúp), không tự
  //    nhét số hotline từ mẫu thiết kế.
  body.appendChild(renderHelpBar());
}

/** Hộp thư preview: listMessages metadata; "Mới" chỉ khi received && !read. */
function renderMailboxPreview(ctx, data) {
  const section = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  head.appendChild(
    h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" },
      createIcon({ name: "mark_email_unread", size: 20, fill: true, className: "fb-stitch-primary-icon" }),
      h("h2", { class: "fb-scard__title" }, "Hộp thư trao đổi gần đây"),
    ),
  );
  section.appendChild(head);
  section.appendChild(
    h("p", { class: "fb-sec__sub" }, "Không áp lực trả lời ngay — giữ nhịp tâm tình từ tốn."),
  );

  const mailbox = data.mailbox;
  if (mailbox === null) {
    section.appendChild(
      h("p", { class: "fb-page__note", role: "status" },
        "Chưa tải được hộp thư. Mở Hộp thư để xem trực tiếp.",
      ),
    );
    return section;
  }

  const rows = (mailbox.rows || []).slice(0, 3);
  if (!rows.length) {
    section.appendChild(
      h("p", { class: "fb-page__note" },
        "Chưa có trao đổi nào trong hộp thư. Khi hai bên nhắn tin, nội dung sẽ hiện ở đây.",
      ),
    );
  } else {
    const list = h("ul", { class: "fb-mail-list" });
    rows.forEach((row) => {
      const isUnread = row.direction === "received" && !row.read;
      const item = h("li", { class: "fb-mail-list__row" });
      const main = h("a", {
        class: "fb-mail-list__link",
        href: row.direction === "received" ? `#/messages/${encodeURIComponent(row.message_id)}` : "#/mailbox",
      });
      main.appendChild(
        h("span", { class: "fb-mail-list__title" },
          row.title ? String(row.title) : messageKindLabel(row.kind),
        ),
      );
      main.appendChild(
        h("span", { class: "fb-sec__sub" },
          row.direction === "sent"
            ? `Gửi lúc ${messageTimeLabel(row.created_at)}`
            : messageTimeLabel(row.created_at),
        ),
      );
      item.appendChild(main);
      if (isUnread) {
        item.appendChild(h("span", { class: "fb-chip fb-chip--high" }, "Mới"));
      }
      list.appendChild(item);
    });
    section.appendChild(list);
  }
  section.appendChild(
    h("a", { class: "fb-btn fb-btn--ghost", href: "#/mailbox" }, "Mở hộp thư"),
  );
  return section;
}

/** Chương trình 4 tuần (F02): trung thực — không gauge, không số bịa. */
function renderProgramCard(ctx, data) {
  const section = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  head.appendChild(
    h("div", {},
      h("span", { class: "fb-journey__kicker" }, "Hành trình 4 tuần"),
      h("h2", { class: "fb-scard__title" }, "Không gian thấu hiểu bản thân"),
    ),
  );
  head.appendChild(
    h("span", { class: "fb-chip" }, "Tinh thần tự nguyện"),
  );
  section.appendChild(head);

  const program = data.program;
  if (program === null) {
    section.appendChild(
      h("p", { class: "fb-page__note", role: "status" },
        "Chưa tải được trạng thái chương trình. Vui lòng thử lại sau.",
      ),
    );
    return section;
  }

  if (!program.enrollment) {
    section.appendChild(
      h("p", { class: "fb-sec__sub" },
        "Chưa tham gia chương trình 4 tuần. Nếu bạn muốn, có thể tìm hiểu ở mục Đồng hành — hoàn toàn tự nguyện, không áp lực.",
      ),
    );
    section.appendChild(
      createButton({
        label: "Xem mục Đồng hành",
        variant: "ghost",
        onClick: () => ctx.navigate("/companion"),
      }),
    );
    return section;
  }

  const weeks = program.weeks && Array.isArray(program.weeks.weeks)
    ? program.weeks.weeks
    : [];
  if (!weeks.length) {
    section.appendChild(
      h("p", { class: "fb-page__note" },
        "Bạn đã tham gia chương trình nhưng máy chủ chưa trả được danh sách tuần. Vui lòng thử lại sau.",
      ),
    );
    return section;
  }

  const suggestedWeekNo = program.weeks.suggested_week || null;
  const currentWeek = weeks.find((week) => week.week_no === suggestedWeekNo) || weeks[0];
  section.appendChild(
    h("p", { class: "fb-sec__sub" },
      `Tuần ${currentWeek.week_no}: ${currentWeek.title} — gợi ý theo tiến độ của bạn, không khóa tuần nào.`,
    ),
  );
  const steps = h("ul", { class: "fb-step-list" });
  (currentWeek.activities || []).forEach((activity) => {
    steps.appendChild(
      h("li", { class: "fb-step-list__row" },
        h("span", { class: "fb-step-list__key" }, String(activity.activity_key)),
        h("span", { class: "fb-sec__sub" }, activityStatusLabel(activity.status)),
      ),
    );
  });
  if ((currentWeek.activities || []).length) {
    section.appendChild(steps);
  } else {
    section.appendChild(
      h("p", { class: "fb-page__note" }, "Tuần này chưa có hoạt động nào được đăng tải."),
    );
  }
  section.appendChild(
    h("p", { class: "fb-page__note" },
      `Đang theo chương trình ${program.enrollment.program_key} (bản ${program.enrollment.program_revision}). `
      + "Tự nguyện thực hiện — không tính điểm thi đua.",
    ),
  );
  return section;
}

/** Thanh trợ giúp khẩn cấp dùng chung (w08/w09). */
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

/* ---------------------------- Home người chăm sóc (w09) ---------------------------- */

function renderCaregiverHome(body, ctx, data) {
  renderConnectionCard(body, ctx, data);

  // 1) Lời nhắn mới nhất từ con (metadata + body của MỘT thư đã tải) —
  //    kèm callout an toàn: đây là nội dung con chủ động gửi.
  body.appendChild(renderCaregiverLatestMessage(ctx, data));

  // 2) Hành động nhanh.
  const actions = h("section", { class: "fb-scard" });
  actions.appendChild(h("h2", { class: "fb-scard__title" }, "Việc bạn có thể làm ngay"));
  const tiles = h("div", { class: "fb-tiles" });
  const composeTile = h("a", { class: "fb-tile", href: "#/compose" });
  const composeIcon = h("span", { class: "fb-tile__icon fb-tile__icon--primary", "aria-hidden": "true" });
  composeIcon.appendChild(createIcon({ name: "edit_note", size: 22, fill: true }));
  composeTile.appendChild(composeIcon);
  composeTile.appendChild(h("span", { class: "fb-tile__label" }, "Soạn lời nhắn"));
  composeTile.appendChild(h("span", { class: "fb-tile__hint" }, "Gửi kèm thẻ cảm xúc nếu muốn"));
  tiles.appendChild(composeTile);
  const signalTile = h("a", { class: "fb-tile", href: "#/signal" });
  const signalIcon = h("span", { class: "fb-tile__icon fb-tile__icon--amber", "aria-hidden": "true" });
  signalIcon.appendChild(createIcon({ name: "hearing", size: 22, fill: true }));
  signalTile.appendChild(signalIcon);
  signalTile.appendChild(h("span", { class: "fb-tile__label" }, "Tín hiệu từ con"));
  signalTile.appendChild(h("span", { class: "fb-tile__hint" }, "Xác nhận đã nhận tín hiệu"));
  tiles.appendChild(signalTile);
  actions.appendChild(tiles);
  body.appendChild(actions);

  // 3) Bài học 60 giây — từ catalog F09 thật; rỗng thì nói rỗng.
  body.appendChild(renderCaregiverLesson(data));

  // 4) Góc tự suy ngẫm — ghi nhận cảm xúc thật (F07) + dẫn sang nhật ký.
  renderMoodCard(body, ctx, {
    kicker: "Tự chăm sóc bản thân",
    title: "Ghi nhận cảm xúc của bạn hôm nay",
    moodResults: data.mood,
  });

  const reflection = h("section", { class: "fb-scard" });
  reflection.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Làm cha mẹ là một hành trình cần nhiều nhẫn nại. Góc tự suy ngẫm của bạn nằm trong nhật ký riêng tư.",
    ),
  );
  reflection.appendChild(
    createButton({
      label: "Mở nhật ký cá nhân",
      variant: "ghost",
      onClick: () => ctx.navigate("/diary"),
    }),
  );
  body.appendChild(reflection);

  // 5) Cam kết tôn trọng không gian riêng của con (giữ nguyên copy tốt).
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

  body.appendChild(renderHelpBar());

  if (data.demo) {
    body.appendChild(
      h("p", { class: "fb-page__note", role: "status" }, "Dữ liệu minh họa — chế độ xem trước."),
    );
  }
}

/** Thẻ lời nhắn mới nhất của con (w09) — body chỉ từ getMessage thật. */
function renderCaregiverLatestMessage(ctx, data) {
  const section = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  head.appendChild(
    h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" },
      createIcon({ name: "mark_email_unread", size: 20, fill: true, className: "fb-stitch-primary-icon" }),
      h("h2", { class: "fb-scard__title" }, "Lời nhắn gửi đến anh/chị"),
    ),
  );
  section.appendChild(head);

  const mailbox = data.mailbox;
  if (mailbox === null) {
    section.appendChild(
      h("p", { class: "fb-page__note", role: "status" },
        "Chưa tải được hộp thư. Mở Hộp thư để xem trực tiếp.",
      ),
    );
  } else {
    const firstReceived = (mailbox.rows || []).find(
      (row) => row && row.direction === "received",
    );
    const detail = firstReceived ? mailbox.detail : null;
    if (firstReceived && detail && typeof detail.body === "string") {
      section.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Được gửi lúc ${messageTimeLabel(firstReceived.created_at)}`,
        ),
      );
      section.appendChild(
        h("p", { class: "fb-compose__preview-body" }, detail.body),
      );
      if (detail.title) {
        section.appendChild(h("p", { class: "fb-page__note" }, `Chủ đề: ${detail.title}`));
      }
    } else if (firstReceived) {
      section.appendChild(
        h("p", { class: "fb-page__note", role: "status" },
          "Có một lời nhắn mới nhưng chưa tải được nội dung. Mở Hộp thư để đọc.",
        ),
      );
    } else {
      section.appendChild(
        h("p", { class: "fb-sec__sub" },
          "Chưa có lời nhắn nào từ con. Khi con chủ động gửi, nội dung sẽ hiện tại đây.",
        ),
      );
    }
  }

  const safety = h("div", { class: "fb-connect__boundary" });
  safety.appendChild(createIcon({ name: "shield", size: 20, className: "fb-stitch-primary-icon" }));
  safety.appendChild(
    h("div", {},
      h("span", { class: "fb-connect__boundary-title" }, "Không gian an toàn"),
      h("p", { class: "fb-connect__boundary-text" },
        "Đây là nội dung con chủ động gửi cho anh/chị. Mọi nhật ký cá nhân khác của con "
        + "vẫn thuộc không gian riêng tư được bảo vệ.",
      ),
    ),
  );
  section.appendChild(safety);

  const actions = h("div", { class: "fb-compose__pause-buttons" });
  actions.appendChild(
    createButton({
      label: "Mở hộp thư",
      variant: "primary",
      onClick: () => ctx.navigate("/mailbox"),
    }),
  );
  actions.appendChild(
    createButton({
      label: "Soạn lời nhắn",
      variant: "ghost",
      onClick: () => ctx.navigate("/compose"),
    }),
  );
  section.appendChild(actions);
  return section;
}

/** Bài học 60 giây (w09) — catalog F09 thật, kind=micro_lesson. */
function renderCaregiverLesson(data) {
  const section = h("section", { class: "fb-sec" });
  const head = h("div", { class: "fb-sec__row" });
  const title = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);" });
  title.appendChild(createIcon({ name: "timer", size: 20, fill: true, className: "fb-stitch-tertiary-icon" }));
  title.appendChild(h("h2", { class: "fb-scard__title" }, "Bài học 60 giây"));
  head.appendChild(title);
  head.appendChild(h("span", { class: "fb-sec__sub" }, "1 phút đọc"));
  section.appendChild(head);

  const card = h("section", { class: "fb-scard" });
  const lessons = data.lessons;
  if (lessons === null) {
    card.appendChild(
      h("p", { class: "fb-page__note", role: "status" },
        "Chưa tải được bài học ngắn. Vui lòng thử lại sau.",
      ),
    );
  } else if (!lessons.length) {
    card.appendChild(
      h("p", { class: "fb-page__note" },
        "Chưa có bài học ngắn nào được phát hành. Nội dung sẽ xuất hiện khi chương trình đăng tải.",
      ),
    );
  } else {
    const lesson = lessons[0];
    card.appendChild(
      h("span", { class: "fb-chip" },
        createIcon({ name: "psychology_alt", size: 15 }),
        h("span", {}, lesson.audience === "caregiver" ? "Kỹ năng cha mẹ" : "Chuyên đề"),
      ),
    );
    card.appendChild(h("h3", { class: "fb-scard__title" }, String(lesson.title || "Bài học ngắn")));
    card.appendChild(
      h("p", { class: "fb-page__note" },
        "Nội dung chi tiết sẽ mở ở bản đầy đủ — hiện tại chỉ hiển thị tiêu đề từ máy chủ.",
      ),
    );
  }
  section.appendChild(card);
  return section;
}

/* ------------------ Đề xuất ghép đôi từ lớp (F16) ------------------ */

// Trạng thái mở của proposal (đồng bộ với backend F16:
// proposed = chờ hai bên xác nhận; awaiting_confirmation = tôi đã xác nhận,
// đang chờ phía kia). "pending" là tên cũ trong một số fixture demo.
const OPEN_PROPOSAL_STATUSES = new Set(["proposed", "pending", "awaiting_confirmation"]);

/**
 * Đường đi rõ ràng từ home tới đề xuất ghép đôi hiện có (F16).
 * - Có proposal mở → thẻ nổi bật + CTA sang #/proposal (không tự xác nhận).
 * - Không có proposal (danh sách rỗng) → không thêm gì, giữ luồng mã mời.
 * - Không kiểm tra được (null) → ghi chú trung thực + link xem trực tiếp,
 *   không giả bộ "chưa có đề xuất".
 */
function renderProposalEntry(body, ctx, proposals) {
  if (!Array.isArray(proposals)) {
    // Lỗi tải danh sách đề xuất: không chặn trang chủ, nói đúng và mở lối
    // trực tiếp tới #/proposal để người dùng tự kiểm tra.
    const note = h("div", { class: "fb-scard", role: "status" });
    note.appendChild(
      h("p", { class: "fb-sec__sub" },
        "Chưa kiểm tra được đề xuất ghép đôi từ lớp học (lỗi mạng/máy chủ). ",
      ),
    );
    note.appendChild(
      h("div", { class: "fb-compose__pause-buttons" },
        createButton({
          label: "Mở trang Xác nhận ghép nối",
          variant: "ghost",
          onClick: () => ctx.navigate("/proposal"),
        }),
      ),
    );
    body.appendChild(note);
    return;
  }

  const open = proposals.filter(
    (row) => row && OPEN_PROPOSAL_STATUSES.has(row.status),
  );
  if (!open.length) return; // chưa có đề xuất — giữ nguyên luồng mã mời

  const actionable = open.find((row) => row.status === "proposed" || row.status === "pending");
  const waiting = open.find((row) => row.status === "awaiting_confirmation");
  const first = actionable || waiting;
  const peerName = first && first.counterpart && first.counterpart.display_name
    ? String(first.counterpart.display_name)
    : "người đồng hành";

  const card = h("section", {
    class: "fb-scard fb-pairing fb-pairing--emphasized",
    dataset: { proposalEntry: "1" },
  });
  const head = h("div", { class: "fb-sec__row" });
  const titleWrap = h("div", { style: "display:flex;align-items:flex-start;gap:var(--fb-space-3);min-width:0;" });
  const circle = h("span", { class: "fb-connect__icon", "aria-hidden": "true" });
  circle.appendChild(createIcon({ name: "family_restroom", size: 26 }));
  titleWrap.appendChild(circle);
  const textWrap = h("div", { style: "display:flex;flex-direction:column;min-width:0;" });
  textWrap.appendChild(
    h("h2", { class: "fb-scard__title" }, "Lớp học đã ghép cặp cho bạn"),
  );
  textWrap.appendChild(
    h("span", { class: "fb-sec__sub" },
      open.length > 1
        ? `Có ${open.length} đề xuất ghép đôi từ lớp cần bạn xem.`
        : `Ghép cặp với: ${peerName} (tên tự khai báo).`,
    ),
  );
  titleWrap.appendChild(textWrap);
  head.appendChild(titleWrap);
  head.appendChild(
    h("span", { class: "fb-chip" },
      actionable ? "Cần bạn xác nhận" : "Đang chờ phía kia",
    ),
  );
  card.appendChild(head);
  card.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Kết nối chỉ mở sau khi CẢ HAI BÊN cùng xác nhận — bạn hoàn toàn chủ ",
      h("strong", {}, "chủ động xác nhận hoặc từ chối"),
      ". Việc đăng nhập chưa đồng nghĩa với việc đã ghép đôi.",
    ),
  );
  card.appendChild(
    createButton({
      label: "Xem và xác nhận ghép đôi",
      variant: "primary",
      onClick: () => ctx.navigate("/proposal"),
    }),
  );
  body.appendChild(card);
}

/* --------------------------- Chưa kết nối / lỗi --------------------------- */

function renderNotConnected(body, ctx) {
  body.appendChild(
    createEmptyState({
      title: "Chưa kết nối với người đồng hành",
      description:
        "Hai bên sẽ kết nối với nhau bằng một mã mời riêng và xác nhận hai chiều. "
        + "Bạn có thể tạo mã mời hoặc nhập mã nhận được ngay bây giờ.",
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

function renderNeedsLogin(body, ctx) {
  clear(body);
  body.appendChild(h("h1", { class: "fb-sec__greeting" }, "Xin chào!"));
  body.appendChild(
    createEmptyState({
      title: "Chưa đăng nhập",
      description:
        "Đăng nhập bằng tài khoản lớp học của bạn để tạo phiên riêng. "
        + "Chúng tôi chỉ xác minh tài khoản do trường cấp, không đọc thông tin cá nhân khác.",
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
