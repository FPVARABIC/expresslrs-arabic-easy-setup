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
  | "KEEP"
  | "MODIFY_OR_RETEST"
  | "REJECT"
  | "INVALID_INPUT";

export interface PerformanceExperimentAnalysis {
  readonly schemaVersion: 1;
  readonly type: "PERFORMANCE_EXPERIMENT_ANALYSIS";
  readonly hypothesisId: string | null;
  readonly evidenceLevel: PerformanceEvidenceLevel | "UNKNOWN";
  readonly status: "VALID" | "INVALID";
  readonly decision: PerformanceExperimentDecision;
  readonly summaries: readonly PerformanceMetricSummary[];
  readonly invalidReason:
    | null
    | "INVALID_HYPOTHESIS_ID"
    | "INVALID_MINIMUM_RUNS"
    | "NO_METRICS"
    | "DUPLICATE_METRIC"
    | "INVALID_METRIC"
    | "INSUFFICIENT_PAIRED_RUNS";
  readonly performanceClaimAllowed: boolean;
}

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
  return previous === undefined ? Number.NaN : (previous + value) / 2;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizedImprovement(
  baseline: number,
  candidate: number,
  direction: PerformanceMetricDirection,
): number {
  if (baseline === 0) {
    if (candidate === 0) {
      return 0;
    }
    return direction === "LOWER_IS_BETTER" ? -100 : 100;
  }
  const raw = ((candidate - baseline) / baseline) * 100;
  return direction === "HIGHER_IS_BETTER" ? raw : -raw;
}

function invalidAnalysis(
  input: PerformanceExperimentInput,
  reason: Exclude<PerformanceExperimentAnalysis["invalidReason"], null>,
): PerformanceExperimentAnalysis {
  return Object.freeze({
    schemaVersion: 1,
    type: "PERFORMANCE_EXPERIMENT_ANALYSIS",
    hypothesisId:
      typeof input.hypothesisId === "string" ? input.hypothesisId : null,
    evidenceLevel: performanceEvidenceLevels.includes(input.evidenceLevel)
      ? input.evidenceLevel
      : "UNKNOWN",
    status: "INVALID",
    decision: "INVALID_INPUT",
    summaries: Object.freeze([]),
    invalidReason: reason,
    performanceClaimAllowed: false,
  });
}

function validMetric(metric: PerformanceMetricSeries): boolean {
  return (
    typeof metric.id === "string" &&
    /^[A-Z0-9][A-Z0-9._-]{0,63}$/u.test(metric.id) &&
    performanceMetricDirections.includes(metric.direction) &&
    Number.isFinite(metric.requiredImprovementPercent) &&
    metric.requiredImprovementPercent >= 0 &&
    Number.isFinite(metric.allowedRegressionPercent) &&
    metric.allowedRegressionPercent >= 0 &&
    metric.baseline.length === metric.candidate.length &&
    metric.baseline.every(finiteNonNegative) &&
    metric.candidate.every(finiteNonNegative)
  );
}

/**
 * Analyzes already-collected paired measurements. Synthetic runs exercise the
 * analysis pipeline but can never authorize a performance claim or candidate
 * admission. Hardware-observed evidence is still only one gate in the wider
 * controlled test policy.
 */
export function analyzePerformanceExperiment(
  input: PerformanceExperimentInput,
): PerformanceExperimentAnalysis {
  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/u.test(input.hypothesisId)) {
    return invalidAnalysis(input, "INVALID_HYPOTHESIS_ID");
  }
  if (
    !Number.isInteger(input.minimumPairedRuns) ||
    input.minimumPairedRuns < 2 ||
    input.minimumPairedRuns > 10_000
  ) {
    return invalidAnalysis(input, "INVALID_MINIMUM_RUNS");
  }
  if (input.metrics.length === 0) {
    return invalidAnalysis(input, "NO_METRICS");
  }

  const ids = new Set<string>();
  for (const metric of input.metrics) {
    if (!validMetric(metric)) {
      return invalidAnalysis(input, "INVALID_METRIC");
    }
    if (ids.has(metric.id)) {
      return invalidAnalysis(input, "DUPLICATE_METRIC");
    }
    ids.add(metric.id);
    if (metric.baseline.length < input.minimumPairedRuns) {
      return invalidAnalysis(input, "INSUFFICIENT_PAIRED_RUNS");
    }
  }

  const summaries = Object.freeze(
    input.metrics.map((metric) => {
      const improvements = metric.baseline.map((baseline, index) => {
        const candidate = metric.candidate[index];
        return candidate === undefined
          ? Number.NaN
          : normalizedImprovement(baseline, candidate, metric.direction);
      });
      const medianImprovementPercent = median(improvements);
      const threshold: PerformanceMetricSummary["threshold"] =
        medianImprovementPercent < -metric.allowedRegressionPercent
          ? "REGRESSED"
          : medianImprovementPercent >= metric.requiredImprovementPercent
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
  if (input.evidenceLevel !== "HARDWARE_OBSERVED") {
    decision = "SOFTWARE_ONLY_NO_ADMISSION";
  } else if (summaries.some((summary) => summary.threshold === "REGRESSED")) {
    decision = "REJECT";
  } else if (summaries.every((summary) => summary.threshold === "IMPROVED")) {
    decision = "KEEP";
  } else {
    decision = "MODIFY_OR_RETEST";
  }

  return Object.freeze({
    schemaVersion: 1,
    type: "PERFORMANCE_EXPERIMENT_ANALYSIS",
    hypothesisId: input.hypothesisId,
    evidenceLevel: input.evidenceLevel,
    status: "VALID",
    decision,
    summaries,
    invalidReason: null,
    performanceClaimAllowed:
      input.evidenceLevel === "HARDWARE_OBSERVED" && decision === "KEEP",
  });
}
