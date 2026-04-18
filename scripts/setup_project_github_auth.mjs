#!/usr/bin/env node

import process from "node:process";

import { resolveGitHubTokenInput, setupProjectGitHubAuth } from "./project_github_auth.mjs";

function printUsage() {
  console.log(`Usage:
  node scripts/setup_project_github_auth.mjs [options]

Options:
  --github-username <name>     GitHub username for this repo
  --github-token <token>       GitHub token for this repo
  --github-token-env <value>   Env var name or an already-expanded token value
  --git-user-name <name>       Optional local git user.name override
  --git-user-email <email>     Optional local git user.email override
  --remote <name>              Remote name to inspect (default: origin)
  --auth-file <path>           Repo-local auth file path (default: ./.project-local/github-auth.env)
  --help                       Show this help
`);
}

function parseCliArgs(argv) {
  const args = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const eqPos = token.indexOf("=");
    if (eqPos >= 0) {
      const key = token.slice(2, eqPos);
      args[key] = token.slice(eqPos + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }

  return args;
}

function getStringArg(args, key, defaultValue = "") {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return String(value);
}

async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printUsage();
    return;
  }

  const tokenEnvInput = getStringArg(args, "github-token-env", "");
  const githubToken =
    getStringArg(args, "github-token", "") ||
    (tokenEnvInput ? resolveGitHubTokenInput(tokenEnvInput, process.env) : "");

  const result = await setupProjectGitHubAuth({
    authFile: getStringArg(args, "auth-file", ""),
    githubToken,
    githubUsername: getStringArg(args, "github-username", ""),
    gitUserEmail: getStringArg(args, "git-user-email", ""),
    gitUserName: getStringArg(args, "git-user-name", ""),
    remoteName: getStringArg(args, "remote", "origin"),
  });

  console.log(`[github-auth] remote=${result.remoteUrl}`);
  console.log(`[github-auth] host=${result.host}`);
  console.log(`[github-auth] path=${result.path}`);
  console.log(`[github-auth] auth-file=${result.authFile}`);
  console.log("[github-auth] status=ok");
}

main().catch((error) => {
  console.error(`[github-auth] failed: ${error.message}`);
  process.exit(1);
});
