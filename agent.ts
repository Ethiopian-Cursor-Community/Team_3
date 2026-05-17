import { Agent } from "@cursor/sdk";
import dotenv from "dotenv";
dotenv.config();

export async function fixCIFailure(logs: string, repoUrl: string) {
  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2" },
    cloud: {
      repos: [{ url: repoUrl, startingRef: "main" }],
      autoCreatePR: true,
    },
  });

  const run = await agent.send(`
    This GitHub Actions CI run failed. Here are the logs:
    ${logs}
    
    Find the root cause and fix it. Open a PR with the fix.
  `);

  for await (const event of run.stream()) {
    console.log(event);
  }
}