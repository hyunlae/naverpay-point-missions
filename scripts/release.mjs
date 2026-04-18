#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function isSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version ?? "").trim());
}

export function formatChangelogEntry({ version, date, notes }) {
  const normalizedNotes = Array.isArray(notes)
    ? notes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const lines = [`## ${version} - ${date}`];
  if (normalizedNotes.length === 0) {
    lines.push("- Release prepared");
  } else {
    lines.push(...normalizedNotes.map((note) => `- ${note}`));
  }
  return `${lines.join("\n")}\n`;
}

function removeVersionSections(body, version) {
  const normalizedBody = String(body ?? "").trimStart();
  if (!normalizedBody) {
    return "";
  }

  const lines = normalizedBody.split("\n");
  const sections = [];
  let currentSection = [];

  for (const line of lines) {
    if (line.startsWith("## ") && currentSection.length > 0) {
      sections.push(currentSection.join("\n").trimEnd());
      currentSection = [line];
      continue;
    }

    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n").trimEnd());
  }

  return sections
    .filter((section) => !section.startsWith(`## ${version} - `))
    .join("\n\n")
    .trimStart();
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function updatePackageJson(packageJsonPath, version) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = version;
  await writeFile(`${packageJsonPath}`, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function updateVersionFile(versionFilePath, version) {
  await writeFile(versionFilePath, `${version}\n`, "utf8");
}

async function updateChangelog(changelogPath, version, date, notes) {
  let existing = "";
  try {
    existing = await readFile(changelogPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const title = "# Changelog\n\n";
  const body = existing.startsWith("# Changelog\n")
    ? existing.slice("# Changelog\n".length).replace(/^\n*/, "")
    : existing;
  const entry = formatChangelogEntry({ version, date, notes });
  const normalizedBody = removeVersionSections(body, version);
  const next = `${title}${entry}\n${normalizedBody}`.replace(/\n{3,}/g, "\n\n");
  await writeFile(changelogPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

export async function prepareRelease(options = {}) {
  const repoDir = path.resolve(options.repoDir || process.cwd());
  const version = String(options.version || "").trim();
  const date = String(options.date || todayIsoDate()).trim();
  const notes = Array.isArray(options.notes) ? options.notes : [];

  if (!isSemver(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const packageJsonPath = path.join(repoDir, "package.json");
  const versionFilePath = path.join(repoDir, "VERSION");
  const changelogPath = path.join(repoDir, "CHANGELOG.md");

  await updatePackageJson(packageJsonPath, version);
  await updateVersionFile(versionFilePath, version);
  await updateChangelog(changelogPath, version, date, notes);

  return {
    version,
    date,
    changelogPath,
    packageJsonPath,
    versionFilePath,
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/release.mjs --version <semver> [options]

Options:
  --version <semver>           Release version to prepare
  --date <YYYY-MM-DD>          Release date (default: today)
  --notes <text>               Release note line (repeatable via semicolon-separated text)
  --help                       Show this help
`);
}

async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printUsage();
    return;
  }

  const version = getStringArg(args, "version", "");
  const notes = getStringArg(args, "notes", "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const result = await prepareRelease({
    version,
    date: getStringArg(args, "date", todayIsoDate()),
    notes,
  });

  console.log(`[release] version=${result.version}`);
  console.log(`[release] date=${result.date}`);
  console.log(`[release] status=ok`);
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`[release] failed: ${error.message}`);
    process.exit(1);
  });
}
