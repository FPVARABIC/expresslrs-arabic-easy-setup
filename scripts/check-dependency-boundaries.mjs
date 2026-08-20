import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * This is the reviewed Foundation dependency direction. Adding a workspace
 * package or edge requires an explicit policy update, so architecture cannot
 * drift through an otherwise valid TypeScript import.
 */
const allowedWorkspaceDependencies = new Map([
  ["@elrs-easy/domain", new Set()],
  ["@elrs-easy/device", new Set(["@elrs-easy/domain"])],
  ["@elrs-easy/compatibility", new Set(["@elrs-easy/domain"])],
  [
    "@elrs-easy/workflows",
    new Set([
      "@elrs-easy/domain",
      "@elrs-easy/device",
      "@elrs-easy/compatibility",
    ]),
  ],
  [
    "@elrs-easy/platform-mock",
    new Set([
      "@elrs-easy/domain",
      "@elrs-easy/device",
      "@elrs-easy/compatibility",
      "@elrs-easy/workflows",
    ]),
  ],
  ["@elrs-easy/i18n", new Set(["@elrs-easy/domain"])],
  [
    "@elrs-easy/web",
    new Set([
      "@elrs-easy/domain",
      "@elrs-easy/device",
      "@elrs-easy/workflows",
      "@elrs-easy/platform-mock",
      "@elrs-easy/i18n",
    ]),
  ],
]);

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".mtsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const coreWorkspacePackages = new Set(
  [...allowedWorkspaceDependencies.keys()].filter(
    (packageName) => packageName !== "@elrs-easy/web",
  ),
);
const forbiddenCoreImportPrefixes = [
  "react",
  "react-dom",
  "@testing-library",
  "@vitejs/plugin-react",
  "jsdom",
];
const forbiddenCoreRuntimePatterns = [
  ["window", /\bwindow\s*(?:\.|\[)/u],
  ["document", /\bdocument\s*(?:\.|\[)/u],
  ["navigator", /\bnavigator\s*(?:\.|\[)/u],
  ["localStorage", /\blocalStorage\b/u],
  ["sessionStorage", /\bsessionStorage\b/u],
  ["IndexedDB", /\bindexedDB\b/u],
  ["Cache Storage", /\bcaches\s*(?:\.|\[)/u],
  ["DOMParser", /\bDOMParser\b/u],
  ["FileReader", /\bFileReader\b/u],
  ["HTML element", /\bHTML[A-Z][A-Za-z0-9]*Element\b/u],
  ["IntersectionObserver", /\bIntersectionObserver\b/u],
  ["MutationObserver", /\bMutationObserver\b/u],
  ["ResizeObserver", /\bResizeObserver\b/u],
  ["Service Worker", /\bServiceWorker(?:Container|Registration)?\b/u],
  ["WebSocket", /\bWebSocket\b/u],
  ["WebUSB", /\bUSB(?:Device|InTransferResult|OutTransferResult)\b/u],
  ["Web Serial", /\bSerialPort\b/u],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/u],
];

async function listDirectories(parent) {
  const entries = await readdir(path.join(repositoryRoot, parent), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(repositoryRoot, parent, entry.name));
}

async function walkSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSource(absolutePath)));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function collectImportSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

function workspacePackageName(specifier) {
  if (!specifier.startsWith("@elrs-easy/")) {
    return null;
  }
  return specifier.split("/").slice(0, 2).join("/");
}

function matchesPackagePrefix(specifier, prefix) {
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const errors = [];

  function visit(node, trail) {
    if (visiting.has(node)) {
      const cycleStart = trail.indexOf(node);
      errors.push(
        `workspace dependency cycle: ${[...trail.slice(cycleStart), node].join(
          " -> ",
        )}`,
      );
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) {
      visit(dependency, [...trail, node]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    visit(node, []);
  }
  return errors;
}

const workspaceDirectories = [
  ...(await listDirectories("packages")),
  ...(await listDirectories("apps")),
];
const workspaces = new Map();
const errors = [];

for (const directory of workspaceDirectories) {
  const manifestPath = path.join(directory, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    errors.push(
      `${path.relative(repositoryRoot, manifestPath)}: cannot read a valid package manifest (${error.message})`,
    );
    continue;
  }

  if (typeof manifest.name !== "string") {
    errors.push(
      `${path.relative(repositoryRoot, manifestPath)}: package name is missing`,
    );
    continue;
  }
  if (workspaces.has(manifest.name)) {
    errors.push(
      `${path.relative(repositoryRoot, manifestPath)}: duplicate workspace package ${manifest.name}`,
    );
    continue;
  }
  workspaces.set(manifest.name, { directory, manifest, manifestPath });
}

for (const packageName of workspaces.keys()) {
  if (!allowedWorkspaceDependencies.has(packageName)) {
    errors.push(
      `${packageName}: missing from the reviewed dependency-boundary policy`,
    );
  }
}
for (const packageName of allowedWorkspaceDependencies.keys()) {
  if (!workspaces.has(packageName)) {
    errors.push(
      `${packageName}: policy entry has no matching workspace package`,
    );
  }
}

const actualGraph = new Map();

for (const [packageName, workspace] of workspaces) {
  const allowed = allowedWorkspaceDependencies.get(packageName) ?? new Set();
  const declared = new Set();

  for (const section of dependencySections) {
    const dependencies = workspace.manifest[section] ?? {};
    for (const [dependency, version] of Object.entries(dependencies)) {
      if (!workspaces.has(dependency)) {
        continue;
      }
      declared.add(dependency);
      if (!allowed.has(dependency)) {
        errors.push(
          `${path.relative(repositoryRoot, workspace.manifestPath)}: ${packageName} may not depend on ${dependency}`,
        );
      }
      if (typeof version !== "string" || !version.startsWith("workspace:")) {
        errors.push(
          `${path.relative(repositoryRoot, workspace.manifestPath)}: ${dependency} must use the workspace: protocol`,
        );
      }
    }
  }
  actualGraph.set(packageName, declared);

  const sourceDirectory = path.join(workspace.directory, "src");
  let sourceFiles = [];
  try {
    sourceFiles = await walkSource(sourceDirectory);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  for (const sourceFile of sourceFiles) {
    const relativeFile = path.relative(repositoryRoot, sourceFile);
    const source = await readFile(sourceFile, "utf8");
    for (const specifier of collectImportSpecifiers(source)) {
      if (
        coreWorkspacePackages.has(packageName) &&
        forbiddenCoreImportPrefixes.some((prefix) =>
          matchesPackagePrefix(specifier, prefix),
        )
      ) {
        errors.push(
          `${relativeFile}: Core package ${packageName} may not import browser/UI dependency ${specifier}`,
        );
      }
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(sourceFile), specifier);
        if (!isInside(workspace.directory, resolved)) {
          errors.push(
            `${relativeFile}: relative import escapes the ${packageName} boundary (${specifier})`,
          );
        }
        continue;
      }

      const dependency = workspacePackageName(specifier);
      if (dependency === null) {
        continue;
      }
      if (!workspaces.has(dependency)) {
        errors.push(`${relativeFile}: unknown workspace import ${specifier}`);
        continue;
      }
      if (specifier !== dependency) {
        errors.push(
          `${relativeFile}: import workspace packages through their public export, not ${specifier}`,
        );
      }
      if (!allowed.has(dependency)) {
        errors.push(
          `${relativeFile}: ${packageName} may not import ${dependency}`,
        );
      }
      if (!declared.has(dependency)) {
        errors.push(
          `${relativeFile}: ${dependency} is imported but not declared in ${packageName}`,
        );
      }
    }

    if (coreWorkspacePackages.has(packageName)) {
      for (const [apiName, pattern] of forbiddenCoreRuntimePatterns) {
        const match = pattern.exec(source);
        if (match !== null) {
          errors.push(
            `${relativeFile}:${lineNumberAt(source, match.index)}: Core package ${packageName} may not use browser/DOM API ${apiName}`,
          );
        }
      }
    }
  }
}

errors.push(...detectCycles(actualGraph));

if (errors.length > 0) {
  console.error("Dependency-boundary check failed:");
  for (const error of [...new Set(errors)].sort()) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Dependency boundaries verified for ${workspaces.size} workspace packages.`,
  );
}
