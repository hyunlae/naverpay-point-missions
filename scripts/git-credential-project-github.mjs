#!/usr/bin/env node

import process from "node:process";

import {
  loadGitHubAuthFile,
  parseCredentialRequest,
  resolveCredentialResponse,
} from "./project_github_auth.mjs";

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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  const operation = args._[0] || "";
  if (operation !== "get") {
    return;
  }

  const authFile = getStringArg(args, "auth-file", "");
  const configuredHost = getStringArg(args, "host", "");
  const configuredPath = getStringArg(args, "path", "");
  if (!authFile || !configuredHost || !configuredPath) {
    return;
  }

  const request = parseCredentialRequest(await readStdin());
  const authConfig = await loadGitHubAuthFile(authFile);
  const response = resolveCredentialResponse(request, {
    ...authConfig,
    host: configuredHost,
    path: configuredPath,
  });
  if (!response) {
    return;
  }

  process.stdout.write(`username=${response.username}\n`);
  process.stdout.write(`password=${response.password}\n`);
}

main().catch(() => {
  process.exit(0);
});
