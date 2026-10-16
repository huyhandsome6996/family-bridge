// tests/proposal-entry.test.mjs — Phần A (kết nối HS/PH): đường đi từ home
// tới đề xuất ghép đôi từ lớp học (F16) và hành động hủy trên trang proposal.
//
// Hợp đồng: GET /api/v1/classroom/proposals (results[...] status:
// proposed|awaiting_confirmation|connected|declined|canceled),
// POST .../confirm | .../decline | .../cancel.
// Yêu cầu nghiệp vụ (task 2026-10-16 — Phần A):
//   - fresh login → home PHẢI có đường đi rõ tới /proposal khi còn đề xuất
//     mở; đăng nhập chưa đồng nghĩa đã ghép đôi (không tự xác nhận).
//   - home chưa kết nối + lỗi tải danh sách đề xuất → ghi chú trung thực +
//     lối xem trực tiếp, KHÔNG giả bộ "chưa có đề xuất".
//   - trang proposal: hủy theo API qua dialog xác nhận (destructive),
//     sau thao tác luôn tải lại trạng thái máy chủ.

// ---------------------------------------------------------------- globals
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

// --------------------------------------------------- app code (import sau globals)
const {
  clearSession, getSession, setSession,
} = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const homePage = (await import("../src/pages/home/index.js")).page;
const proposalPage = (await import("../src/pages/proposal/index.js")).page;

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
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-overlay").forEach((el) => el.remove());
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function liveSession() {
  setSession({
    token: `tok-${Math.random().toString(36).slice(2)}`,
    userId: "user-self",
    expiresAt: Date.now() + 120_000,
  });
}

/** Adapter stub tối thiểu cho trang chủ production (role student). */
function makeHomeAdapter({
  connections = [],
  proposals = [],
  proposalsError = null,
} = {}) {
  const calls = { listClassProposals: 0, cancelClassProposal: [] };
  return {
    calls,
    async listConnections() {
      return { results: connections, nextCursor: null };
    },
    async listMessages() {
      return { results: [], next: null };
    },
    async programMy() {
      return { results: [], nextCursor: null };
    },
    async listMoodEntries() {
      return { results: [], nextCursor: null };
    },
    async listClassProposals() {
      calls.listClassProposals += 1;
      if (proposalsError) throw proposalsError;
      return { results: proposals, nextCursor: null };
    },
    async cancelClassProposal(proposalId) {
      calls.cancelClassProposal.push(proposalId);
      return { proposal_id: proposalId, status: "canceled" };
    },
    async declineClassProposal(proposalId) {
      return { proposal_id: proposalId, status: "declined" };
    },
    async confirmClassProposal(proposalId) {
      return { proposal_id: proposalId, status: "awaiting_confirmation" };
    },
  };
}

function makeCtx({ role = "student", demo = false, adapter } = {}) {
  initStore({ demoMode: demo });
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

const PROPOSED = {
  proposal_id: "11111111-1111-4111-8111-111111111111",
  status: "proposed",
  my_role: "student",
  my_confirmed: false,
  counterpart_confirmed: false,
  counterpart: { display_name: "Mẹ Hoa", identity_basis: "self_declared" },
  revision: 3,
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-16T00:00:00Z",
};

// ---------------------------------------------------------------- home
describe("Home — đường đi tới đề xuất ghép đôi từ lớp (F16, Phần A)", () => {
  it("chưa kết nối + còn đề xuất mở → thẻ entry + CTA sang /proposal; KHÔNG tự xác nhận", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({ connections: [], proposals: [PROPOSED] });
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(50);
      const entry = host.querySelector("[data-proposal-entry='1']");
      assert.ok(entry, "phải có thẻ đề xuất ghép đôi trên home");
      const text = textOf(entry);
      assert.ok(text.includes("Lớp học đã ghép cặp cho bạn"), "title trung thực");
      assert.ok(text.includes("Mẹ Hoa"), "hiện tên đối tác (tự khai báo)");
      assert.ok(text.includes("tên tự khai báo"), "nhãn định danh trung thực");
      assert.ok(text.includes("CẢ HAI BÊN"), "nói rõ cần hai bên xác nhận");
      const cta = findButton(entry, "Xem và xác nhận ghép đôi");
      assert.ok(cta, "phải có CTA sang trang xác nhận");
      cta.click();
      assert.ok(navigateCalls.includes("/proposal"), "CTA điều hướng tới /proposal");
      // Không tự gửi xác nhận khi chỉ tải trang: adapter chưa nhận confirm nào.
      assert.equal(
        adapter.calls.listClassProposals > 0, true,
        "home gọi listClassProposals đúng một luồng có bound",
      );
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("chưa kết nối + đã xác nhận phía mình (awaiting) → chip 'Đang chờ phía kia', vẫn có CTA", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({
      connections: [],
      proposals: [{ ...PROPOSED, status: "awaiting_confirmation", my_confirmed: true,
        counterpart_confirmed: false, revision: 4 }],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(50);
      const entry = host.querySelector("[data-proposal-entry='1']");
      assert.ok(entry, "proposal đang chờ phía kia vẫn phải hiện trên home");
      assert.ok(textOf(entry).includes("Đang chờ phía kia"));
      assert.ok(findButton(entry, "Xem và xác nhận ghép đôi"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("chưa kết nối + không có đề xuất nào → KHÔNG thêm thẻ, giữ luồng mã mời", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({ connections: [], proposals: [] });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(50);
      assert.equal(host.querySelector("[data-proposal-entry='1']"), null);
      assert.equal(findButton(host, "Xem và xác nhận ghép đôi"), undefined);
      assert.ok(textOf(host).includes("Chưa kết nối với người đồng hành"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("lỗi tải danh sách đề xuất → ghi chú trung thực + lối xem trực tiếp (không giả bộ rỗng)", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({
      connections: [],
      proposalsError: Object.assign(new Error("network down"), { kind: "network" }),
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(50);
      const text = textOf(host);
      assert.ok(
        text.includes("Chưa kiểm tra được đề xuất ghép đôi từ lớp học"),
        "phải nói đúng là CHƯA KIỂM TRA được, không phải 'chưa có'",
      );
      const open = findButton(host, "Mở trang Xác nhận ghép nối");
      assert.ok(open, "phải còn lối trực tiếp tới trang xác nhận");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("đã có kết nối active → không thẻ đề xuất trên home (trạng thái kết nối là sự thật)", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({
      connections: [{
        connection_id: "c-1",
        status: "active",
        relationship_kind: "primary",
        counterpart: { display_name: "Mẹ Hoa" },
      }],
      proposals: [PROPOSED],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(80);
      assert.equal(host.querySelector("[data-proposal-entry='1']"), null);
      assert.ok(textOf(host).includes("Mẹ Hoa"), "home đã kết nối hiện người đồng hành");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("demo mode: không gọi listClassProposals (demo dùng fixture, không trộn dữ liệu thật)", async () => {
    clearSession();
    liveSession();
    const adapter = makeHomeAdapter({ connections: [], proposals: [PROPOSED] });
    const { ctx } = makeCtx({ role: "student", demo: true, adapter });
    const { host } = mount(homePage, ctx);
    try {
      await wait(50);
      assert.equal(adapter.calls.listClassProposals, 0);
      assert.equal(host.querySelector("[data-proposal-entry='1']"), null);
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

// ---------------------------------------------------------------- proposal
describe("Proposal — hủy đề xuất theo API qua dialog (Phần A)", () => {
  it("thẻ actionable có nút Hủy; dialog destructive gọi cancelClassProposal rồi tải lại danh sách", async () => {
    clearSession();
    liveSession();
    let listCalls = 0;
    const canceled = [];
    const adapter = {
      async listClassProposals() {
        listCalls += 1;
        return { results: listCalls === 1 ? [PROPOSED] : [], nextCursor: null };
      },
      async cancelClassProposal(proposalId) {
        canceled.push(proposalId);
        return { proposal_id: proposalId, status: "canceled" };
      },
      async confirmClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "awaiting_confirmation" };
      },
      async declineClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "declined" };
      },
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(proposalPage, ctx);
    try {
      await wait(50);
      const cancelBtn = findButton(host, "Hủy đề xuất này");
      assert.ok(cancelBtn, "thẻ actionable phải có nút hủy theo API");
      assert.ok(
        host.querySelector("input[type='checkbox'].fb-pairing__checkbox"),
        "checkbox tự nguyện vẫn hiện",
      );
      const confirmBtn = findButton(host, "Đúng người, tôi đồng ý kết nối");
      assert.equal(confirmBtn.disabled, true, "nút xác nhận bị khóa đến khi tự nguyện tích");

      cancelBtn.click();
      await wait(10);
      const dialogRoot = document.querySelector(".fb-dialog-root");
      assert.ok(dialogRoot, "hủy phải qua dialog xác nhận (destructive)");
      assert.equal(dialogRoot.querySelector(".fb-dialog").getAttribute("role"), "alertdialog");
      const dialogConfirm = Array.from(dialogRoot.querySelectorAll("button"))
        .find((btn) => textOf(btn) === "Hủy đề xuất");
      assert.ok(dialogConfirm, "dialog có nút xác nhận hủy");
      dialogConfirm.click();
      await wait(30);
      assert.deepEqual(canceled, [PROPOSED.proposal_id], "gọi đúng proposal_id");
      assert.ok(listCalls >= 2, "sau thao tác luôn tải lại trạng thái máy chủ");
      assert.ok(
        (document.querySelector(".fb-dialog-root")) === null,
        "dialog đóng sau thao tác",
      );
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("trạng thái awaiting_confirmation (thẻ trạng thái) vẫn có lối hủy qua dialog", async () => {
    clearSession();
    liveSession();
    const canceled = [];
    const adapter = {
      async listClassProposals() {
        return {
          results: [{
            ...PROPOSED,
            status: "awaiting_confirmation",
            my_confirmed: true,
            counterpart_confirmed: false,
          }],
          nextCursor: null,
        };
      },
      async cancelClassProposal(proposalId) {
        canceled.push(proposalId);
        return { proposal_id: proposalId, status: "canceled" };
      },
      async confirmClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "awaiting_confirmation" };
      },
      async declineClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "declined" };
      },
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(proposalPage, ctx);
    try {
      await wait(50);
      const cancelBtn = findButton(host, "Hủy đề xuất này");
      assert.ok(cancelBtn, "thẻ trạng thái chờ phía kia vẫn phải cho phép hủy");
      cancelBtn.click();
      await wait(10);
      const dialogConfirm = Array.from(
        document.querySelectorAll(".fb-dialog-root button"),
      ).find((btn) => textOf(btn) === "Hủy đề xuất");
      assert.ok(dialogConfirm);
      dialogConfirm.click();
      await wait(30);
      assert.deepEqual(canceled, [PROPOSED.proposal_id]);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("lỗi envelope backend thật (code input_invalid + details.reason) → hiện đúng thông điệp, không thông báo chung chung", async () => {
    clearSession();
    liveSession();
    // Envelope thật từ backend: InputInvalid -> {"error":{"code":"input_invalid",
    // "details":{"reason":"proposal_not_confirmable","status":"connected"}}}
    const realEnvelopeError = Object.assign(
      new Error("Không thể hoàn tất yêu cầu. Vui lòng thử lại."),
      {
        status: 400, kind: "http", code: "input_invalid",
        details: { reason: "proposal_not_confirmable", status: "connected" },
      },
    );
    let confirmCalls = 0;
    const adapter = {
      async listClassProposals() {
        // Lần 1: trả đề xuất; lần 2 (reload sau lỗi): giữ pending để quan sát
        // thông điệp lỗi trước khi trạng thái mới thay thế.
        if (confirmCalls === 0) {
          return { results: [PROPOSED], nextCursor: null };
        }
        return new Promise(() => {});
      },
      async confirmClassProposal() {
        confirmCalls += 1;
        throw realEnvelopeError;
      },
      async cancelClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "canceled" };
      },
      async declineClassProposal() {
        return { proposal_id: PROPOSED.proposal_id, status: "declined" };
      },
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(proposalPage, ctx);
    try {
      await wait(50);
      const checkbox = host.querySelector("input[type='checkbox'].fb-pairing__checkbox");
      checkbox.checked = true;
      checkbox.dispatchEvent(new domWindow.Event("change"));
      await wait(10);
      const confirmBtn = findButton(host, "Đúng người, tôi đồng ý kết nối");
      confirmBtn.click();
      await wait(40);
      const text = textOf(host);
      assert.equal(confirmCalls, 1);
      assert.ok(
        text.includes("không thể xác nhận ở trạng thái hiện tại"),
        `phải hiện thông điệp riêng cho proposal_not_confirmable, thực tế: ${text.slice(0, 220)}`,
      );
      assert.ok(
        !text.includes("Không thực hiện được thao tác"),
        "KHÔNG được rơi vào thông báo chung chung",
      );
    } finally {
      unmount(host);
      clearSession();
    }
  });
});
