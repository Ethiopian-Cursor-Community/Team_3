import express from "express";
import { fixCIFailure } from "./agent";

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  const payload = req.body;

  // Only act on failed workflow runs
  if (
    payload.action === "completed" &&
    payload.workflow_run?.conclusion === "failure"
  ) {
    const repoUrl = payload.repository.html_url;
    const logs = `Workflow: ${payload.workflow_run.name}, Repo: ${repoUrl}`;

    console.log("CI failure detected, sending to agent...");
    fixCIFailure(logs, repoUrl);
    res.status(200).send("Agent triggered");
  } else {
    res.status(200).send("Not a failure, ignored");
  }
});

export default app;