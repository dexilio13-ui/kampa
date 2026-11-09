#!/usr/bin/env node
/**
 * Secret scan for the shipped browser bundle.
 * Never prints a secret value: only the file and the matched rule.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const staticDir = path.join(root, ".next", "static");

if (!existsSync(staticDir)) {
  console.error("scan:secrets: .next/static is missing. Run `npm run build` first.");
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) files.push(...walk(full));
    else if (/\.(js|css|html|json|map|txt)$/.test(entry)) files.push(full);
  }
  return files;
}

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.length >= 12 && !/^(your|changeme|replace|example|xxx)/i.test(value)) {
      values[match[1]] = value;
    }
  }
  return values;
}

const envValues = {
  ...parseEnv(path.join(root, ".env")),
  ...parseEnv(path.join(root, ".env.local")),
  ...parseEnv(path.join(root, ".env.production")),
};

const patterns = [
  { name: "NEXT_PUBLIC_ variable", pattern: /NEXT_PUBLIC_[A-Z0-9_]+/g },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Google OAuth access token", pattern: /ya29\.[0-9A-Za-z_-]{20,}/g },
  { name: "Meta access token", pattern: /EAA[A-Za-z0-9]{50,}/g },
  { name: "Private key block", pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----/g },
  { name: "Bearer token literal", pattern: /Bearer\s+[A-Za-z0-9._~+/-]{30,}/g },
];

const findings = [];
const files = walk(staticDir);

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [name, value] of Object.entries(envValues)) {
    if (text.includes(value)) findings.push({ file, rule: `environment value ${name}` });
  }
  for (const rule of patterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) findings.push({ file, rule: rule.name });
  }
}

if (findings.length > 0) {
  console.error(`scan:secrets: ${findings.length} potential secret(s) found in the client bundle.`);
  for (const finding of findings) {
    console.error(`- ${path.relative(root, finding.file)}: ${finding.rule}`);
  }
  process.exit(1);
}

console.log(
  `scan:secrets: clean. ${files.length} client files checked; ${Object.keys(envValues).length} environment value(s) compared; no NEXT_PUBLIC variables or token-shaped strings.`,
);
