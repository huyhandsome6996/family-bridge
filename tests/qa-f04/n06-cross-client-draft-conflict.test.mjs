// tests/qa-f04/n06-cross-client-draft-conflict.test.mjs — A5 độc lập (F04R2-A5).
//
// Mục đích: probe mức CONTRACT qua HTTP + Django THẬT (spawn ephemeral) cho
// N06 (QA F04 19/10, P2 "stale save ghi đè im lặng draft client kia").
//
// Kịch bản N06 của audit (repro/ec29ab/cross_client_draft_conflict.mjs, browser):
//   cùng author HS mở 2 client; client B lưu body NEW (revision 1→2);
//   client A (giữ revision cũ) lưu body OLD → HTTP 200, revision 3,
//   server body thành OLD — bản B bị GHI ĐÈ IM LẶNG
//   (overwroteOtherClientWithoutConflict=true).
//
// Hợp đồng SAU FIX (worklog F04R2-LEAD-1, "Contract chốt"):
//   edit(expected_revision) → 409 {"error":{"code":"revision_conflict",
//   "details":{"reason":"draft_conflict","current_revision":N}}}; details
//   KHÔNG chứa body; client reconcile bằng GET. Ghi đè CÓ CHỦ Ý với
//   expected_revision ĐÚNG → 200.
//
// LỊCH SỬ PROBE (trung thực): chạy TRƯỚC fix (repo @ ec29abb) → ĐỎ:
//   POST /drafts/{id} kèm expected_revision hiện bị chặn là unknown field
//   (400 input_invalid "unknown_fields" — validation.reject_unknown_fields),
//   và edit không có optimistic concurrency (stale save vẫn 200 ghi đè).
//   Bằng chứng: f04-fix-evidence/a5/red-repo-probes.log.
//
// Chạy (từ repo root):
//   node --test tests/qa-f04/n06-cross-client-draft-conflict.test.mjs
// Yêu cầu: python3 venv có Django (F04_PROBE_PYTHON, mặc định
// /home/z/my-project/.venv/bin/python3). KHÔNG cần browser/node_modules.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  startProbeBackend,
  makeApi,
  setupPair,
} = await import(new URL("./helpers/spawn-backend.mjs", import.meta.url).href);

const backend = await startProbeBackend();
after(() => backend.stop());

const api = makeApi(backend.base);

// Marker tổng hợp — KHÔNG chứa dữ liệu thật.
const BASE_BODY = "A5_N06_BASE_Loi_nhan_goc_hai_client_deu_thay";
const B_BODY = "A5_N06_BAN_B_CLIENT_KIA_DA_LUU_TRUOC";
const A_STALE_BODY = "A5_N06_BAN_A_SOT_HAU_LUU_SAU_GHI_DE_TRANG";
const DELIB_BODY = "A5_N06_GHI_DE_CO_CHU_Y_SAU_KHI_RECONCILE";

async function createDraft(token, body, recipientId) {
  const r = await api("/drafts", {
    method: "POST",
    token,
    body: { kind: "text", body, recipient_id: recipientId || "" },
  });
  assert.equal(r.status, 201, `tạo draft → 201, nhận ${r.status}`);
  return r.data;
}

describe("A5 N06 — stale save không được ghi đè im lặng bản client kia (HTTP + Django thật)", () => {
  it("edit với expected_revision CŨ (client A giữ revision cũ) → 409 revision_conflict/draft_conflict + draft giữ bản mới của client B", async () => {
    const { hsToken: author, peerId } = await setupPair(api, backend.password, 941);
    const draft = await createDraft(author, BASE_BODY, peerId);
    assert.equal(draft.revision, 1, "revision khởi tạo = 1");

    // Client B lưu đúng revision hiện hành → 200, revision 2.
    const saveB = await api(`/drafts/${draft.draft_id}`, {
      method: "POST",
      token: author,
      body: { body: B_BODY, expected_revision: draft.revision },
    });
    assert.equal(saveB.status, 200,
      `client B lưu với expected_revision hiện hành → 200 (nhận ${saveB.status})`);
    assert.equal(saveB.data.revision, 2, "sau khi B lưu, revision = 2");

    // Client A còn giữ expected_revision=1 (stale) → máy chủ PHẢI từ chối.
    const saveA = await api(`/drafts/${draft.draft_id}`, {
      method: "POST",
      token: author,
      body: { body: A_STALE_BODY, expected_revision: 1 },
    });
    // Hợp đồng: 409 revision_conflict, details.reason = draft_conflict,
    // details.current_revision = bản hiện hành; details KHÔNG chứa body.
    assert.equal(saveA.status, 409,
      "N06: stale save phải 409 (nhận " + saveA.status + " — " +
      JSON.stringify(saveA.data) + ")");
    assert.equal(saveA.data?.error?.code, "revision_conflict",
      "N06: mã lỗi phải là revision_conflict");
    assert.equal(saveA.data?.error?.details?.reason, "draft_conflict",
      "N06: details.reason phải là draft_conflict (hợp đồng lead F04R2)");
    assert.equal(saveA.data?.error?.details?.current_revision, 2,
      "N06: details.current_revision phải trả revision hiện hành cho client reconcile");
    const errText = JSON.stringify(saveA.data);
    assert.ok(!errText.includes(A_STALE_BODY) && !errText.includes(B_BODY),
      "N06: error details KHÔNG được chứa body/private text");

    // Reconcile bằng GET: bản mới của B phải còn nguyên — KHÔNG ghi đè.
    const after = await api(`/drafts/${draft.draft_id}`, { token: author });
    assert.equal(after.status, 200);
    assert.equal(after.data.body, B_BODY,
      "N06: draft phải giữ bản client B (không bị A ghi đè im lặng)");
    assert.equal(after.data.revision, 2,
      "N06: revision không đổi sau khi stale save bị từ chối");
  });

  it("ghi đè CÓ CHỦ Ý: expected_revision ĐÚNG sau khi reconcile bằng GET → 200", async () => {
    const { hsToken: author, peerId } = await setupPair(api, backend.password, 942);
    const draft = await createDraft(author, BASE_BODY, peerId);

    const saveB = await api(`/drafts/${draft.draft_id}`, {
      method: "POST",
      token: author,
      body: { body: B_BODY, expected_revision: draft.revision },
    });
    assert.equal(saveB.status, 200, "client B lưu → 200");

    // Client A GET (reconcile) rồi CHỦ ĐÍCH ghi đè với revision mới nhất.
    const current = await api(`/drafts/${draft.draft_id}`, { token: author });
    assert.equal(current.status, 200);
    const deliberate = await api(`/drafts/${draft.draft_id}`, {
      method: "POST",
      token: author,
      body: { body: DELIB_BODY, expected_revision: current.data.revision },
    });
    assert.equal(deliberate.status, 200,
      "N06: ghi đè chủ ý với expected_revision đúng → 200 (nhận " +
      deliberate.status + " — " + JSON.stringify(deliberate.data) + ")");
    assert.equal(deliberate.data.revision, current.data.revision + 1,
      "revision bump đúng sau ghi đè chủ ý");
    const after = await api(`/drafts/${draft.draft_id}`, { token: author });
    assert.equal(after.data.body, DELIB_BODY);
  });
});
