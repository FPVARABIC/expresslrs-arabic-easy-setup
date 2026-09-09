import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const inventoryPath = path.resolve(
  repositoryRoot,
  process.argv[2] ?? "dependency-licenses.json",
);
const policyPath = path.resolve(
  repositoryRoot,
  process.argv[3] ?? "config/dependency-license-policy.json",
);

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `${label} is missing or invalid JSON at ${path.relative(repositoryRoot, filePath)} (${error.message})`,
      { cause: error },
    );
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function packageVersions(entry) {
  if (
    Array.isArray(entry.versions) &&
    entry.versions.length > 0 &&
    entry.versions.every(nonEmptyString)
  ) {
    return entry.versions;
  }
  if (nonEmptyString(entry.version)) {
    return [entry.version];
  }
  return null;
}

const errors = [];
let inventory;
let policy;

try {
  [inventory, policy] = await Promise.all([
    readJson(inventoryPath, "Dependency license inventory"),
    readJson(policyPath, "Dependency license policy"),
  ]);
} catch (error) {
  console.error(`License policy check failed: ${error.message}`);
  process.exit(1);
}

if (
  policy === null ||
  typeof policy !== "object" ||
  Array.isArray(policy) ||
  policy.schemaVersion !== "1"
) {
  errors.push('policy: schemaVersion must be exactly "1"');
}

const allowedExpressions = new Set();
if (!Array.isArray(policy.allowedLicenseExpressions)) {
  errors.push("policy: allowedLicenseExpressions must be an array");
} else {
  for (const expression of policy.allowedLicenseExpressions) {
    if (!nonEmptyString(expression)) {
      errors.push("policy: every allowed license expression must be non-empty");
      continue;
    }
    if (allowedExpressions.has(expression)) {
      errors.push(`policy: duplicate allowed expression ${expression}`);
    }
    allowedExpressions.add(expression);
  }
}

const exceptions = new Map();
if (!Array.isArray(policy.reviewedExceptions)) {
  errors.push("policy: reviewedExceptions must be an array");
} else {
  for (const exception of policy.reviewedExceptions) {
    if (exception === null || typeof exception !== "object") {
      errors.push("policy: every reviewed exception must be an object");
      continue;
    }
    const requiredFields = [
      "packageName",
      "version",
      "observedLicenseExpression",
      "approvedLicenseExpression",
      "reviewReference",
    ];
    if (requiredFields.some((field) => !nonEmptyString(exception[field]))) {
      errors.push(
        "policy: reviewed exceptions require packageName, version, observedLicenseExpression, approvedLicenseExpression, and reviewReference",
      );
      continue;
    }
    if (
      exception.packageName.includes("*") ||
      exception.version.includes("*")
    ) {
      errors.push(
        `policy: wildcard exception is prohibited for ${exception.packageName}@${exception.version}`,
      );
      continue;
    }
    if (!allowedExpressions.has(exception.approvedLicenseExpression)) {
      errors.push(
        `policy: ${exception.packageName}@${exception.version} approves ${exception.approvedLicenseExpression}, which is not allowlisted`,
      );
    }
    const key = `${exception.packageName}@${exception.version}`;
    if (exceptions.has(key)) {
      errors.push(`policy: duplicate reviewed exception ${key}`);
      continue;
    }
    exceptions.set(key, exception);
  }
}

if (
  inventory === null ||
  typeof inventory !== "object" ||
  Array.isArray(inventory)
) {
  errors.push("inventory: expected pnpm's license-expression object");
}

let checkedPackageVersions = 0;
let usedExceptions = 0;
const inventoryEntries =
  inventory !== null &&
  typeof inventory === "object" &&
  !Array.isArray(inventory)
    ? Object.entries(inventory)
    : [];

for (const [licenseExpression, entries] of inventoryEntries) {
  if (!nonEmptyString(licenseExpression) || !Array.isArray(entries)) {
    errors.push(
      `inventory: ${licenseExpression || "<empty>"} must map to a package array`,
    );
    continue;
  }

  for (const entry of entries) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !nonEmptyString(entry.name)
    ) {
      errors.push(
        `inventory: ${licenseExpression} contains an invalid package entry`,
      );
      continue;
    }
    const versions = packageVersions(entry);
    if (versions === null) {
      errors.push(
        `inventory: ${entry.name} under ${licenseExpression} has no exact version list`,
      );
      continue;
    }
    if (entry.license !== undefined && entry.license !== licenseExpression) {
      errors.push(
        `inventory: ${entry.name} reports conflicting license values ${licenseExpression} and ${entry.license}`,
      );
      continue;
    }

    for (const version of versions) {
      checkedPackageVersions += 1;
      if (allowedExpressions.has(licenseExpression)) {
        continue;
      }
      const key = `${entry.name}@${version}`;
      const exception = exceptions.get(key);
      if (
        exception?.observedLicenseExpression === licenseExpression &&
        allowedExpressions.has(exception.approvedLicenseExpression)
      ) {
        usedExceptions += 1;
        continue;
      }
      errors.push(
        `${key}: unapproved license expression ${licenseExpression}; add evidence-backed exact review or reject the dependency`,
      );
    }
  }
}

if (checkedPackageVersions === 0) {
  errors.push("inventory: no dependency package/version records were found");
}

if (errors.length > 0) {
  console.error("Dependency license policy check failed:");
  for (const error of [...new Set(errors)].sort()) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Dependency license policy verified ${checkedPackageVersions} package/version records across ${inventoryEntries.length} observed expressions (${usedExceptions} exact reviewed exceptions).`,
  );
}
