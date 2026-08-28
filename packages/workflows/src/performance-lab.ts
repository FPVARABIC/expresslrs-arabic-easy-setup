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

export const maximumPerformanceMetrics = 64;
export const maximumPerformancePairedRuns = 10_000;

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
    | "INVALID_EVIDENCE_LEVEL"
    | "INVALID_MINIMUM_RUNS"
    | "NO_METRICS"
    | "TOO_MANY_METRICS"
    | "DUPLICATE_METRIC"
    | "INVALID_METRIC"
    | "TOO_MANY_PAIRED_RUNS"
    | "INSUFFICIENT_PAIRED_RUNS"
    | "UNDEFINED_PERCENT_CHANGE"
    | "NUMERIC_OVERFLOW";
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
  const ratio = candidate / baseline;
  const raw = (ratio - 1) * 100;
  if (!Number.isFinite(raw)) {
    return null;
  }
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

function validMetric(metric: unknown): metric is PerformanceMetricSeries {
  if (typeof metric !== "object" || metric === null) {
    return false;
  }
  const candidate = metric as Partial<PerformanceMetricSeries>;
  return (
    typeof candidate.id === "string" &&
    /^[A-Z0-9][A-Z0-9._-]{0,63}$/u.test(candidate.id) &&
    performanceMetricDirections.includes(
      candidate.direction as PerformanceMetricDirection,
    ) &&
    Number.isFinite(candidate.requiredImprovementPercent) &&
    (candidate.requiredImprovementPercent ?? -1) >= 0 &&
    Number.isFinite(candidate.allowedRegressionPercent) &&
    (candidate.allowedRegressionPercent ?? -1) >= 0 &&
    Array.isArray(candidate.baseline) &&
    Array.isArray(candidate.candidate) &&
    candidate.baseline.length === candidate.candidate.length &&
    candidate.baseline.every(finiteNonNegative) &&
    candidate.candidate.every(finiteNonNegative)
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
  if (!performanceEvidenceLevels.includes(input.evidenceLevel)) {
    return invalidAnalysis(input, "INVALID_EVIDENCE_LEVEL");
  }
  if (
    !Number.isInteger(input.minimumPairedRuns) ||
    input.minimumPairedRuns < 2 ||
    input.minimumPairedRuns > maximumPerformancePairedRuns
  ) {
    return invalidAnalysis(input, "INVALID_MINIMUM_RUNS");
  }
  if (!Array.isArray(input.metrics) || input.metrics.length === 0) {
    return invalidAnalysis(input, "NO_METRICS");
  }
  if (input.metrics.length > maximumPerformanceMetrics) {
    return invalidAnalysis(input, "TOO_MANY_METRICS");
  }

  const ids = new Set<string>();
  const improvementsByMetric = new Map<string, readonly number[]>();
  for (const metric of input.metrics) {
    if (!validMetric(metric)) {
      return invalidAnalysis(input, "INVALID_METRIC");
    }
    if (ids.has(metric.id)) {
      return invalidAnalysis(input, "DUPLICATE_METRIC");
    }
    ids.add(metric.id);
    if (metric.baseline.length > maximumPerformancePairedRuns) {
      return invalidAnalysis(input, "TOO_MANY_PAIRED_RUNS");
    }
    if (metric.baseline.length < input.minimumPairedRuns) {
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
          baseline === 0
            ? "UNDEFINED_PERCENT_CHANGE"
            : "NUMERIC_OVERFLOW",
        );
      }
      improvements.push(improvement);
    }
    improvementsByMetric.set(metric.id, Object.freeze(improvements));
  }

  const summaries = Object.freeze(
    input.metrics.map((metric) => {
      const improvements = improvementsByMetric.get(metric.id);
      if (improvements === undefined) {
        throw new Error("Validated performance metric has no improvements");
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
