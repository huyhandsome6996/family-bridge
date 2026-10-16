// Companion — Chương trình "Đồng hành bốn tuần" (F02, US-036/US-044).
// Bản THẬT: đọc catalog/weeks/progress/agreement từ adapter (server), không
// còn WEEKS hardcode, không còn "Sắp có" theo tiến độ — mọi tuần đã publish
// đều xem được (tự nguyện, không khóa tuần).
//
// Hợp đồng backend (f02_program, đúng shape services/program.py + api.py):
//   GET  /api/v1/program/my                → {results:[{program_key,program_revision,active,...}]}
//   GET  /api/v1/program/catalog           → {results:[{program_key,revision,title,weeks,agreement}]}
//   POST /api/v1/program/enroll            → enrollment (pin revision)
//   POST /api/v1/program/opt-out           → enrollment (active=false)
//   GET  /api/v1/program/weeks/{key}       → {pinned_revision, suggested_week, weeks[4],
//                                             agreement{...,accepted_by_me}, note_paper_guide}
//   POST /api/v1/program/progress          → {week_no, activity_key, program_revision, status}
//   GET  /api/v1/program/agreement?key     → {agreement_template, agreement|null, other_party_id, ...}
//   POST /api/v1/program/agreement/propose | /{id}/confirm | /{id}/withdraw
//   GET/POST /api/v1/activities/invites, POST .../{id}/respond (F09)
//
// Sự thật dữ liệu & an toàn:
// - 404 program_not_published / catalog rỗng = "chưa có nội dung được phát
//   hành" (thầy chưa publish) — KHÔNG fake nội dung, KHÔNG 401 bị hiểu là
//   "chưa có chương trình".
// - Tiến độ là CỦA RIÊNG MÌNH (server chặn tick hộ); không có family progress.
// - Thỏa ước tuần 4 chỉ confirmed khi CẢ HAI tự bấm xác nhận cùng revision.
// - Lời mời hoạt động chung là F09 thật (inviter/invitee riêng, không tự accept hộ).
// - Demo mode dùng fixture (catalog rỗng) — hiển thị empty state trung thực.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
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

const AGREEMENT_OPEN = new Set(["proposed", "confirmed"]);

export const page = {
  id: "companion",
  title: "Đồng hành",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const role = state.role;

    const root = h("div", { class: "fb-page", dataset: { page: "companion" } });
    root.appendChild(createTopBar({ title: "Đồng hành" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    const demo = Boolean(state.demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để xem chương trình",
          description:
            "Chương trình Đồng hành bốn tuần là hành trình riêng của bạn và người đồng hành. "
            + "Đăng nhập bằng tài khoản lớp học để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải chương trình…"));

    const load = () => {
      const thisRun = ++runId;
      Promise.resolve()
        .then(() => ctx.adapter.programMy())
        .then((myData) => {
          if (cancelled || thisRun !== runId) return null;
          const rows = (myData && Array.isArray(myData.results)
            ? myData.results : []);
          const enrollment = rows.find((row) => row && row.active) || null;
          if (!enrollment) return { enrollment: null };
          // Đã tham gia: nạp tuần + thỏa ước + lời mời song song; lỗi phần
          // phụ → null để hiển thị trung thực từng phần, không chặn cả trang.
          return Promise.all([
            Promise.resolve()
              .then(() => ctx.adapter.programWeeks(enrollment.program_key))
              .catch(() => null),
            Promise.resolve()
              .then(() => ctx.adapter.programAgreement(enrollment.program_key))
              .catch(() => null),
            Promise.resolve()
              .then(() => ctx.adapter.activitiesInvites())
              .catch(() => null),
          ]).then(([weeks, agreement, invites]) => ({
            enrollment, weeks, agreement, invites,
          }));
        })
        .then((data) => {
          if (cancelled || thisRun !== runId) return;
          if (data && data.enrollment && data.weeks === null
            && data.agreement === null) {
            // Đã tham gia nhưng không đọc được nội dung (mạng/lỗi máy chủ):
            // báo lỗi thật, không dựng trang rỗng giống "không có gì".
            renderLoadError(body, ctx, load);
            return;
          }
          renderCompanion(body, ctx, { demo, role, data, load });
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
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
  // Khóa chương trình của phiên trang này (progress/agreement cần) — lấy từ
  // weeks payload hoặc enrollment; không phải dữ liệu người dùng.
  currentPageProgramKey = (weeks && weeks.program_key)
    || (data && data.enrollment && data.enrollment.program_key)
    || null;
  if (demo) body.appendChild(createDemoBanner());

  const enrollment = data && data.enrollment;
  if (!enrollment) {
    renderNotEnrolled(body, ctx, { load });
    return;
  }

  if (!weeks) {
    // Có enrollment nhưng nội dung chưa đọc được (thường: chưa publish khi
    // migrate pin, hoặc lỗi mạng đã catch ở trên) — nói đúng từng trường hợp.
    body.appendChild(
      createEmptyState({
        title: "Chưa đọc được nội dung chương trình",
        description:
          "Bạn đã tham gia chương trình, nhưng máy chủ chưa trả được nội dung "
          + "tuần. Nếu lỗi tiếp diễn, nội dung có thể chưa được phát hành — vui "
          + "lòng quay lại sau.",
        action: { label: "Thử lại", onClick: () => load() },
      }),
    );
    renderPaperNote(body, null);
    return;
  }

  body.appendChild(h("h2", { class: "fb-page__heading" },
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
  weeks.weeks.forEach((week) => {
    body.appendChild(renderWeekCard(ctx, {
      week, role, suggested, invites: data.invites, agreement: data.agreement,
      otherPartyId: data.agreement && data.agreement.other_party_id,
      load,
    }));
  });

  body.appendChild(renderAgreementCard(ctx, {
    agreement: data.agreement, weeks, load,
  }));
  renderPaperNote(body, weeks.note_paper_guide);
  body.appendChild(renderOptOutCard(ctx, { enrollment, load }));
}

function renderNotEnrolled(body, ctx, { load }) {
  // Chưa tham gia: đọc catalog đã publish — tham gia là thao tác tường minh.
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
        renderPaperNote(body, null);
        return;
      }
      body.appendChild(h("h2", { class: "fb-page__heading" },
        "Chương trình Đồng hành bốn tuần"));
      body.appendChild(
        h("p", { class: "fb-page__note" },
          "Lộ trình bốn tuần tự nguyện cho bạn và người đồng hành. Xem trước "
          + "miễn phí — tham gia là một nút bấm, và bạn có thể nghỉ bất cứ lúc "
          + "nào mà không mất gì.",
        ),
      );
      programs.forEach((program) => {
        const weekTitles = (program.weeks || [])
          .map((week) => `Tuần ${week.week_no}: ${week.title}`)
          .join(" • ");
        body.appendChild(
          createCard({
            title: program.title,
            description: weekTitles || "Chương trình bốn tuần",
            footer: createButton({
              label: "Tham gia chương trình",
              variant: "primary",
              onClick: () => onEnroll(ctx, program, { load }),
            }),
          }),
        );
      });
      renderPaperNote(body, null);
    })
    .catch((error) => {
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      renderLoadError(body, ctx, load);
    });
}

function onEnroll(ctx, program, { load }) {
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
          Promise.resolve()
            .then(() => ctx.adapter.programEnroll({
              programKey: program.program_key,
              programRevision: program.revision,
            }))
            .then(() => load())
            .catch(() => {});
        },
      },
      { label: "Để sau", variant: "ghost" },
    ],
  });
  return dialog;
}

/* -------------------------------- Tuần -------------------------------- */

function renderWeekCard(ctx, { week, role, suggested, invites, agreement,
  otherPartyId, load }) {
  const isSuggested = suggested === week.week_no;
  const card = h("section", { class: "fb-scard" });
  const head = h("div", { class: "fb-sec__row" });
  head.appendChild(
    h("h2", { class: "fb-scard__title" }, `Tuần ${week.week_no} — ${week.title}`),
  );
  if (isSuggested) {
    head.appendChild(
      h("span", { class: "fb-chip" }, "Gợi ý tuần này"),
    );
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

  const jointKeys = Array.isArray(week.joint_activity_keys)
    ? week.joint_activity_keys : [];
  const myInvites = (invites && Array.isArray(invites.results)
    ? invites.results : []);

  jointKeys.forEach((key) => {
    const sentPending = myInvites.find((row) => row
      && row.content_key === key && row.direction === "sent"
      && row.status === "pending");
    const receivedPending = myInvites.find((row) => row
      && row.content_key === key && row.direction === "received"
      && row.status === "pending");

    const row = h("div", { class: "fb-compose__pause-buttons" });
    const statusChip = h("span", { class: "fb-chip" },
      `Hoạt động chung: ${key}`);
    card.appendChild(statusChip);

    if (receivedPending) {
      row.appendChild(createButton({
        label: "Chấp nhận cùng làm",
        variant: "primary",
        onClick: () => onRespond(ctx, receivedPending.invite_id, "accept",
          { load }),
      }));
      row.appendChild(createButton({
        label: "Từ chối",
        variant: "ghost",
        onClick: () => onRespond(ctx, receivedPending.invite_id, "decline",
          { load }),
      }));
    } else if (sentPending) {
      row.appendChild(h("span", { class: "fb-chip" },
        "Đã mời — đang chờ phía kia phản hồi"));
    } else {
      const inviteBtn = createButton({
        label: "Mời cùng làm hoạt động này",
        variant: "ghost",
        onClick: () => onInvite(ctx, {
          inviteeId: otherPartyId, contentKey: key, load,
        }),
      });
      if (!otherPartyId) {
        inviteBtn.disabled = true;
        inviteBtn.title = "Cần kết nối với người đồng hành trước";
      }
      row.appendChild(inviteBtn);
    }
    card.appendChild(row);
  });

  // Tiến độ CỦA MÌNH cho từng hoạt động (progress joint keys của F02).
  const activities = Array.isArray(week.activities) ? week.activities : [];
  activities.forEach((activity) => {
    const row = h("div", { class: "fb-compose__pause-buttons" });
    row.appendChild(
      h("span", { class: "fb-sec__sub" },
        `${activity.activity_key} — ${statusLabel(activity.status)}`),
    );
    if (activity.status === "done" || activity.status === "skipped") {
      row.appendChild(createButton({
        label: "Đặt lại",
        variant: "ghost",
        onClick: () => onProgress(ctx, {
          programKey: null, weekNo: week.week_no,
          activityKey: activity.activity_key, status: "reset", load,
        }),
      }));
    } else {
      row.appendChild(createButton({
        label: "Tôi đã làm",
        variant: "ghost",
        onClick: () => onProgress(ctx, {
          weekNo: week.week_no, activityKey: activity.activity_key,
          status: "done", load,
        }),
      }));
      row.appendChild(createButton({
        label: "Bỏ qua tuần này",
        variant: "ghost",
        onClick: () => onProgress(ctx, {
          weekNo: week.week_no, activityKey: activity.activity_key,
          status: "skipped", load,
        }),
      }));
    }
    card.appendChild(row);
  });
  return card;
}

function onProgress(ctx, { weekNo, activityKey, status, load }) {
  // program_key lấy từ tuần đang pin — adapter method đọc từ scope page;
  // đối chiếu weeks payload không mang program_key nên dùng biến trang.
  Promise.resolve()
    .then(() => ctx.adapter.programProgress({
      programKey: currentPageProgramKey || "",
      weekNo, activityKey, status,
    }))
    .then(() => load())
    .catch(() => {});
}

function onInvite(ctx, { inviteeId, contentKey, load }) {
  if (!inviteeId) return;
  Promise.resolve()
    .then(() => ctx.adapter.activitiesInvite({
      inviteeId, contentKey, contentRevision: 1,
    }))
    .then(() => load())
    .catch((error) => {
      if (error && error.status === 404) {
        // no_active_connection — chưa kết nối: thông điệp trung thực.
        const note = document.querySelector("[data-companion-note]");
        if (note) {
          note.textContent =
            "Mời hoạt động chung cần hai bên đã kết nối. Hãy hoàn thành ghép "
            + "đôi trước (xem Trang chủ).";
        }
      }
    });
}

function onRespond(ctx, inviteId, decision, { load }) {
  Promise.resolve()
    .then(() => ctx.adapter.activitiesRespond(inviteId, decision))
    .then(() => load())
    .catch(() => {});
}

/* ------------------------------ Thỏa ước ------------------------------ */

function renderAgreementCard(ctx, { agreement, weeks, load }) {
  const card = h("section", { class: "fb-scard" });
  const template = agreement && agreement.agreement_template
    ? agreement.agreement_template : (weeks.agreement || null);
  const instance = agreement && agreement.agreement ? agreement.agreement : null;

  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("h2", { class: "fb-scard__title" }, "Thỏa ước gia đình mới (tuần 4)"),
      h("span", { class: "fb-chip" },
        instance ? agreementStatusLabel(instance.status) : "Chưa có đề xuất"),
    ),
  );
  const commitments = instance && Array.isArray(instance.commitments)
    && instance.commitments.length
    ? instance.commitments
    : ((template && Array.isArray(template.commitments))
      ? template.commitments : []);
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

  const note = h("p", { class: "fb-page__note", role: "status" });
  note.dataset.companionNote = "1";

  if (!instance) {
    card.appendChild(createButton({
      label: "Đề xuất thỏa ước cho hai bên",
      variant: "primary",
      onClick: () => {
        note.textContent = "Đang tạo đề xuất thỏa ước…";
        Promise.resolve()
          .then(() => ctx.adapter.programAgreementPropose(
            currentPageProgramKey || ""))
          .then(() => load())
          .catch(() => {
            note.textContent = "Chưa tạo được đề xuất. Vui lòng thử lại.";
          });
      },
    }));
  } else if (instance.status === "proposed" || instance.status === "confirmed") {
    if (!instance.my_confirmed && instance.status === "proposed") {
      card.appendChild(createButton({
        label: "Tôi xác nhận thỏa ước này",
        variant: "primary",
        onClick: () => openAgreementConfirmDialog(ctx, instance,
          { load, note }),
      }));
    }
    if (instance.my_confirmed && instance.status === "proposed") {
      card.appendChild(
        h("p", { class: "fb-sec__sub", role: "status" },
          "Bạn đã xác nhận. Đang chờ người kia tự xác nhận cùng phiên bản…"),
      );
    }
    if (instance.status === "confirmed") {
      card.appendChild(
        h("p", { class: "fb-sec__sub", role: "status" },
          "Cả hai đã cùng xác nhận thỏa ước này. Hai bên đều đọc được các cam "
          + "kết trên bất cứ lúc nào."),
      );
    }
    if (instance.status === "proposed" && instance.proposed_by_me) {
      card.appendChild(createButton({
        label: "Rút đề xuất",
        variant: "ghost",
        onClick: () => {
          Promise.resolve()
            .then(() => ctx.adapter.programAgreementWithdraw(
              instance.agreement_id))
            .then(() => load())
            .catch(() => {});
        },
      }));
    }
  } else {
    // withdrawn / superseded / ended — nói đúng trạng thái, mở lối đề xuất lại
    card.appendChild(
      h("p", { class: "fb-sec__sub" },
        `Trạng thái hiện tại: ${agreementStatusLabel(instance.status)}.`),
    );
    if (instance.status === "withdrawn") {
      card.appendChild(createButton({
        label: "Đề xuất lại thỏa ước",
        variant: "ghost",
        onClick: () => {
          Promise.resolve()
            .then(() => ctx.adapter.programAgreementPropose(
              currentPageProgramKey || ""))
            .then(() => load())
            .catch(() => {});
        },
      }));
    }
  }
  card.appendChild(note);
  return card;
}

function openAgreementConfirmDialog(ctx, instance, { load, note }) {
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
          note.textContent = "Đang ghi nhận xác nhận của bạn…";
          Promise.resolve()
            .then(() => ctx.adapter.programAgreementConfirm(
              instance.agreement_id))
            .then(() => load())
            .catch(() => {
              note.textContent = "Chưa ghi được xác nhận. Vui lòng thử lại.";
            });
        },
      },
      { label: "Để sau", variant: "ghost" },
    ],
  });
  return dialog;
}

/* ------------------------------ Phụ trợ ------------------------------ */

function renderPaperNote(body, text) {
  body.appendChild(
    h("p", { class: "fb-page__note" },
      text
        || "Bạn hoàn toàn có thể dùng sổ giấy — app không bắt buộc ghi mọi thứ "
        + "vào máy, và không đọc sổ giấy của bạn.",
    ),
  );
}

function renderOptOutCard(ctx, { enrollment, load }) {
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
              Promise.resolve()
                .then(() => ctx.adapter.programOptOut(enrollment.program_key))
                .then(() => load())
                .catch(() => {});
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
