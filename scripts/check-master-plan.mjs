import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const masterPlanPath = path.join(repositoryRoot, "MASTER_PLAN.md");
const source = await readFile(masterPlanPath, "utf8");

const numberedHeadings = [...source.matchAll(/^#\s+(\d+)\.\s+(.+)$/gmu)].map(
  (match) => ({
    number: Number(match[1]),
    title: match[2]?.trim() ?? "",
    offset: match.index,
  }),
);
const errors = [];

if (numberedHeadings.length !== 449) {
  errors.push(
    `expected 449 numbered level-one headings, found ${numberedHeadings.length}`,
  );
}

for (let index = 0; index < numberedHeadings.length; index += 1) {
  const heading = numberedHeadings[index];
  const expected = index + 1;
  if (heading?.number !== expected) {
    errors.push(
      `heading position ${expected} must be # ${expected}., found # ${heading?.number ?? "missing"}.`,
    );
  }
  if (heading?.title === "") {
    errors.push(`heading # ${expected}. has no title`);
  }
  if (heading !== undefined) {
    const bodyStart = source.indexOf("\n", heading.offset) + 1;
    const bodyEnd =
      numberedHeadings[index + 1]?.offset ??
      source.indexOf("\n# END OF MASTER PLAN", bodyStart);
    if (
      bodyStart === 0 ||
      bodyEnd < bodyStart ||
      source.slice(bodyStart, bodyEnd).trim() === ""
    ) {
      errors.push(`heading # ${expected}. has no section content`);
    }
  }
}

const endMarkers = [...source.matchAll(/^# END OF MASTER PLAN\s*$/gmu)];
if (endMarkers.length !== 1) {
  errors.push(
    `expected exactly one level-one END OF MASTER PLAN marker, found ${endMarkers.length}`,
  );
} else if (
  numberedHeadings.at(-1) !== undefined &&
  (endMarkers[0]?.index ?? -1) <= numberedHeadings.at(-1).offset
) {
  errors.push("END OF MASTER PLAN must appear after heading # 449.");
}

if (errors.length > 0) {
  console.error("Master Plan contract check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Verified MASTER_PLAN.md headings 1–449 in order and END OF MASTER PLAN.",
  );
}
