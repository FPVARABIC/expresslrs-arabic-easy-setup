import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ignoredDirectories = new Set([
  ".git",
  ".research-worktrees",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
]);

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function destinations(source) {
  const matches = [];
  const patterns = [
    /!?\[[^\]]*\]\(([^)\n]+)\)/gu,
    /^\s*\[[^\]]+\]:\s*(\S+)/gmu,
    /\b(?:href|src)=["']([^"']+)["']/giu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] === undefined) {
        continue;
      }
      const line = source.slice(0, match.index).split("\n").length;
      matches.push({ raw: match[1].trim(), line });
    }
  }
  return matches;
}

function withoutFencedCode(source) {
  let fence = null;
  return source
    .split("\n")
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1] ?? null;
      if (fence === null && marker !== null) {
        fence = marker[0];
        return "";
      }
      if (fence !== null) {
        if (marker?.[0] === fence) {
          fence = null;
        }
        return "";
      }
      return line;
    })
    .join("\n");
}

function linkTarget(raw) {
  if (raw.startsWith("<")) {
    const closing = raw.indexOf(">");
    return closing === -1 ? raw : raw.slice(1, closing);
  }
  return raw.split(/\s+/u, 1)[0] ?? "";
}

function isExternalOrAnchor(target) {
  return (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(target)
  );
}

const errors = [];
const files = await markdownFiles(repositoryRoot);
let checkedLinks = 0;

for (const markdownFile of files) {
  const source = await readFile(markdownFile, "utf8");
  for (const destination of destinations(withoutFencedCode(source))) {
    const target = linkTarget(destination.raw);
    if (isExternalOrAnchor(target)) {
      continue;
    }

    const withoutFragment = target.split("#", 1)[0] ?? "";
    const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";
    let decoded;
    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      errors.push(
        `${path.relative(repositoryRoot, markdownFile)}:${destination.line}: malformed URL encoding in ${target}`,
      );
      continue;
    }

    const resolved = decoded.startsWith("/")
      ? path.resolve(repositoryRoot, `.${decoded}`)
      : path.resolve(path.dirname(markdownFile), decoded);
    const relative = path.relative(repositoryRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push(
        `${path.relative(repositoryRoot, markdownFile)}:${destination.line}: local link escapes the repository (${target})`,
      );
      continue;
    }

    checkedLinks += 1;
    try {
      await access(resolved);
    } catch {
      errors.push(
        `${path.relative(repositoryRoot, markdownFile)}:${destination.line}: missing local target ${target}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Markdown local-link check failed:");
  for (const error of [...new Set(errors)].sort()) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${checkedLinks} local links across ${files.length} Markdown files.`,
  );
}
