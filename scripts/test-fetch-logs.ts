import dotenv from "dotenv";
dotenv.config();

import { fetchWorkflowLogs } from "../src/github";

async function main() {
  const owner = process.env.OWNER ?? "Ethiopian-Cursor-Community";
  const repo = process.env.REPO ?? "Team_3";
  const runId = Number(process.env.TEST_RUN_ID ?? "0");

  if (!runId) {
    throw new Error(
      "Set TEST_RUN_ID to a real failed workflow run ID (see Actions URL)"
    );
  }

  const logs = await fetchWorkflowLogs(owner, repo, runId);
  console.log(logs.slice(0, 1000));
  console.log(`\n--- total length: ${logs.length} characters ---`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
