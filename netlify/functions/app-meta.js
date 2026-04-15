import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function json(body, init = {}) {
  const { headers = {}, status = 200 } = init;

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function extractRepository(repositoryUrl) {
  if (typeof repositoryUrl !== "string" || !repositoryUrl.trim()) return null;

  const sshMatch = repositoryUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  return null;
}

function formatVersion(version) {
  if (typeof version !== "string" || !version.trim()) return "Unknown";

  const normalized = version.trim().replace(/^v/i, "");
  return `v${normalized}`;
}

async function fetchLatestCommitDate(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "airfuel-tracker",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub metadata request failed: ${response.status}`);
  }

  const payload = await response.json();

  return payload?.commit?.committer?.date || payload?.commit?.author?.date || "";
}

async function readLocalGitMeta() {
  try {
    const [{ stdout: branchStdout }, { stdout: dateStdout }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      execFileAsync("git", ["log", "-1", "--format=%cI"]),
    ]);

    return {
      branch: branchStdout.trim(),
      lastModified: dateStdout.trim(),
    };
  } catch {
    return {
      branch: "",
      lastModified: "",
    };
  }
}

async function readPackageVersion() {
  try {
    const packageJson = await readFile(new URL("../../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(packageJson);
    return typeof parsed?.version === "string" ? parsed.version.trim() : "";
  } catch {
    return "";
  }
}

export default async () => {
  const localGitMeta = await readLocalGitMeta();
  const packageVersion = await readPackageVersion();
  const branch = process.env.BRANCH || process.env.HEAD || localGitMeta.branch || "";
  const commitRef = process.env.COMMIT_REF || "";
  const repository = extractRepository(process.env.REPOSITORY_URL || "");

  let lastModified = localGitMeta.lastModified || "";

  if (repository && (commitRef || branch)) {
    try {
      lastModified = await fetchLatestCommitDate(
        repository.owner,
        repository.repo,
        commitRef || branch
      );
    } catch {
      lastModified = localGitMeta.lastModified || "";
    }
  }

  return json(
    {
      branch: branch || "Unknown",
      softwareVersion: formatVersion(packageVersion),
      lastModified,
    },
    {
      headers: {
        "cache-control": "public, max-age=300",
      },
    }
  );
};
