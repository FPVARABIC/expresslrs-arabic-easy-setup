import { readOwnDataProperty } from "./sensitive-operation-helpers.js";

export const performanceEvidenceLevels = [
  "SYNTHETIC",
  "HARDWARE_OBSERVED",
] as const;

export type PerformanceEvidenceLevel =
  (typeof performanceEvidenceLevels)[number];

export const performanceMetricDirections = [
  "HIGHER_IS_BETTER",
  "LOWER_IS_BETTER",
] as const;

export type PerformanceMetricDirection =
  (typeof performanceMetricDirections)[number];

export interface PerformanceMetricSeries {
  readonly id: string;
  readonly direction: PerformanceMetricDirection;
  readonly baseline: readonly number[];
  readonly candidate: readonly number[];
  readonly requiredImprovementPercent: number;
  readonly allowedRegressionPercent: number;
}

export interface PerformanceExperimentInput {
  readonly hypothesisId: string;
  readonly evidenceLevel: PerformanceEvidenceLevel;
  readonly minimumPairedRuns: number;
  readonly metrics: readonly PerformanceMetricSeries[];
}

export interface PerformanceMetricSummary {
  readonly id: string;
  readonly direction: PerformanceMetricDirection;
  readonly pairedRuns: number;
  readonly medianBaseline: number;
  readonly medianCandidate: number;
  readonly medianImprovementPercent: number;
  readonly threshold: "IMPROVED" | "NEUTRAL" | "REGRESSED";
}

export type PerformanceExperimentDecision =
  | "SOFTWARE_ONLY_NO_ADMISSION"
  | "REVIEW_HARDWARE_EVIDENCE"
  | "MODIFY_OR_RETEST"
  | "REJECT"
  | "INVALID_INPUT";

export interface PerformanceExperimentAnalysis {
  readonly schemaVersion: 1;
  readonly type: "PERFORMANCE_EXPERIMENT_ANALYSIS";
  readonly hypothesisId: string | null;
  readonly evidenceLevel: PerformanceEvidenceLevel | "UNKNOWN";
  readonly hardwareEvidenceDisposition:
    "NOT_PROVIDED" | "UNVERIFIED_CALLER_DECLARATION";
  readonly status: "VALID" | "INVALID";
  readonly decision: PerformanceExperimentDecision;
  readonly summaries: readonly PerformanceMetricSummary[];
  readonly invalidReason:
    | null
    | "INVALID_HYPOTHESIS_ID"
    | "INVALID_EVIDENCE_LEVEL"
    | "INVALID_MINIMUM_RUNS"
    | "NO_METRICS"
    | "TOO_MANY_METRICS"
    | "DUPLICATE_METRIC"
    | "INVALID_METRIC"
    | "INSUFFICIENT_PAIRED_RUNS"
    | "UNDEFINED_PERCENT_CHANGE"
    | "NUMERIC_OVERFLOW";
  readonly performanceClaimAllowed: false;
}

const maximumMetrics = 32;
const maximumPairedRuns = 10_000;
const safeMachineId = /^[A-Z0-9][A-Z0-9._-]{0,63}$/u;

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const value = ordered[middle];
  if (value === undefined) {
    return Number.NaN;
  }
  if (ordered.length % 2 === 1) {
    return value;
  }
  const previous = ordered[middle - 1];
  return previous === undefined ? Number.NaN : previous / 2 + value / 2;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizedImprovement(
  baseline: number,
  candidate: number,
  direction: PerformanceMetricDirection,
): number | null {
  if (baseline === 0) {
    return candidate === 0 ? 0 : null;
  }
  const raw = (candidate / baseline - 1) * 100;
  if (!Number.isFinite(raw)) {
    return null;
  }
  if (raw === 0) {
    return 0;
  }
  return direction === "HIGHER_IS_BETTER" ? raw : -raw;
}

function evidenceLevel(value: unknown): PerformanceEvidenceLevel | "UNKNOWN" {
  return typeof value === "string" &&
    performanceEvidenceLevels.includes(value as PerformanceEvidenceLevel)
    ? (value as PerformanceEvidenceLevel)
    : "UNKNOWN";
}

function hardwareDisposition(
  level: PerformanceEvidenceLevel | "UNKNOWN",
): PerformanceExperimentAnalysis["hardwareEvidenceDisposition"] {
  return level === "HARDWARE_OBSERVED"
    ? "UNVERIFIED_CALLER_DECLARATION"
    : "NOT_PROVIDED";
}

function invalidAnalysis(
  input: unknown,
  reason: Exclude<PerformanceExperimentAnalysis["invalidReason"], null>,
): PerformanceExperimentAnalysis {
  const rawHypothesisId = readOwnDataProperty(input, "hypothesisId");
  const level = evidenceLevel(readOwnDataProperty(input, "evidenceLevel"));
  return Object.freeze({
    schemaVersion: 1,
    type: "PERFORMANCE_EXPERIMENT_ANALYSIS",
    hypothesisId:
      typeof rawHypothesisId === "string" && safeMachineId.test(rawHypothesisId)
        ? rawHypothesisId
        : null,
    evidenceLevel: level,
    hardwareEvidenceDisposition: hardwareDisposition(level),
    status: "INVALID",
    decision: "INVALID_INPUT",
    summaries: Object.freeze([]),
    invalidReason: reason,
    performanceClaimAllowed: false,
  });
}

function copyBoundedArray(
  value: unknown,
  maximum: number,
): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const length = readOwnDataProperty(value, "length");
  if (
    !Number.isInteger(length) ||
    (length as number) < 0 ||
    (length as number) > maximum
  ) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    snapshot.push(readOwnDataProperty(value, index));
  }
  return Object.freeze(snapshot);
}

function copyNumberSeries(value: unknown): readonly number[] | null {
  const snapshot = copyBoundedArray(value, maximumPairedRuns);
  if (
    snapshot === null ||
    snapshot.some(
      (item) => typeof item !== "number" || !finiteNonNegative(item),
    )
  ) {
    return null;
  }
  return Object.freeze([...snapshot] as number[]);
}

function rebuildMetric(value: unknown): PerformanceMetricSeries | null {
  const id = readOwnDataProperty(value, "id");
  const direction = readOwnDataProperty(value, "direction");
  const requiredImprovementPercent = readOwnDataProperty(
    value,
    "requiredImprovementPercent",
  );
  const allowedRegressionPercent = readOwnDataProperty(
    value,
    "allowedRegressionPercent",
  );
  const baseline = copyNumberSeries(readOwnDataProperty(value, "baseline"));
  const candidate = copyNumberSeries(readOwnDataProperty(value, "candidate"));
  if (
    typeof id !== "string" ||
    !safeMachineId.test(id) ||
    typeof direction !== "string" ||
    !performanceMetricDirections.includes(
      direction as PerformanceMetricDirection,
    ) ||
    typeof requiredImprovementPercent !== "number" ||
    !finiteNonNegative(requiredImprovementPercent) ||
    typeof allowedRegressionPercent !== "number" ||
    !finiteNonNegative(allowedRegressionPercent) ||
    baseline === null ||
    candidate === null ||
    baseline.length !== candidate.length
  ) {
    return null;
  }
  return Object.freeze({
    id,
    direction: direction as PerformanceMetricDirection,
    baseline,
    candidate,
    requiredImprovementPercent,
    allowedRegressionPercent,
  });
}

/**
 * Analyzes already-collected paired measurements. Synthetic runs exercise the
 * analysis pipeline but can never authorize a performance claim or candidate
 * admission. The plain HARDWARE_OBSERVED label is only a caller declaration;
 * an independently branded measurement record and the wider controlled test
 * policy remain separate future gates.
 */
export function analyzePerformanceExperiment(
  input: PerformanceExperimentInput | unknown,
): PerformanceExperimentAnalysis {
  const hypothesisId = readOwnDataProperty(input, "hypothesisId");
  const level = evidenceLevel(readOwnDataProperty(input, "evidenceLevel"));
  const minimumPairedRuns = readOwnDataProperty(input, "minimumPairedRuns");
  const rawMetrics = readOwnDataProperty(input, "metrics");
  if (typeof hypothesisId !== "string" || !safeMachineId.test(hypothesisId)) {
    return invalidAnalysis(input, "INVALID_HYPOTHESIS_ID");
  }
  if (level === "UNKNOWN") {
    return invalidAnalysis(input, "INVALID_EVIDENCE_LEVEL");
  }
  if (
    !Number.isInteger(minimumPairedRuns) ||
    (minimumPairedRuns as number) < 2 ||
    (minimumPairedRuns as number) > maximumPairedRuns
  ) {
    return invalidAnalysis(input, "INVALID_MINIMUM_RUNS");
  }
  const metricValues = copyBoundedArray(rawMetrics, maximumMetrics);
  if (metricValues === null) {
    const rawLength = readOwnDataProperty(rawMetrics, "length");
    return invalidAnalysis(
      input,
      typeof rawLength === "number" && rawLength > maximumMetrics
        ? "TOO_MANY_METRICS"
        : "INVALID_METRIC",
    );
  }
  if (metricValues.length === 0) {
    return invalidAnalysis(input, "NO_METRICS");
  }

  const ids = new Set<string>();
  const rebuiltMetrics: PerformanceMetricSeries[] = [];
  const improvementsByMetric = new Map<string, readonly number[]>();
  for (const value of metricValues) {
    const metric = rebuildMetric(value);
    if (metric === null) {
      return invalidAnalysis(input, "INVALID_METRIC");
    }
    if (ids.has(metric.id)) {
      return invalidAnalysis(input, "DUPLICATE_METRIC");
    }
    ids.add(metric.id);
    if (metric.baseline.length < (minimumPairedRuns as number)) {
      return invalidAnalysis(input, "INSUFFICIENT_PAIRED_RUNS");
    }

    const improvements: number[] = [];
    for (let index = 0; index < metric.baseline.length; index += 1) {
      const baseline = metric.baseline[index];
      const candidate = metric.candidate[index];
      if (baseline === undefined || candidate === undefined) {
        return invalidAnalysis(input, "INVALID_METRIC");
      }
      const improvement = normalizedImprovement(
        baseline,
        candidate,
        metric.direction,
      );
      if (improvement === null) {
        return invalidAnalysis(
          input,
          baseline === 0 ? "UNDEFINED_PERCENT_CHANGE" : "NUMERIC_OVERFLOW",
        );
      }
      improvements.push(improvement);
    }
    rebuiltMetrics.push(metric);
    improvementsByMetric.set(metric.id, Object.freeze(improvements));
  }
  const metrics = Object.freeze(rebuiltMetrics);

  const summaries = Object.freeze(
    metrics.map((metric) => {
      const improvements = improvementsByMetric.get(metric.id);
      if (improvements === undefined) {
        throw new Error(
          "Validated performance metric has no improvement series",
        );
      }
      const medianImprovementPercent = median(improvements);
      const threshold: PerformanceMetricSummary["threshold"] =
        medianImprovementPercent < -metric.allowedRegressionPercent
          ? "REGRESSED"
          : medianImprovementPercent > 0 &&
              medianImprovementPercent >= metric.requiredImprovementPercent
            ? "IMPROVED"
            : "NEUTRAL";
      return Object.freeze({
        id: metric.id,
        direction: metric.direction,
        pairedRuns: metric.baseline.length,
        medianBaseline: median(metric.baseline),
        medianCandidate: median(metric.candidate),
        medianImprovementPercent,
        threshold,
      });
    }),
  );

  let decision: PerformanceExperimentDecision;
  if (level !== "HARDWARE_OBSERVED") {
    decision = "SOFTWARE_ONLY_NO_ADMISSION";
  } else if (summaries.some((summary) => summary.threshold === "REGRESSED")) {
    decision = "REJECT";
  } else if (summaries.every((summary) => summary.threshold === "IMPROVED")) {
    decision = "REVIEW_HARDWARE_EVIDENCE";
  } else {
    decision = "MODIFY_OR_RETEST";
  }

  return Object.freeze({
    schemaVersion: 1,
    type: "PERFORMANCE_EXPERIMENT_ANALYSIS",
    hypothesisId,
    evidenceLevel: level,
    hardwareEvidenceDisposition: hardwareDisposition(level),
    status: "VALID",
    decision,
    summaries,
    invalidReason: null,
    performanceClaimAllowed: false,
  });
}
