import { readFileSync, unlinkSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

import { fixCIFailure } from "./agent";

interface AgentPayload {
  logs: string;
  repoUrl: string;
  branch: string;
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.error("Usage: tsx run-agent.ts <payload.json>");
    process.exit(1);
  }

  let payload: AgentPayload;
  try {
    payload = JSON.parse(readFileSync(payloadPath, "utf8")) as AgentPayload;
  } catch (err) {
    console.error("Failed to read payload:", err);
    process.exit(1);
  }

  try {
    const prUrl = await fixCIFailure(payload.logs, payload.repoUrl, payload.branch);
    if (prUrl) console.log(`Done — PR: ${prUrl}`);
    else console.log("Done — no PR URL in agent result");
  } catch (err) {
    console.error("Agent subprocess error:", err);
    process.exit(1);
  } finally {
    try {
      unlinkSync(payloadPath);
    } catch {
      // ignore
    }
  }
}

main();
