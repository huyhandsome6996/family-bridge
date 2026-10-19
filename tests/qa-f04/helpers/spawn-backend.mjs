// tests/qa-f04/helpers/spawn-backend.mjs — A5 (F04R2-A5).
//
// Spawn Django THẬT (tests/qa-f04/helpers/f04_probe_backend.py) trên port rảnh
// với sqlite EPHEMERAL trong tmp, rồi trả client HTTP tối giản. Mẫu dựng theo
// audit repro/ec29ab (audit_server.py + prepare_browser.py) — browser không cần
// vì probe N03/N06 mức contract đi thẳng HTTP (hai "client" = hai token riêng).
//
// Chỉ dùng trong tests/qa-f04/** — KHÔNG đụng server/port của ai khác:
// port được xin từ kernel (listen 0) rồi nhả ra ngay trước khi cấp cho Django.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const HELPERS_DIR = fileURLToPath(new URL(".", import.meta.url));
const PYTHON = process.env.F04_PROBE_PYTHON
  || "/home/z/my-project/.venv/bin/python3";

export async function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Đợi Django trả 401 trên /api/v1/drafts (chưa auth) = server sẵn sàng. */
async function waitReady(base, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/v1/drafts`);
      if (r.status === 401) return;
      last = `status ${r.status}`;
    } catch (error) {
      last = String(error.cause || error);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`probe backend không sẵn sàng: ${last}`);
}

export async function startProbeBackend() {
  const port = await reserveFreePort();
  const workDir = mkdtempSync(join(tmpdir(), "f04-a5-probe-"));
  const child = spawn(PYTHON, [join(HELPERS_DIR, "f04_probe_backend.py")], {
    env: {
      ...process.env,
      F04_PROBE_PORT: String(port),
      F04_PROBE_DB: join(workDir, "probe.sqlite3"),
      FB_AI_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderrChunks = [];
  child.stderr.on("data", (d) => stderrChunks.push(String(d)));

  const ready = new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error(`probe backend timeout — stderr: ${stderrChunks.join("").slice(-2000)}`)),
      60_000,
    );
    child.stdout.on("data", (d) => {
      buffer += String(d);
      const line = buffer.split("\n").find((l) => l.startsWith("PROBE_READY "));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line.slice("PROBE_READY ".length)));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`probe backend exit sớm code=${code}: ${stderrChunks.join("").slice(-2000)}`));
    });
  });

  const info = await ready;
  const base = `http://127.0.0.1:${info.port}`;
  await waitReady(base);

  return {
    base,
    password: info.password,
    child,
    stderrTail: () => stderrChunks.join("").slice(-2000),
    stop() {
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}

/** API helper — giống audit repro/ec29ab (paths dạng "/auth/class-session"
 * dưới tiền tố /api/v1): ném lỗi khi >=400 kèm JSON lỗi. */
export function makeApi(base) {
  return async function api(path, { method = "GET", token, body } = {}) {
    const r = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  };
}

/** Tiền điều kiện parity browser_e2e của audit: login 2 đầu, consent
 * service/ai, confirm proposal → kết nối active HS/PH cùng chỉ số. */
export async function setupPair(api, password, n) {
  async function login(code) {
    const r = await api("/auth/class-session", {
      method: "POST",
      body: { code, password },
    });
    if (r.status !== 200) throw new Error(`login ${code} -> ${r.status}`);
    return r.data.token;
  }
  async function consent(token) {
    for (const [purpose, policy_version] of [["service", "service-v1"], ["ai_processing", "ai-v1"]]) {
      const r = await api("/consents", {
        method: "POST", token, body: { purpose, policy_version, decision: "accepted" },
      });
      if (r.status > 201) throw new Error(`consent ${purpose} -> ${r.status}`);
    }
  }
  const hs = await login(`HS${n}`);
  const ph = await login(`PH${n}`);
  await consent(hs);
  await consent(ph);
  const proposals = await api("/classroom/proposals", { token: hs });
  const proposal = (proposals.data.results || [])[0];
  if (!proposal) throw new Error(`HS${n}: không có proposal`);
  if (proposal.status === "proposed") {
    for (const token of [hs, ph]) {
      const c = await api(`/classroom/proposals/${proposal.proposal_id}/confirm`, {
        method: "POST", token, body: {},
      });
      if (c.status !== 200) throw new Error(`proposal confirm HS${n} -> ${c.status}`);
    }
  }
  const conn = await api("/connections", { token: hs });
  const peer = (conn.data.results || [])[0]?.other_party_id;
  if (!peer) throw new Error(`HS${n}: không có connection active sau setup`);
  return { hsToken: hs, phToken: ph, peerId: peer };
}
