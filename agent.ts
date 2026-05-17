import { Agent, CursorAgentError, type SDKAgent } from "@cursor/sdk";
import type { Run } from "@cursor/sdk";

const AGENT_RUN_TIMEOUT_MS = 3 * 60 * 1000;

function buildPrompt(logs: string, repoUrl: string): string {
  return `You are a CI failure fixer. A GitHub Actions workflow failed on ${repoUrl}.

## Task
1. Diagnose the root cause from the CI logs below.
2. Implement a minimal, correct fix in the repository.
3. Open a PR with a clear title and description explaining the failure and the fix.

## CI logs
\`\`\`
${logs}
\`\`\`

Fix the CI failure and open a PR.`;
}

function extractPrUrl(git: { branches: Array<{ prUrl?: string }> } | undefined): string | undefined {
  return git?.branches?.find((b) => b.prUrl)?.prUrl;
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "AgentTimeoutError";
}

async function withRunTimeout<T>(fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error("Agent run timed out after 3 minutes");
          err.name = "AgentTimeoutError";
          reject(err);
        }, AGENT_RUN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fixCIFailure(
  logs: string,
  repoUrl: string,
  branch = "main"
): Promise<string | undefined> {
  console.log("[agent] Starting fixCIFailure", { repoUrl, branch, logsLength: logs.length });
  console.log("[agent] API KEY loaded:", !!process.env.CURSOR_API_KEY);

  let agent: SDKAgent | undefined;
  let run: Run | undefined;

  try {
    console.log("[agent] Calling Agent.create...");
    agent = await Agent.create({
      apiKey: process.env.CURSOR_API_KEY!,
      model: { id: "composer-2" },
      cloud: {
        repos: [{ url: repoUrl, startingRef: branch }],
        autoCreatePR: true,
        skipReviewerRequest: true,
      },
    });
    console.log("[agent] Agent.create succeeded, agentId:", agent.agentId);
  } catch (err) {
    console.error("[agent] Agent.create failed:", err);
    return undefined;
  }

  try {
    const prUrl = await withRunTimeout(async () => {
      console.log("[agent] Calling agent.send...");
      run = await agent!.send(buildPrompt(logs, repoUrl));
      console.log("[agent] agent.send succeeded, runId:", run.id);

      let eventCount = 0;
      console.log("[agent] Starting stream...");
      for await (const event of run.stream()) {
        eventCount++;
        console.log(`[agent] Stream event #${eventCount}:`, event.type);
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text") process.stdout.write(block.text);
          }
        }
      }
      console.log(`[agent] Stream finished (${eventCount} events)`);

      console.log("[agent] Calling run.wait()...");
      const result = await run.wait();
      console.log("[agent] run.wait() completed, status:", result.status);

      if (result.status === "error") {
        throw new Error(`Agent run failed (${result.id})`);
      }

      const url = extractPrUrl(result.git);
      if (url) {
        console.log("[agent] PR URL:", url);
      } else {
        console.log("[agent] No PR URL in result.git");
      }
      return url;
    });

    return prUrl;
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error("[agent] Timeout: agent did not complete within 3 minutes");
      if (run?.supports("cancel")) {
        console.log("[agent] Cancelling run...");
        try {
          await run.cancel();
          console.log("[agent] Run cancelled");
        } catch (cancelErr) {
          console.error("[agent] Run cancel failed:", cancelErr);
        }
      }
      return undefined;
    }
    if (err instanceof CursorAgentError) {
      console.error("[agent] CursorAgentError:", err);
    } else {
      console.error("[agent] Error:", err);
    }
    return undefined;
  } finally {
    console.log("[agent] Disposing agent...");
    try {
      await agent?.[Symbol.asyncDispose]();
      console.log("[agent] Agent disposed");
    } catch (disposeErr) {
      console.error("[agent] Agent dispose failed:", disposeErr);
    }
  }
}
