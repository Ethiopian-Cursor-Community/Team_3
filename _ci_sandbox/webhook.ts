import express from "express";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const app = express();
app.use(express.json({ limit: "10mb" }));

interface WorkflowRunPayload {
  action?: string;
  workflow_run?: {
    id: number;
    name?: string;
    conclusion?: string;
    head_branch?: string;
    head_sha?: string;
    html_url?: string;
  };
  repository?: {
    full_name?: string;
    html_url?: string;
    clone_url?: string;
  };
}

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

async function fetchWorkflowLogs(
  fullName: string,
  runId: number,
  token: string
): Promise<string> {
  const [owner, repo] = fullName.split("/");
  const jobsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
    { headers: githubHeaders(token) }
  );

  if (!jobsRes.ok) {
    throw new Error(`GitHub jobs API ${jobsRes.status}: ${await jobsRes.text()}`);
  }

  const { jobs } = (await jobsRes.json()) as {
    jobs: Array<{ id: number; name: string; conclusion: string }>;
  };

  const failedJobs = jobs.filter((j) => j.conclusion === "failure");
  const targetJobs = failedJobs.length > 0 ? failedJobs : jobs;

  const sections: string[] = [];
  for (const job of targetJobs) {
    const logsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
      { headers: githubHeaders(token), redirect: "follow" }
    );
    if (logsRes.ok) {
      sections.push(`=== Job: ${job.name} (${job.conclusion}) ===\n${await logsRes.text()}`);
    }
  }

  return sections.join("\n\n") || "No job logs returned from GitHub API.";
}

function spawnAgentProcess(logs: string, repoUrl: string, branch: string): void {
  const payloadPath = join(tmpdir(), `ci-fixer-${Date.now()}.json`);
  writeFileSync(payloadPath, JSON.stringify({ logs, repoUrl, branch }));

  const scriptPath = join(process.cwd(), "run-agent.ts");
  const child = spawn("npx", ["tsx", scriptPath, payloadPath], {
    detached: true,
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  });

  child.unref();
  child.on("error", (err) => console.error("Failed to spawn agent subprocess:", err));
  console.log(`Agent subprocess started (pid ${child.pid ?? "unknown"})`);
}

function fallbackLogs(payload: WorkflowRunPayload): string {
  const run = payload.workflow_run!;
  return [
    `Workflow: ${run.name ?? "unknown"}`,
    `Run ID: ${run.id}`,
    `Branch: ${run.head_branch ?? "unknown"}`,
    `SHA: ${run.head_sha ?? "unknown"}`,
    `Run URL: ${run.html_url ?? "unknown"}`,
    "",
    "Set GITHUB_TOKEN in .env to fetch full job logs.",
  ].join("\n");
}

app.post("/webhook", async (req, res) => {
  const payload = req.body as WorkflowRunPayload;

  const isFailedRun =
    payload.action === "completed" &&
    payload.workflow_run?.conclusion === "failure";

  if (!isFailedRun) {
    res.status(200).send("Ignored: not a failed workflow run");
    return;
  }

  const run = payload.workflow_run!;
  const repository = payload.repository;

  if (!repository?.full_name) {
    res.status(400).send("Missing repository.full_name in payload");
    return;
  }

  const repoUrl = repository.html_url ?? repository.clone_url!.replace(/\.git$/, "");
  const branch = run.head_branch ?? "main";
  const token = process.env.GITHUB_TOKEN;

  let logs: string;
  try {
    logs = token
      ? await fetchWorkflowLogs(repository.full_name, run.id, token)
      : fallbackLogs(payload);
  } catch (err) {
    console.warn("Failed to fetch CI logs, using fallback:", (err as Error).message);
    logs = fallbackLogs(payload);
  }

  console.log(`CI failure: ${repository.full_name} run ${run.id} (${branch}), logsLength: ${logs.length}`);

  res.status(200).send("Agent triggered");
  spawnAgentProcess(logs, repoUrl, branch);
});

export default app;
