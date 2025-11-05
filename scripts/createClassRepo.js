// scripts/createClassRepo.js
// Minimal smoke-test script for GitHub Actions
import { Octokit } from "@octokit/rest";

async function main() {
  console.log("createClassRepo.js starting...");

  const token = process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Missing PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN in env");
    process.exit(2);
  }

  const octokit = new Octokit({ auth: token });
  const owner = process.env.GITHUB_OWNER || "ready4exam";
  const repo = process.env.TARGET_REPO || "ready4exam-test";

  console.log(`Will list repositories for owner=${owner} and target repo=${repo}`);
  try {
    const res = await octokit.repos.get({
      owner,
      repo
    });
    console.log("Target repo exists:", res.data.full_name);
  } catch (err) {
    if (err.status === 404) {
      console.warn("Target repo not found (this is OK if you're creating it via the workflow).");
    } else {
      console.error("Octokit error:", err.message);
      process.exit(3);
    }
  }

  console.log("smoke test complete");
}

main().catch(e => {
  console.error("Unhandled error:", e);
  process.exit(10);
});
