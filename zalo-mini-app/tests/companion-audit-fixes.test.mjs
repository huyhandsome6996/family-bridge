// tests/companion-audit-fixes.test.mjs — Regression cho 4 lỗi audit F02
// (R1–R4, kiểm thử 2026-10-16). Port assertion từ probe audit độc lập vào
// suite repo, KHÔNG phụ thuộc đường dẫn snapshot máy audit:
//
// R1 — payload weeks THẬT của backend chỉ có `activities:[{activity_key,
//      status}]` (không joint_activity_keys): UI vẫn phải dựng CTA
//      "Mời cùng làm" và gửi lời mời với revision từ catalog F09 thật
//      (revision >1, không hardcode 1); lời mời nhận được vẫn accept hai chiều.
// R2 — overview trả effective_agreement (confirmed) + pending_proposal: UI
//      phải hiện CẢ HAI, bản confirmed không bị ẩn khi có đề xuất mới.
// R4 — mutation lỗi (network/timeout/409-reason) phải hiện lỗi thật + cho
//      thử lại chủ động; chặn bấm lặp khi đang gửi; phản hồi của phiên cũ
//      (logout/đổi actor) không cập nhật UI của phiên mới.
//
// Chạy: node --test tests/companion-audit-fixes.test.mjs

import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const {
  clearSession, setSession, getSessionGeneration, clearSessionIfUnchanged,
  hasLiveSession, getUserId,
} = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const companionPage = (await import("../src/pages/companion/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
  host.remove();
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-overlay")
    .forEach((el) => el.remove());
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function liveSession(userId = "user-self") {
  setSession({
    token: `tok-${Math.random().toString(36).slice(2)}`,
    userId,
    expiresAt: Date.now() + 120_000,
  });
}

function makeCtx({ role = "student", adapter } = {}) {
  initStore({ demoMode: false });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    navigateCalls,
  };
}

// Shape THẬT xuất từ ProgramService.weeks_for_me (audit: real service
// payload) — CÓ activities, KHÔNG có joint_activity_keys trong response.
const REAL_SHAPE_WEEKS = {
  program_key: "family-4w",
  pinned_revision: 1,
  suggested_week: 1,
  agreement: { revision: 1, title: "A", commitments: ["c1"],
    accepted_by_me: false },
  suggested_note: null,
  note_paper_guide: "Bạn hoàn toàn có thể dùng sổ giấy.",
  weeks: [
    { week_no: 1, title: "T1", goals: [], student_guide: "s",
      caregiver_guide: "c",
      activities: [{ activity_key: "act-1", status: "none" }],
      locked: false },
    { week_no: 2, title: "T2", goals: [], student_guide: "s",
      caregiver_guide: "c", activities: [], locked: false },
    { week_no: 3, title: "T3", goals: [], student_guide: "s",
      caregiver_guide: "c", activities: [], locked: false },
    { week_no: 4, title: "T4", goals: [], student_guide: "s",
      caregiver_guide: "c", activities: [], locked: false },
  ],
};

const ENROLLMENT = { program_key: "family-4w", program_revision: 1,
  active: true };

function makeAdapter({
  weeksPayload = REAL_SHAPE_WEEKS,
  agreementPayload = { agreement: null,
    agreement_template: REAL_SHAPE_WEEKS.agreement,
    other_party_id: "user-peer", connection_generation: 1 },
  invites = [],
  activityCatalog = [
    { content_key: "act-1", kind: "activity", revision: 3,
      title: "Trò chuyện 5 phút", audience: "joint", minutes: 5,
      status: "published" },
  ],
  progressDelayMs = 0,
  progressError = null,
} = {}) {
  const calls = { progress: [], invite: [], myCount: 0 };
  return {
    calls,
    async programMy() {
      calls.myCount += 1;
      return { results: [ENROLLMENT] };
    },
    async programCatalog() {
      return { results: [] };
    },
    async programWeeks() {
      return weeksPayload;
    },
    async programAgreement() {
      return agreementPayload;
    },
    async activitiesInvites() {
      return { results: invites };
    },
    async activitiesCatalog() {
      return { results: activityCatalog };
    },
    async programProgress(payload) {
      calls.progress.push(payload);
      if (progressDelayMs) await wait(progressDelayMs);
      if (progressError) throw progressError;
      return { ...payload };
    },
    async activitiesInvite(payload) {
      calls.invite.push(payload);
      return { invite_id: "inv-1", status: "pending", direction: "sent" };
    },
    async activitiesRespond(id, decision) {
      return { invite_id: id, status: decision };
    },
    async programAgreementPropose() {
      return { agreement_id: "ag-1", status: "proposed" };
    },
    async programAgreementConfirm(id) {
      return { agreement_id: id, status: "confirmed" };
    },
    async programAgreementWithdraw(id) {
      return { agreement_id: id, status: "withdrawn" };
    },
    async programEnroll(payload) {
      return { ...ENROLLMENT };
    },
    async programOptOut() {
      return { active: false };
    },
  };
}

describe("R1 — payload weeks thật (activities, không joint_activity_keys)", () => {
  it("vẫn hiện CTA 'Mời cùng làm' và gửi mời với revision từ catalog F09 (>1)", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(
        REAL_SHAPE_WEEKS.weeks.some((w) => w.activities.length),
        "payload thật có hoạt động",
      );
      assert.ok(
        !("joint_activity_keys" in REAL_SHAPE_WEEKS.weeks[0]),
        "payload thật KHÔNG có joint_activity_keys",
      );
      const invite = findButton(host, "Mời cùng làm");
      assert.ok(invite,
        "payload backend thật phải dựng được CTA mời (không đọc field ma)");
      assert.equal(invite.disabled, false);
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite.length, 1);
      assert.equal(adapter.calls.invite[0].contentKey, "act-1");
      assert.equal(adapter.calls.invite[0].contentRevision, 3,
        "revision lấy từ catalog F09 (3), không hardcode 1");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("hoạt động không có trong catalog published → nút mời KHÓA với lý do trung thực", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ activityCatalog: [] });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const invite = findButton(host, "Mời cùng làm");
      assert.ok(invite, "nút vẫn hiện để nói lý do");
      assert.equal(invite.disabled, true,
        "không thể mời nội dung chưa phát hành — phải khóa nút");
      assert.ok(invite.title && invite.title.length > 4,
        "nút khóa phải kèm lý do (title)");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("chip hoạt động hiện tiêu đề + thời lượng từ nguồn F09 thật", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(textOf(host).includes("Trò chuyện 5 phút"),
        "hiện tiêu đề thật từ catalog");
      assert.ok(textOf(host).includes("khoảng 5 phút"), "hiện thời lượng");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("R2 — overview phân biệt bản hiệu lực (confirmed) và đề xuất chờ", () => {
  it("confirmed rev 1 + pending rev 2 → UI hiện CẢ HAI, bản hiệu lực không bị ẩn", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      agreementPayload: {
        agreement: {
          agreement_id: "ag-2", status: "proposed",
          agreement_revision: 2, my_confirmed: false,
          counterpart_confirmed: false, proposed_by_me: true,
          commitments: ["cam kết v2"],
        },
        effective_agreement: {
          agreement_id: "ag-1", status: "confirmed",
          agreement_revision: 1, my_confirmed: true,
          counterpart_confirmed: true, proposed_by_me: true,
          commitments: ["cam kết v1"],
        },
        pending_proposal: {
          agreement_id: "ag-2", status: "proposed",
          agreement_revision: 2, my_confirmed: false,
          counterpart_confirmed: false, proposed_by_me: true,
          commitments: ["cam kết v2"],
        },
        agreement_template: REAL_SHAPE_WEEKS.agreement,
        other_party_id: "user-peer", connection_generation: 1,
      },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const text = textOf(host);
      assert.ok(text.includes("Bản đang hiệu lực: rev 1"),
        "bản confirmed đang hiệu lực phải hiện rõ");
      assert.ok(text.includes("Cả hai đã cùng xác nhận"),
        "văn bản confirmed giữ nguyên ý nghĩa");
      assert.ok(text.includes("đang chờ hai"),
        "đề xuất chờ phải hiện kèm rõ là bản chờ");
      assert.ok(findButton(host, "Tôi xác nhận thỏa ước"),
        "vẫn xác nhận được bản pending");
      assert.ok(findButton(host, "Rút đề xuất"),
        "proposer rút được bản pending");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("R4 — mutation lỗi trung thực, chặn bấm lặp, phiên cũ không đụng UI mới", () => {
  it("lưu tiến độ lỗi mạng → hiện lỗi + 'thử lại' trong trang, nút bật lại cho thử lại chủ động", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      progressError: Object.assign(new Error("synthetic offline"),
        { kind: "network", status: 0 }),
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const button = findButton(host, "Tôi đã làm");
      assert.ok(button);
      button.click();
      await wait(80);
      assert.equal(adapter.calls.progress.length, 1);
      assert.match(textOf(host),
        /chưa được ghi|thử lại|lỗi/i,
        "API từ chối phải hiện lỗi thật trong trang, không nuốt");
      assert.equal(button.disabled, false,
        "nút bật lại để người dùng CHỦ ĐỘNG thử lại");
      assert.ok(adapter.calls.myCount <= 1,
        "lỗi mutation không gây re-render như thành công");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("đang gửi → nút khóa, bấm lặp không gửi lần hai (chỉ 1 call)", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ progressDelayMs: 120 });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const button = findButton(host, "Tôi đã làm");
      assert.ok(button);
      button.click();
      button.click();
      button.click();
      await wait(200);
      assert.equal(adapter.calls.progress.length, 1,
        "loading phải chặn bấm lặp — chỉ 1 mutation");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("phản hồi cũ sau logout/đổi actor KHÔNG cập nhật UI của phiên mới", async () => {
    clearSession();
    liveSession("user-self");
    const adapter = makeAdapter({ progressDelayMs: 150 });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const myCountBefore = adapter.calls.myCount;
      const button = findButton(host, "Tôi đã làm");
      button.click();
      // Đổi actor giữa chừng: phiên mới, user khác.
      clearSession();
      liveSession("user-other");
      await wait(250);
      assert.equal(adapter.calls.myCount, myCountBefore,
        "kết quả của phiên cũ không được load lại UI cho phiên mới");
      assert.match(textOf(host), /Chưa làm/,
        "trạng thái tiến độ của phiên mới không bị ghi đè bởi phiên cũ");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("propose bị chặn (agreement_revision_outdated) → hiện đúng lý do, không nuốt", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      agreementPayload: {
        agreement: {
          agreement_id: "ag-old", status: "withdrawn",
          agreement_revision: 1, proposed_by_me: true,
          commitments: [],
        },
        agreement_template: REAL_SHAPE_WEEKS.agreement,
        other_party_id: "user-peer", connection_generation: 1,
      },
    });
    adapter.programAgreementPropose = async () => {
      throw Object.assign(new Error("400"), {
        kind: "http", status: 400,
        details: { reason: "agreement_revision_outdated" },
      });
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const propose = findButton(host, "Đề xuất lại thỏa ước");
      assert.ok(propose);
      propose.click();
      await wait(60);
      assert.match(textOf(host), /đã có bản hiệu lực mới hơn/,
        "lý do nghiệp vụ phải hiện đúng, không nuốt lỗi");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("BUG-F02-02: 401 swallowed in parallel GETs & session handling", () => {
  function makeRuntimeAuthedAdapter(baseMethods) {
    const wrapped = {};
    for (const [key, fn] of Object.entries(baseMethods)) {
      if (typeof fn !== "function") {
        wrapped[key] = fn;
        continue;
      }
      wrapped[key] = async (...args) => {
        const capturedGen = getSessionGeneration();
        let res;
        try {
          res = await fn(...args);
        } catch (err) {
          if (getSessionGeneration() !== capturedGen) {
            throw Object.assign(new Error("stale"), { kind: "stale_session", status: 0 });
          }
          if (err && err.status === 401) {
            clearSessionIfUnchanged(capturedGen);
          }
          throw err;
        }
        if (getSessionGeneration() !== capturedGen) {
          throw Object.assign(new Error("stale"), { kind: "stale_session", status: 0 });
        }
        return res;
      };
    }
    return wrapped;
  }

  it("một trong 4 request song song bị 401 (activitiesInvites) -> redirect /login?reason=expired", async () => {
    clearSession();
    liveSession("user-self");
    const baseAdapter = makeAdapter();
    baseAdapter.activitiesInvites = async () => {
      throw Object.assign(new Error("Unauthorized"), { status: 401, kind: "http" });
    };
    const adapter = makeRuntimeAuthedAdapter(baseAdapter);
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(navigateCalls.includes("/login?reason=expired"),
        "khi invites bị 401, trang phải chuyển hướng /login?reason=expired");
      assert.equal(hasLiveSession(), false, "phiên phải bị xóa khi gặp 401");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("cả 4 request song song đều bị 401 -> redirect /login?reason=expired, không hiện lỗi chung", async () => {
    clearSession();
    liveSession("user-self");
    const baseAdapter = makeAdapter();
    const make401 = () => async () => {
      throw Object.assign(new Error("Unauthorized"), { status: 401, kind: "http" });
    };
    baseAdapter.programWeeks = make401();
    baseAdapter.programAgreement = make401();
    baseAdapter.activitiesInvites = make401();
    baseAdapter.activitiesCatalog = make401();
    const adapter = makeRuntimeAuthedAdapter(baseAdapter);
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(navigateCalls.includes("/login?reason=expired"),
        "khi cả 4 đều 401, phải chuyển hướng /login?reason=expired");
      assert.equal(hasLiveSession(), false, "phiên phải bị xóa khi gặp 401");
      assert.doesNotMatch(textOf(host), /Không tải được chương trình/,
        "không được hiện màn hình lỗi chung khi phiên đã hết hạn");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("stale 401 sau khi logout KHÔNG điều hướng /login?reason=expired", async () => {
    clearSession();
    liveSession("user-self");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const baseAdapter = makeAdapter();
    baseAdapter.programWeeks = async () => {
      await gate;
      throw Object.assign(new Error("Unauthorized"), { status: 401, kind: "http" });
    };
    const adapter = makeRuntimeAuthedAdapter(baseAdapter);
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(30);
      // Người dùng đăng xuất chủ động
      clearSession();
      release();
      await wait(60);
      assert.ok(!navigateCalls.includes("/login?reason=expired"),
        "401 cũ sau khi logout không được kích hoạt redirect expired");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("stale 401 sau khi đổi actor KHÔNG làm mất phiên của actor mới và không redirect", async () => {
    clearSession();
    liveSession("user-self");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const baseAdapter = makeAdapter();
    baseAdapter.programWeeks = async () => {
      await gate;
      throw Object.assign(new Error("Unauthorized"), { status: 401, kind: "http" });
    };
    const adapter = makeRuntimeAuthedAdapter(baseAdapter);
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(30);
      // Đổi sang actor khác
      clearSession();
      liveSession("user-other");
      release();
      await wait(60);
      assert.ok(!navigateCalls.includes("/login?reason=expired"),
        "401 của actor cũ không được redirect actor mới sang login expired");
      assert.equal(hasLiveSession(), true, "phiên của actor mới phải còn nguyên");
      assert.equal(getUserId(), "user-other");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("lỗi non-401 (500) ở một phần phụ vẫn hiển thị phần dùng được và không redirect", async () => {
    clearSession();
    liveSession("user-self");
    const baseAdapter = makeAdapter();
    baseAdapter.activitiesInvites = async () => {
      throw Object.assign(new Error("Server error"), { status: 500, kind: "http" });
    };
    baseAdapter.activitiesCatalog = async () => {
      throw Object.assign(new Error("Server error"), { status: 500, kind: "http" });
    };
    const adapter = makeRuntimeAuthedAdapter(baseAdapter);
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.equal(navigateCalls.length, 0, "không được điều hướng login khi lỗi non-401");
      // Stitch handoff 21/10 (M07): heading tách eyebrow "Chương trình tự
      // nguyện" + h2 "Đồng hành bốn tuần" — assertion cập nhật theo copy mới.
      assert.match(textOf(host), /Đồng hành bốn tuần/,
        "vẫn hiển thị nội dung chương trình tuần dùng được");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

