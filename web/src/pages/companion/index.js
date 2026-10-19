// Companion — Chương trình "Đồng hành bốn tuần" (F02, US-036/US-044).
// Bản WEB THẬT (QA 19/10 R07): gọi cùng API backend qua adapter web
// (createHttpEndpoints dùng chung) — KHÔNG còn WEEKS hardcode, KHÔNG còn
// "Sắp có" theo tiến độ, KHÔNG import DOM/page/zmp-sdk của Mini App (web và
// Mini App có giao diện riêng, dùng chung API — AGENTS.md ADR-3).
//
// Hợp đồng backend (f02_program + f09_activities, đúng shape api.py):
//   GET  /api/v1/program/my                → {results:[{program_key,program_revision,active,...}]}
//   GET  /api/v1/program/catalog           → {results:[{program_key,revision,title,weeks,agreement}]}
//   POST /api/v1/program/enroll            → enrollment (pin revision)
//   POST /api/v1/program/opt-out           → enrollment (active=false)
//   GET  /api/v1/program/weeks/{key}       → {pinned_revision, suggested_week, weeks[4],
//                                             agreement{...}, note_paper_guide}
//   POST /api/v1/program/progress          → {week_no, activity_key, status}
//   GET  /api/v1/program/agreement?key     → {agreement_template, agreement|null,
//                                             effective_agreement|null, pending_proposal|null,
//                                             other_party_id, ...}
//   POST /api/v1/program/agreement/propose | /{id}/confirm | /{id}/withdraw
//   GET /api/v1/activities/invites · POST /api/v1/activities/invites (F09)
//   POST /api/v1/activities/invites/{id}/respond
//   GET  /api/v1/activities/catalog        → {results:[{content_key,revision,title,minutes,body,...}]}
//
// Sự thật dữ liệu & an toàn (đối ứng Mini App, cùng contract):
// - 404 program_not_published / catalog rỗng = "chưa có nội dung được phát
//   hành" — KHÔNG fake nội dung, KHÔNG 401 bị hiểu là "chưa có chương trình".
// - R01: catalog trả nhiều revision published của cùng key → chọn revision
//   CAO NHẤT độc lập thứ tự rows; draft/retired không bao giờ được mời.
// - R05: đọc được hướng dẫn mọi tuần TRƯỚC khi tham gia — xem trước chỉ đọc,
//   không POST enroll.
// - R06: chi tiết hoạt động (mục tiêu/các bước/chia sẻ) + thời lượng CÓ
//   NGUỒN (hoặc "chưa được cung cấp") — không tự bịa metadata; render
//   textContent, không innerHTML dữ liệu.
// - Tiến độ là CỦA RIÊNG MÌNH; thỏa ước chỉ confirmed khi CẢ HAI tự xác nhận
//   cùng revision; lời mời F09 hai chiều, không ai tick hộ ai.
// - Mọi mutation hiển thị lỗi thật, chặn bấm lặp, không tự retry; phản hồi
//   của phiên cũ không cập nhật UI của phiên mới.
import { h, clear } from "../../app/dom.js";
import {
  getSessionGeneration,
  getUserId,
  hasLiveSession,
} from "../../core/session.js";
import {
  createButton,
  createCard,
  createDialog,
  createDemoBanner,
  createEmptyState,
  createErrorState,
  createSkeleton,
  createTopBar,
} from "../../components/index.js";

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function roleLabel(role) {
  return role === "caregiver" ? "Hướng dẫn cho anh/chị" : "Hướng dẫn cho bạn";
}

function statusLabel(status) {
  if (status === "done") return "Đã làm";
  if (status === "skipped") return "Đã bỏ qua";
  if (status === "reset") return "Đặt lại";
  return "Chưa làm";
}

function agreementStatusLabel(status) {
  const map = {
    proposed: "Chờ hai bên xác nhận",
    confirmed: "Đã cùng xác nhận",
    superseded: "Đã thay bằng phiên bản mới",
    withdrawn: "Đã rút đề xuất",
    ended: "Đã kết thúc",
  };
  return map[status] || status;
}

/* ---------------------- Mutation trung thực ---------------------- */

function sessionChangedSince(capturedGeneration, capturedUserId) {
  return getSessionGeneration() !== capturedGeneration
    || getUserId() !== capturedUserId;
}

const MUTATION_REASON_TEXT = {
  not_in_pinned_program:
    "hoạt động không thuộc phiên bản chương trình bạn đang theo",
  invalid_status: "trạng thái không hợp lệ",
  no_active_connection:
    "cần hai bên đã kết nối trước khi mời hoạt động chung",
  connection_changed: "kết nối đã thay đổi — hãy tải lại trang",
  cannot_invite_self: "không thể tự mời chính mình",
  content_not_published: "nội dung này chưa được phát hành ở phiên bản đó",
  program_not_published: "chương trình chưa được phát hành",
  enrollment_not_found: "bạn chưa tham gia chương trình này",
  revision_mismatch:
    "hai bên chưa cùng theo một phiên bản nội dung — cần cùng cập nhật "
    + "phiên bản trước khi xác nhận",
  agreement_not_confirmable:
    "thỏa ước này không thể xác nhận ở trạng thái hiện tại",
  already_confirmed_by_you: "bạn đã xác nhận thỏa ước này rồi",
  only_proposer_can_withdraw: "chỉ người đề xuất mới rút được đề xuất",
  agreement_not_open: "đề xuất này không còn mở",
  agreement_revision_outdated:
    "phiên bản này đã có bản hiệu lực mới hơn nên không đề xuất lại được",
  invite_not_accepted: "lời mời chưa được chấp nhận",
};

function mutationErrorText(error, { subject }) {
  const reason = error && error.details && error.details.reason;
  if (reason && MUTATION_REASON_TEXT[reason]) {
    return `Chưa thực hiện được vì ${MUTATION_REASON_TEXT[reason]}. ` +
      "Bạn chủ động thử lại nhé.";
  }
  const kind = error && error.kind;
  if (kind === "network") {
    return `${subject} chưa được ghi vì mất kết nối mạng. ` +
      "Bạn chủ động thử lại khi mạng ổn định nhé.";
  }
  if (kind === "timeout") {
    return `${subject} chưa được ghi vì máy chủ phản hồi quá lâu. ` +
      "Bạn chủ động thử lại nhé.";
  }
  if (kind === "configuration") {
    return `${subject} chưa được ghi vì ứng dụng cấu hình chưa đúng ` +
      "(thiếu địa chỉ máy chủ). Vui lòng báo quản trị viên.";
  }
  if (kind === "invalid_response") {
    return `${subject} chưa được ghi vì phản hồi máy chủ không đọc được. ` +
      "Bạn chủ động thử lại nhé.";
  }
  if (error && error.status) {
    return `${subject} chưa được ghi vì máy chủ từ chối (mã ${error.status}). ` +
      "Bạn chủ động thử lại nhé.";
  }
  return `${subject} chưa được ghi vì có lỗi không xác định. ` +
    "Bạn chủ động thử lại nhé.";
}

function runMutation(ctx, { request, note, button, pendingText, subject,
  onSuccess }) {
  const capturedGeneration = getSessionGeneration();
  const capturedUserId = getUserId();
  if (button) button.disabled = true;
  if (note) note.textContent = pendingText || "Đang thực hiện…";
  Promise.resolve()
    .then(request)
    .then((result) => {
      if (sessionChangedSince(capturedGeneration, capturedUserId)) return;
      if (typeof onSuccess === "function") onSuccess(result);
    })
    .catch((error) => {
      if (sessionChangedSince(capturedGeneration, capturedUserId)) return;
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      if (note) {
        note.textContent = mutationErrorText(error, {
          subject: subject || "Thay đổi",
        });
      }
      if (button) button.disabled = false; // thử lại CHỦ ĐỘNG, không tự retry
    });
}

function eventCurrentTarget(event) {
  return event && event.currentTarget ? event.currentTarget : null;
}

/* ----------------------- Danh mục F09 (R01) ----------------------- */

/** content_key -> card published MỚI NHẤT, độc lập thứ tự rows
 * (QA 19/10 R01 — giống chính sách Mini App, cùng contract):
 *   - chỉ status published; revision số cao nhất thắng; bằng revision giữ
 *     bản đến trước (reader sắp mới nhất trước). */
function buildActivityMeta(catalogRows) {
  const meta = {};
  const revisionOf = (card) => Number.parseInt(card.revision, 10);
  (Array.isArray(catalogRows) ? catalogRows : []).forEach((card) => {
    if (!card || !card.content_key) return;
    if (card.status && card.status !== "published") return;
    const key = String(card.content_key);
    const current = meta[key];
    if (!current) {
      meta[key] = card;
      return;
    }
    const revision = revisionOf(card);
    const currentRevision = revisionOf(current);
    if (Number.isInteger(revision)
      && (!Number.isInteger(currentRevision) || revision > currentRevision)) {
      meta[key] = card;
    }
  });
  return meta;
}

/* --------------------- Chi tiết hoạt động (R06) --------------------- */

function parseActivityBody(rawBody) {
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody;
  }
  if (typeof rawBody !== "string" || !rawBody.trim()) return {};
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed : {};
  } catch {
    return {};
  }
}

/** Khối chi tiết chỉ-đọc của MỘT hoạt động: mục tiêu, cách làm, phạm vi
 * chia sẻ, thời lượng CÓ NGUỒN. Toàn bộ text qua textContent (R06). */
function activityDetailNodes(meta) {
  const nodes = [];
  const body = parseActivityBody(meta ? meta.body : null);
  const revision = meta ? Number.parseInt(meta.revision, 10) : NaN;

  if (body.goal) {
    nodes.push(h("p", { class: "fb-sec__sub" }, `Mục tiêu: ${body.goal}`));
  }
  if (Array.isArray(body.steps) && body.steps.length) {
    nodes.push(h("p", { class: "fb-care__kicker" }, "Cách làm:"));
    const steps = h("ul", { class: "fb-list" });
    body.steps.forEach((step) => {
      steps.appendChild(h("li", { class: "fb-list__item" }, String(step)));
    });
    nodes.push(steps);
  }
  if (body.share) {
    nodes.push(
      h("p", { class: "fb-sec__sub" }, `Được chia sẻ: ${body.share}`),
    );
  }
  if (body.text && !body.goal && !body.steps && !body.share) {
    nodes.push(h("p", { class: "fb-sec__sub" }, String(body.text)));
  }
  if (!nodes.length) {
    nodes.push(
      h("p", { class: "fb-sec__sub" },
        "Hoạt động này chưa có mô tả từng bước trong nội dung đã phát hành."),
    );
  }
  if (meta && Number.isInteger(meta.minutes) && meta.minutes >= 1) {
    nodes.push(
      h("p", { class: "fb-page__note" },
        `Thời lượng: khoảng ${meta.minutes} phút `
        + (Number.isInteger(revision)
          ? `(nguồn: nội dung đã phát hành rev ${revision}).`
          : "(nguồn: nội dung đã phát hành).")),
    );
  } else {
    nodes.push(
      h("p", { class: "fb-page__note" },
        "Thời lượng: chưa được cung cấp trong nội dung đã phát hành — "
        + "bạn tự căn cứ thời gian hợp lý cho gia đình mình."),
    );
  }
  nodes.push(
    h("p", { class: "fb-page__note" },
      "Lời mời gửi đến người đồng hành của bạn; mỗi người tự ghi phản hồi "
      + "của mình — không ai tick hộ ai."),
  );
  return nodes;
}

/* ------------------- Xem trước giáo trình (R05) ------------------- */

/** Render chỉ-ĐỌC mọi tuần của chương trình từ catalog đã publish: mục tiêu
 * + hướng dẫn cả hai vai trò. Không POST gì, không tạo enrollment (R05). */
function programPreviewNodes(program) {
  const nodes = [];
  const weeks = Array.isArray(program.weeks) ? program.weeks : [];
  if (!weeks.length) {
    nodes.push(
      h("p", { class: "fb-sec__sub" },
        "Chương trình này chưa có nội dung tuần để xem trước."),
    );
    return nodes;
  }
  weeks.forEach((week) => {
    const section = h("div", { dataset: { programPreviewWeek: "1" } });
    section.appendChild(
      h("p", { class: "fb-care__kicker" },
        `Tuần ${week.week_no}: ${week.title}`),
    );
    if (Array.isArray(week.goals) && week.goals.length) {
      const goalsList = h("ul", { class: "fb-list" });
      week.goals.forEach((goal) => {
        goalsList.appendChild(
          h("li", { class: "fb-list__item" }, String(goal)));
      });
      section.appendChild(goalsList);
    }
    if (week.student_guide) {
      section.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Hướng dẫn cho bạn: ${week.student_guide}`),
      );
    }
    if (week.caregiver_guide) {
      section.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Hướng dẫn cho anh/chị: ${week.caregiver_guide}`),
      );
    }
    if (Array.isArray(week.joint_activity_keys)
      && week.joint_activity_keys.length) {
      section.appendChild(
        h("p", { class: "fb-page__note" },
          "Tuần này có hoạt động chung hai người — chi tiết từng hoạt động "
          + "mở sau khi tham gia chương trình."),
      );
    }
    nodes.push(section);
  });
  return nodes;
}

export const page = {
  id: "companion",
  title: "Đồng hành",
  requiresRole: true,
  requiresAuth: true, // dữ liệu chương trình/tiến độ là dữ liệu phiên (M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const role = state.role;

    const root = h("div", {
      class: "fb-page fb-page--web", dataset: { page: "companion" },
    });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root, "
        + ".fb-dialog-root").forEach((el) => el.remove());
    };

    const demo = Boolean(state.demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để xem chương trình",
          description:
            "Chương trình Đồng hành bốn tuần là hành trình riêng của bạn và "
            + "người đồng hành. Đăng nhập bằng mã tài khoản lớp học để tiếp tục.",
          action: {
            label: "Đăng nhập", onClick: () => ctx.navigate("/login"),
          },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải chương trình…"));

    const load = () => {
      const thisRun = ++runId;
      const initialGeneration = getSessionGeneration();
      const initialUserId = getUserId();
      Promise.resolve()
        .then(() => ctx.adapter.programMy())
        .then((myData) => {
          if (cancelled || thisRun !== runId) return null;
          if (hasLiveSession() && getUserId() !== initialUserId) return null;
          const rows = (myData && Array.isArray(myData.results)
            ? myData.results : []);
          const enrollment = rows.find((row) => row && row.active) || null;
          if (!enrollment) return { enrollment: null };
          // Đã tham gia: nạp tuần + thỏa ước + lời mời + danh mục hoạt động
          // song song; lỗi phần phụ → null để hiển thị trung thực từng phần.
          return Promise.all([
            Promise.resolve()
              .then(() => ctx.adapter.programWeeks(enrollment.program_key))
              .catch((err) => {
                if (err && (err.status === 401
                  || err.kind === "stale_session")) throw err;
                return null;
              }),
            Promise.resolve()
              .then(() => ctx.adapter.programAgreement(enrollment.program_key))
              .catch((err) => {
                if (err && (err.status === 401
                  || err.kind === "stale_session")) throw err;
                return null;
              }),
            Promise.resolve()
              .then(() => ctx.adapter.activitiesInvites())
              .catch((err) => {
                if (err && (err.status === 401
                  || err.kind === "stale_session")) throw err;
                return null;
              }),
            Promise.resolve()
              .then(() => ctx.adapter.activitiesCatalog({ kind: "activity" }))
              .catch((err) => {
                if (err && (err.status === 401
                  || err.kind === "stale_session")) throw err;
                return null;
              }),
          ]).then(([weeks, agreement, invites, catalog]) => ({
            enrollment, weeks, agreement, invites, catalog,
          }));
        })
        .then((data) => {
          if (cancelled || thisRun !== runId) return;
          if (hasLiveSession() && getUserId() !== initialUserId) return;
          if (!data) return;
          if (data.enrollment && data.weeks === null
            && data.agreement === null) {
            renderLoadError(body, ctx, load);
            return;
          }
          renderCompanion(body, ctx, { demo, role, data, load });
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
          if (error && error.kind === "stale_session") return;
          if (hasLiveSession() && getUserId() !== initialUserId) return;
          if (!hasLiveSession() && initialUserId
            && getSessionGeneration() > initialGeneration + 1) return;
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          renderLoadError(body, ctx, load);
        });
    };
    load();

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ------------------------------ Render chính ------------------------------ */

function renderCompanion(body, ctx, { demo, role, data, load }) {
  clear(body);
  const weeks = data && data.weeks && Array.isArray(data.weeks.weeks)
    ? data.weeks : null;
  currentPageProgramKey = (weeks && weeks.program_key)
    || (data && data.enrollment && data.enrollment.program_key) || null;
  if (demo) body.appendChild(createDemoBanner());

  const enrollment = data && data.enrollment;
  if (!enrollment) {
    renderNotEnrolled(body, ctx, { load });
    return;
  }

  if (!weeks) {
    body.appendChild(
      createEmptyState({
        title: "Chưa đọc được nội dung chương trình",
        description:
          "Bạn đã tham gia chương trình, nhưng máy chủ chưa trả được nội dung "
          + "tuần. Nếu lỗi tiếp diễn, nội dung có thể chưa được phát hành — "
          + "vui lòng quay lại sau.",
        action: { label: "Thử lại", onClick: () => load() },
      }),
    );
    body.appendChild(h("p", { class: "fb-page__note" },
      "Bạn hoàn toàn có thể dùng sổ giấy — app không bắt buộc ghi mọi thứ "
      + "vào máy, và không đọc sổ giấy của bạn."));
    return;
  }

  body.appendChild(h("h2", { class: "fb-sec__greeting" },
    "Chương trình Đồng hành bốn tuần"));
  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Tự nguyện hoàn toàn: bạn có thể xem bất kỳ tuần nào, bỏ qua, hoặc quay "
      + "lại sau. Tiến độ chỉ mình bạn thấy — không xếp hạng, không trách móc.",
    ),
  );
  body.appendChild(h("p", { class: "fb-page__note" },
    `Phiên bản nội dung đang theo: rev ${weeks.pinned_revision}.`));

  const suggested = weeks.suggested_week;
  const activityMeta = buildActivityMeta(
    data.catalog && Array.isArray(data.catalog.results)
      ? data.catalog.results : []);

  const note = h("p", { class: "fb-page__note", role: "status" });
  note.dataset.companionNote = "1";
  body.appendChild(note);

  weeks.weeks.forEach((week) => {
    body.appendChild(renderWeekCard(ctx, {
      week, role, suggested, invites: data.invites, activityMeta,
      otherPartyId: data.agreement && data.agreement.other_party_id,
      load, note,
    }));
  });

  body.appendChild(renderAgreementCard(ctx, {
    agreement: data.agreement, weeks, load, note,
  }));
  body.appendChild(h("p", { class: "fb-page__note" },
    (weeks && weeks.note_paper_guide)
      || "Bạn hoàn toàn có thể dùng sổ giấy — app không bắt buộc ghi mọi thứ "
        + "vào máy, và không đọc sổ giấy của bạn."));
  body.appendChild(renderOptOutCard(ctx, { enrollment, load, note }));
}

function renderNotEnrolled(body, ctx, { load }) {
  // Chưa tham gia: đọc catalog đã publish — tham gia là thao tác tường minh.
  const note = h("p", { class: "fb-page__note", role: "status" });
  note.dataset.companionNote = "1";
  Promise.resolve()
    .then(() => ctx.adapter.programCatalog())
    .then((catalog) => {
      const programs = (catalog && Array.isArray(catalog.results)
        ? catalog.results : []);
      if (!programs.length) {
        body.appendChild(
          createEmptyState({
            title: "Chưa có chương trình nào được phát hành",
            description:
              "Chương trình Đồng hành bốn tuần sẽ xuất hiện tại đây sau khi "
              + "nội dung được người phụ trách duyệt và phát hành. Trong lúc "
              + "chờ, mọi tính năng khác của app vẫn dùng bình thường.",
          }),
        );
        body.appendChild(h("p", { class: "fb-page__note" },
          "Bạn hoàn toàn có thể dùng sổ giấy — app không bắt buộc ghi mọi "
          + "thứ vào máy, và không đọc sổ giấy của bạn."));
        return;
      }
      body.appendChild(h("h2", { class: "fb-sec__greeting" },
        "Chương trình Đồng hành bốn tuần"));
      body.appendChild(
        h("p", { class: "fb-page__note" },
          "Lộ trình bốn tuần tự nguyện cho bạn và người đồng hành. Xem trước "
          + "miễn phí — tham gia là một nút bấm, và bạn có thể nghỉ bất cứ lúc "
          + "nào mà không mất gì.",
        ),
      );
      body.appendChild(note);
      programs.forEach((program) => {
        const weekTitles = (program.weeks || [])
          .map((week) => `Tuần ${week.week_no}: ${week.title}`)
          .join(" • ");
        const card = createCard({
          title: program.title,
          description: weekTitles || "Chương trình bốn tuần",
        });
        // QA 19/10 R05: đọc hướng dẫn đã phát hành trước khi quyết định —
        // xem trước chỉ đọc, KHÔNG POST enroll.
        const preview = h("div", { dataset: { programPreview: "1" } });
        preview.hidden = true;
        programPreviewNodes(program).forEach((node) => preview.appendChild(node));
        card.appendChild(preview);
        const actions = h("div", { class: "fb-compose__pause-buttons" });
        actions.appendChild(createButton({
          label: "Xem trước hướng dẫn từng tuần",
          variant: "ghost",
          onClick: (event) => {
            preview.hidden = !preview.hidden;
            const button = eventCurrentTarget(event);
            if (button) {
              button.textContent = preview.hidden
                ? "Xem trước hướng dẫn từng tuần"
                : "Ẩn hướng dẫn xem trước";
            }
          },
        }));
        actions.appendChild(createButton({
          label: "Tham gia chương trình",
          variant: "primary",
          onClick: (event) => onEnroll(ctx, program,
            { load, note, button: eventCurrentTarget(event) }),
        }));
        card.appendChild(actions);
        body.appendChild(card);
      });
    })
    .catch((error) => {
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      renderLoadError(body, ctx, load);
    });
}

function onEnroll(ctx, program, { load, note, button }) {
  const dialog = createDialog({
    title: "Tham gia chương trình này?",
    message:
      `Bạn sẽ tham gia "${program.title}" theo phiên bản rev ${program.revision}. `
      + "Nội dung phiên bản này được giữ ổn định cho bạn; bản mới phát hành "
      + "không tự đổi chương trình của bạn. Tiến độ chỉ mình bạn thấy.",
    actions: [
      {
        label: "Tham gia",
        variant: "primary",
        onClick: () => {
          runMutation(ctx, {
            request: () => ctx.adapter.programEnroll({
              programKey: program.program_key,
              programRevision: program.revision,
            }),
            note, button,
            pendingText: "Đang tham gia chương trình…",
            subject: "Tham gia chương trình",
            onSuccess: () => load(),
          });
        },
      },
      { label: "Để sau", variant: "ghost" },
    ],
  });
  return dialog;
}

/* -------------------------------- Tuần -------------------------------- */

function renderWeekCard(ctx, { week, role, suggested, invites, activityMeta,
  otherPartyId, load, note }) {
  const isSuggested = suggested === week.week_no;
  const card = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  head.appendChild(
    h("h3", { class: "fb-scard__title" },
      `Tuần ${week.week_no} — ${week.title}`),
  );
  if (isSuggested) {
    head.appendChild(h("span", { class: "fb-chip" }, "Gợi ý tuần này"));
  }
  card.appendChild(head);

  if (Array.isArray(week.goals) && week.goals.length) {
    const goalsList = h("ul", { class: "fb-list" });
    week.goals.forEach((goal) => {
      goalsList.appendChild(h("li", { class: "fb-list__item" }, String(goal)));
    });
    card.appendChild(goalsList);
  }

  const guide = role === "caregiver"
    ? week.caregiver_guide : week.student_guide;
  if (guide) {
    card.appendChild(
      h("div", {},
        h("p", { class: "fb-care__kicker" }, roleLabel(role)),
        h("p", { class: "fb-sec__sub" }, String(guide)),
      ),
    );
  }

  // Contract backend: mỗi tuần trả `activities: [{activity_key, status}]` —
  // lời mời + tiến độ dựng từ CÙNG nguồn này, revision/title/minutes từ
  // catalog F09 thật (R01).
  const activities = Array.isArray(week.activities) ? week.activities : [];
  const myInvites = (invites && Array.isArray(invites.results)
    ? invites.results : []);

  activities.forEach((activity) => {
    const key = String(activity.activity_key);
    const meta = activityMeta && activityMeta[key] ? activityMeta[key] : null;
    const titleText = meta && meta.title ? String(meta.title) : key;
    // R06: chỉ hiện phút khi nội dung phát hành cung cấp số nguyên hợp lệ.
    const minutesText = meta && Number.isInteger(meta.minutes)
      && meta.minutes >= 1
      ? ` · khoảng ${meta.minutes} phút` : "";

    const chipRow = h("div", { class: "fb-compose__pause-buttons" });
    chipRow.appendChild(
      h("span", { class: "fb-chip" },
        `Hoạt động chung: ${titleText}${minutesText}`),
    );
    // R06: đọc mục tiêu/cách làm/thời lượng có nguồn TRƯỚC khi mời hoặc tick.
    const detail = h("div", { dataset: { activityDetail: "1" } });
    detail.hidden = true;
    activityDetailNodes(meta).forEach((node) => detail.appendChild(node));
    chipRow.appendChild(createButton({
      label: "Xem chi tiết hoạt động",
      variant: "ghost",
      onClick: (event) => {
        detail.hidden = !detail.hidden;
        const button = eventCurrentTarget(event);
        if (button) {
          button.textContent = detail.hidden
            ? "Xem chi tiết hoạt động"
            : "Ẩn chi tiết hoạt động";
        }
      },
    }));
    card.appendChild(chipRow);
    card.appendChild(detail);

    const sentPending = myInvites.find((row) => row
      && row.content_key === key && row.direction === "sent"
      && row.status === "pending");
    const receivedPending = myInvites.find((row) => row
      && row.content_key === key && row.direction === "received"
      && row.status === "pending");

    const row = h("div", { class: "fb-compose__pause-buttons" });
    if (receivedPending) {
      row.appendChild(createButton({
        label: "Chấp nhận cùng làm",
        variant: "primary",
        onClick: (event) => onRespond(ctx, receivedPending.invite_id,
          "accept", { load, note, button: eventCurrentTarget(event) }),
      }));
      row.appendChild(createButton({
        label: "Từ chối",
        variant: "ghost",
        onClick: (event) => onRespond(ctx, receivedPending.invite_id,
          "decline", { load, note, button: eventCurrentTarget(event) }),
      }));
    } else if (sentPending) {
      row.appendChild(h("span", { class: "fb-chip" },
        "Đã mời — đang chờ phía kia phản hồi"));
    } else {
      // Lời mời cần revision PUBLISHED mới nhất từ catalog F09; thiếu nguồn
      // thì khóa nút kèm lý do trung thực (R01).
      const revision = meta ? Number.parseInt(meta.revision, 10) : NaN;
      const canInvite = Boolean(otherPartyId) && Number.isInteger(revision)
        && revision >= 1;
      const inviteBtn = createButton({
        label: "Mời cùng làm hoạt động này",
        variant: "ghost",
        onClick: (event) => onInvite(ctx, {
          inviteeId: otherPartyId, contentKey: key, contentRevision: revision,
          load, note, button: eventCurrentTarget(event),
        }),
      });
      if (!canInvite) {
        inviteBtn.disabled = true;
        inviteBtn.title = !otherPartyId
          ? "Cần kết nối với người đồng hành trước"
          : (meta
            ? "Không đọc được phiên bản nội dung của hoạt động này"
            : "Hoạt động này chưa có trong danh mục đã phát hành nên chưa "
              + "mời được");
      }
      row.appendChild(inviteBtn);
    }
    card.appendChild(row);

    // Tiến độ CỦA MÌNH cho từng hoạt động (cùng nguồn activities).
    const progressRow = h("div", { class: "fb-compose__pause-buttons" });
    progressRow.appendChild(
      h("span", { class: "fb-sec__sub" },
        `${titleText} — ${statusLabel(activity.status)}`),
    );
    if (activity.status === "done" || activity.status === "skipped") {
      progressRow.appendChild(createButton({
        label: "Đặt lại",
        variant: "ghost",
        onClick: (event) => onProgress(ctx, {
          weekNo: week.week_no, activityKey: key, status: "reset", load,
          note, button: eventCurrentTarget(event),
        }),
      }));
    } else {
      progressRow.appendChild(createButton({
        label: "Tôi đã làm",
        variant: "ghost",
        onClick: (event) => onProgress(ctx, {
          weekNo: week.week_no, activityKey: key,
          status: "done", load,
          note, button: eventCurrentTarget(event),
        }),
      }));
      progressRow.appendChild(createButton({
        label: "Bỏ qua tuần này",
        variant: "ghost",
        onClick: (event) => onProgress(ctx, {
          weekNo: week.week_no, activityKey: key,
          status: "skipped", load,
          note, button: eventCurrentTarget(event),
        }),
      }));
    }
    card.appendChild(progressRow);
  });
  return card;
}

function onProgress(ctx, { weekNo, activityKey, status, load, note, button }) {
  runMutation(ctx, {
    request: () => ctx.adapter.programProgress({
      programKey: currentPageProgramKey || "",
      weekNo, activityKey, status,
    }),
    note, button,
    pendingText: "Đang ghi tiến độ của bạn…",
    subject: "Tiến độ",
    onSuccess: () => load(),
  });
}

function onInvite(ctx, { inviteeId, contentKey, contentRevision, load, note,
  button }) {
  if (!inviteeId) return;
  runMutation(ctx, {
    request: () => ctx.adapter.activitiesInvite({
      inviteeId, contentKey, contentRevision,
    }),
    note, button,
    pendingText: "Đang gửi lời mời…",
    subject: "Lời mời",
    onSuccess: () => load(),
  });
}

function onRespond(ctx, inviteId, decision, { load, note, button }) {
  runMutation(ctx, {
    request: () => ctx.adapter.activitiesRespond(inviteId, decision),
    note, button,
    pendingText: "Đang ghi phản hồi của bạn…",
    subject: "Phản hồi lời mời",
    onSuccess: () => load(),
  });
}

/* ------------------------------ Thỏa ước ------------------------------ */

function renderAgreementCard(ctx, { agreement, weeks, load, note }) {
  const card = h("section", { class: "fb-scard" });
  const template = agreement && agreement.agreement_template
    ? agreement.agreement_template : (weeks.agreement || null);
  const instance = agreement && agreement.agreement
    ? agreement.agreement : null;
  const effective = (agreement && agreement.effective_agreement)
    || (instance && instance.status === "confirmed" ? instance : null);
  const pending = (agreement && agreement.pending_proposal)
    || (instance && instance.status === "proposed" ? instance : null);
  const currentRow = effective || pending || instance;

  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("h3", { class: "fb-scard__title" }, "Thỏa ước gia đình mới (tuần 4)"),
      h("span", { class: "fb-chip" },
        currentRow ? agreementStatusLabel(currentRow.status)
          : "Chưa có đề xuất"),
    ),
  );
  const commitments = effective && Array.isArray(effective.commitments)
    && effective.commitments.length
    ? effective.commitments
    : (pending && Array.isArray(pending.commitments)
      && pending.commitments.length
      ? pending.commitments
      : ((template && Array.isArray(template.commitments))
        ? template.commitments : []));
  if (commitments.length) {
    const list = h("ul", { class: "fb-list" });
    commitments.forEach((item) => {
      list.appendChild(h("li", { class: "fb-list__item" }, String(item)));
    });
    card.appendChild(list);
  }
  card.appendChild(
    h("p", { class: "fb-page__note" },
      "Thỏa ước chỉ có hiệu lực khi CẢ HAI người tự bấm xác nhận cùng phiên "
      + "bản. Đây là lời hứa thân tình giữa hai người — không phải văn bản "
      + "pháp lý.",
    ),
  );

  if (effective) {
    card.appendChild(
      h("p", { class: "fb-sec__sub", role: "status" },
        `Bản đang hiệu lực: rev ${effective.agreement_revision}. `
        + "Cả hai đã cùng xác nhận thỏa ước này. Hai bên đều đọc được các cam "
        + "kết trên bất cứ lúc nào."),
    );
  }

  if (pending) {
    if (effective) {
      card.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Có bản đề xuất mới rev ${pending.agreement_revision} đang chờ hai `
          + "bên xác nhận — bản trên vẫn còn hiệu lực cho đến khi bản mới đủ "
          + "hai xác nhận."),
      );
    }
    if (!pending.my_confirmed) {
      card.appendChild(createButton({
        label: "Tôi xác nhận thỏa ước này",
        variant: "primary",
        onClick: (event) => openAgreementConfirmDialog(ctx, pending,
          { load, note, button: eventCurrentTarget(event) }),
      }));
    } else {
      card.appendChild(
        h("p", { class: "fb-sec__sub", role: "status" },
          "Bạn đã xác nhận. Đang chờ người kia tự xác nhận cùng phiên bản…"),
      );
    }
    if (pending.proposed_by_me) {
      card.appendChild(createButton({
        label: "Rút đề xuất",
        variant: "ghost",
        onClick: (event) => {
          runMutation(ctx, {
            request: () => ctx.adapter.programAgreementWithdraw(
              pending.agreement_id),
            note, button: eventCurrentTarget(event),
            pendingText: "Đang rút đề xuất…",
            subject: "Rút đề xuất",
            onSuccess: () => load(),
          });
        },
      }));
    }
  } else if (!effective && instance
    && (instance.status === "withdrawn"
      || instance.status === "superseded"
      || instance.status === "ended")) {
    card.appendChild(
      h("p", { class: "fb-sec__sub" },
        `Trạng thái hiện tại: ${agreementStatusLabel(instance.status)}.`),
    );
    if (instance.status === "withdrawn") {
      card.appendChild(createButton({
        label: "Đề xuất lại thỏa ước",
        variant: "ghost",
        onClick: (event) => onProposeAgreement(ctx, {
          load, note, button: eventCurrentTarget(event),
        }),
      }));
    }
  } else if (!effective && !pending) {
    card.appendChild(createButton({
      label: "Đề xuất thỏa ước cho hai bên",
      variant: "primary",
      onClick: (event) => onProposeAgreement(ctx, {
        load, note, button: eventCurrentTarget(event),
      }),
    }));
  }
  return card;
}

function onProposeAgreement(ctx, { load, note, button }) {
  runMutation(ctx, {
    request: () => ctx.adapter.programAgreementPropose(
      currentPageProgramKey || ""),
    note, button,
    pendingText: "Đang tạo đề xuất thỏa ước…",
    subject: "Đề xuất thỏa ước",
    onSuccess: () => load(),
  });
}

function openAgreementConfirmDialog(ctx, instance, { load, note, button }) {
  const preview = (Array.isArray(instance.commitments)
    && instance.commitments.length)
    ? instance.commitments.map((c) => `• ${c}`).join("\n")
    : "";
  const dialog = createDialog({
    title: "Xác nhận thỏa ước cùng phiên bản?",
    message:
      "Bạn xác nhận THỎA ƯỚC NÀY theo phiên bản đang hiển thị. Thỏa ước chỉ "
      + "thành lập khi người đồng hành cũng tự xác nhận cùng phiên bản. "
      + (preview ? `\n\nCam kết:\n${preview}` : ""),
    actions: [
      {
        label: "Tôi xác nhận",
        variant: "primary",
        onClick: () => {
          runMutation(ctx, {
            request: () => ctx.adapter.programAgreementConfirm(
              instance.agreement_id),
            note, button,
            pendingText: "Đang ghi nhận xác nhận của bạn…",
            subject: "Xác nhận thỏa ước",
            onSuccess: () => load(),
          });
        },
      },
      { label: "Để sau", variant: "ghost" },
    ],
  });
  return dialog;
}

/* ------------------------------ Phụ trợ ------------------------------ */

function renderOptOutCard(ctx, { enrollment, load, note }) {
  const card = h("section", { class: "fb-scard" });
  card.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Nghỉ chương trình là lựa chọn bình thường — không ảnh hưởng đến các "
      + "tính năng khác của app, và bạn có thể tham gia lại khi sẵn sàng."),
  );
  card.appendChild(createButton({
    label: "Nghỉ chương trình (opt-out)",
    variant: "ghost",
    onClick: () => {
      const dialog = createDialog({
        title: "Nghỉ chương trình bốn tuần?",
        message:
          "Bạn sẽ không nhận gợi ý tuần nữa. Tiến độ riêng vẫn được giữ trên "
          + "máy chủ. Bạn có thể tham gia lại bất cứ lúc nào — và chủ động "
          + "chọn phiên bản nội dung lúc đó.",
        actions: [
          {
            label: "Nghỉ chương trình",
            variant: "danger",
            onClick: () => {
              runMutation(ctx, {
                request: () => ctx.adapter.programOptOut(
                  enrollment.program_key),
                note, button: null,
                pendingText: "Đang ghi nhận nghỉ chương trình…",
                subject: "Nghỉ chương trình",
                onSuccess: () => load(),
              });
            },
          },
          { label: "Ở lại", variant: "ghost" },
        ],
      });
      return dialog;
    },
  }));
  return card;
}

function renderLoadError(body, ctx, retry) {
  clear(body);
  body.appendChild(
    createErrorState({
      title: "Không tải được chương trình",
      description:
        "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại — trạng thái "
        + "tham gia và tiến độ của bạn vẫn được giữ an toàn trên máy chủ.",
      retryLabel: "Thử lại",
      onRetry: () => retry(),
    }),
  );
}

/** program_key của lần render hiện tại (progress/agreement cần) — đặt trong
 * renderCompanion từ weeks payload/enrollment của chính phiên trang đó. */
let currentPageProgramKey = null;
