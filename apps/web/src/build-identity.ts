/**
 * Which build the operator is actually looking at.
 *
 * This is a label, never a gate. Nothing in the application reads it to decide
 * whether an operation may run: device operations are authorized from live
 * device evidence, and a build that is not pinned is still a fully working
 * build. Saying which commit is on screen only makes an acceptance record
 * traceable to one immutable tree.
 */
const FULL_SHA = /^[0-9a-f]{40}$/u;

/** The commit this bundle was built from, or a plain unpinned marker. */
export function buildSha(): string {
  const value = import.meta.env.VITE_BUILD_SHA;
  return typeof value === "string" && FULL_SHA.test(value)
    ? value
    : "unpinned-development-build";
}

/** Whether the bundle carries an exact 40-character commit. */
export function isPinnedBuild(): boolean {
  return FULL_SHA.test(buildSha());
}

/** The short form shown in the interface. */
export function shortBuildSha(): string {
  const value = buildSha();
  return isPinnedBuild() ? value.slice(0, 7) : value;
}
