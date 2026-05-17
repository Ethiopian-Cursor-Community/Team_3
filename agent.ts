import { Agent, CursorAgentError, type SDKAgent } from "@cursor/sdk";
import type { Run } from "@cursor/sdk";

const AGENT_RUN_TIMEOUT_MS = 5 * 60 * 1000;

function buildPrompt(logs: string, repoUrl: string): string {
  return `You are a CI failure fixer. A GitHub Actions workflow failed on ${repoUrl}.

## Task
1. Diagnose the root cause from the CI logs and the repository files.
2. Implement a minimal, correct fix in the repository.
3. A pull request will be created automatically — focus on making the fix correct.

## CI logs
\`\`\`
${logs}
\`\`\`

Do not stop after diagnosis. Make the fix before finishing.`;
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
          const err = new Error("Agent run timed out after 5 minutes");
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
      local: {
        cwd: process.cwd(),
      },
    });
    console.log("[agent] Agent.create succeeded, agentId:", agent.agentId);
  } catch (err) {
    console.error("[agent] Agent.create failed:", err);
    return undefined;
  }

  try {
    await withRunTimeout(async () => {
      console.log("[agent] Calling agent.send...");
      run = await agent!.send(buildPrompt(logs, repoUrl));
      console.log("[agent] agent.send succeeded, runId:", run.id);

      let eventCount = 0;
      console.log("[agent] Starting stream...");
      for await (const event of run.stream()) {
        eventCount++;
        if (event.type === "tool_call") {
          console.log(`[agent] Stream event #${eventCount}: tool_call — ${(event as any).name ?? (event as any).tool ?? JSON.stringify(event).slice(0, 80)}`);
        } else if ((event as { type: string }).type === "tool_result") {
          const preview = JSON.stringify((event as any).output ?? (event as any).result ?? event).slice(0, 120);
          console.log(`[agent] Stream event #${eventCount}: tool_result — ${preview}`);
        } else {
          console.log(`[agent] Stream event #${eventCount}:`, event.type);
        }
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text") process.stdout.write(block.text);
          }
        }
      }
      console.log(`[agent] Stream finished (${eventCount} events)`);
    });

    return undefined;
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error("[agent] Agent timed out after 5 minutes");
      if (run) {
        console.log("[agent] Attempting run cancel...");
        try {
          await (run as any).cancel?.();
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
