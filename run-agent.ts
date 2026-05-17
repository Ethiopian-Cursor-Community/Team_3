import { readFileSync, unlinkSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

import { fixCIFailure } from "./agent";

interface AgentPayload {
  logs: string;
  repoUrl: string;
  branch: string;
}

// Hard kill after 3 min — fires if the internal 2-min timeout completes but
// abandoned SDK connections keep the event loop alive.
const hardKill = setTimeout(() => {
  console.error("[run-agent] Hard kill (6 min) — SDK connections still open, forcing exit");
  process.exit(2);
}, 6 * 60 * 1000);

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.error("[run-agent] Usage: tsx run-agent.ts <payload.json>");
    process.exit(1);
  }

  let payload: AgentPayload;
  try {
    payload = JSON.parse(readFileSync(payloadPath, "utf8")) as AgentPayload;
  } catch (err) {
    console.error("[run-agent] Failed to read payload:", err);
    process.exit(1);
  }

  console.log("[run-agent] Starting for", payload.repoUrl, "branch:", payload.branch);
  console.log("[run-agent] CURSOR_API_KEY loaded:", !!process.env.CURSOR_API_KEY);

  try {
    const prUrl = await fixCIFailure(payload.logs, payload.repoUrl, payload.branch);
    if (prUrl) {
      console.log("[run-agent] Done — PR:", prUrl);
    } else {
      console.log("[run-agent] Done — no PR URL returned");
    }
  } catch (err) {
    console.error("[run-agent] Unhandled error from fixCIFailure:", err);
  } finally {
    try { unlinkSync(payloadPath); } catch {}
    clearTimeout(hardKill);
    console.log("[run-agent] Exiting");
    // Required: SDK keeps HTTP connections open; without this the process hangs.
    process.exit(0);
  }
}

main();
