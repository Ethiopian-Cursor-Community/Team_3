import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import AdmZip from "adm-zip";

/**
 * Download GitHub Actions workflow run logs, extract the ZIP archive,
 * and return all log files concatenated as plain text.
 */
export async function fetchWorkflowLogs(
  owner: string,
  repo: string,
  runId: number
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required to fetch workflow logs"
    );
  }

  const octokit = new Octokit({ auth: token });

  let zipBuffer: Buffer;
  try {
    const { data } = await octokit.rest.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });

    zipBuffer = toBuffer(data);
  } catch (error) {
    if (error instanceof RequestError) {
      throw new Error(
        `GitHub API failed to download workflow logs for ${owner}/${repo} run ${runId} ` +
          `(status ${error.status}): ${error.message}`
      );
    }
    throw new Error(
      `Failed to download workflow logs for ${owner}/${repo} run ${runId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory);

  if (entries.length === 0) {
    throw new Error(
      `No log files found in workflow run archive for ${owner}/${repo} run ${runId}`
    );
  }

  const parts: string[] = [];
  for (const entry of entries.sort((a, b) =>
    a.entryName.localeCompare(b.entryName)
  )) {
    const content = entry.getData().toString("utf8");
    parts.push(`=== ${entry.entryName} ===\n${content}`);
  }

  const combined = parts.join("\n\n").trim();
  if (!combined) {
    throw new Error(
      `Workflow run logs were empty for ${owner}/${repo} run ${runId}`
    );
  }

  return combined;
}

/** Normalize Octokit binary response bodies to a Node Buffer. */
function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new Error("Unexpected response type from GitHub logs download");
}
