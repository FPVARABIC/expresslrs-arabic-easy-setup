import { describe, expect, it } from "vitest";

import {
  analyzePerformanceExperiment,
  maximumPerformanceMetrics,
  maximumPerformancePairedRuns,
} from "./performance-lab.js";

const improvingMetric = {
  id: "RECOVERY_MS",
  direction: "LOWER_IS_BETTER" as const,
  baseline: [100, 110, 90, 105],
  candidate: [80, 88, 72, 84],
  requiredImprovementPercent: 10,
  allowedRegressionPercent: 3,
};

describe("analyzePerformanceExperiment", () => {
  it("never admits a Synthetic performance result", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-001",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 3,
      metrics: [improvingMetric],
    });

    expect(analysis.status).toBe("VALID");
    expect(analysis.decision).toBe("SOFTWARE_ONLY_NO_ADMISSION");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("can return KEEP only from Hardware-observed improved metrics", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-001",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 3,
      metrics: [improvingMetric],
    });

    expect(analysis.decision).toBe("KEEP");
    expect(analysis.performanceClaimAllowed).toBe(true);
    expect(analysis.summaries[0]?.threshold).toBe("IMPROVED");
  });

  it("rejects a Hardware candidate when any protected metric regresses", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-002",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 3,
      metrics: [
        improvingMetric,
        {
          id: "PACKET_DELIVERY_RATIO",
          direction: "HIGHER_IS_BETTER",
          baseline: [99, 99, 99, 99],
          candidate: [92, 93, 92, 93],
          requiredImprovementPercent: 0,
          allowedRegressionPercent: 1,
        },
      ],
    });

    expect(analysis.decision).toBe("REJECT");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("returns MODIFY_OR_RETEST when results are neutral", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-003",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 3,
      metrics: [
        {
          ...improvingMetric,
          candidate: [98, 108, 89, 103],
          requiredImprovementPercent: 10,
          allowedRegressionPercent: 3,
        },
      ],
    });

    expect(analysis.decision).toBe("MODIFY_OR_RETEST");
  });

  it("does not classify an unchanged zero-threshold metric as improved", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-003B",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 2,
      metrics: [
        {
          id: "PACKET_DELIVERY_RATIO",
          direction: "HIGHER_IS_BETTER",
          baseline: [99, 99],
          candidate: [99, 99],
          requiredImprovementPercent: 0,
          allowedRegressionPercent: 0,
        },
      ],
    });

    expect(analysis.summaries[0]?.threshold).toBe("NEUTRAL");
    expect(analysis.decision).toBe("MODIFY_OR_RETEST");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("fails closed on mismatched paired-run counts", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-004",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [
        {
          ...improvingMetric,
          baseline: [1, 2, 3],
          candidate: [1, 2],
        },
      ],
    });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.invalidReason).toBe("INVALID_METRIC");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("fails closed on non-finite values", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-005",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [
        {
          ...improvingMetric,
          baseline: [100, Number.NaN],
          candidate: [90, 80],
        },
      ],
    });

    expect(analysis.invalidReason).toBe("INVALID_METRIC");
  });

  it("requires the declared paired-run floor", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-006",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 5,
      metrics: [improvingMetric],
    });

    expect(analysis.invalidReason).toBe("INSUFFICIENT_PAIRED_RUNS");
  });

  it("handles an unchanged zero baseline without emitting Infinity", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-007",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 2,
      metrics: [
        {
          id: "DEADLINE_MISSES",
          direction: "LOWER_IS_BETTER",
          baseline: [0, 0],
          candidate: [0, 0],
          requiredImprovementPercent: 0,
          allowedRegressionPercent: 0,
        },
      ],
    });

    expect(analysis.summaries[0]?.medianImprovementPercent).toBe(0);
    expect(
      Number.isFinite(analysis.summaries[0]?.medianImprovementPercent),
    ).toBe(true);
    expect(analysis.summaries[0]?.threshold).toBe("NEUTRAL");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("rejects a changed zero baseline because percent change is undefined", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-007B",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 2,
      metrics: [
        {
          id: "DEADLINE_MISSES",
          direction: "LOWER_IS_BETTER",
          baseline: [0, 0],
          candidate: [1, 1],
          requiredImprovementPercent: 0,
          allowedRegressionPercent: 0,
        },
      ],
    });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.invalidReason).toBe("UNDEFINED_PERCENT_CHANGE");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("rejects duplicate metrics instead of silently merging them", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-008",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [improvingMetric, improvingMetric],
    });

    expect(analysis.invalidReason).toBe("DUPLICATE_METRIC");
  });

  it("rejects an unknown evidence level at runtime", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-010",
      evidenceLevel: "TRUST_ME" as "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [improvingMetric],
    });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.evidenceLevel).toBe("UNKNOWN");
    expect(analysis.invalidReason).toBe("INVALID_EVIDENCE_LEVEL");
  });

  it("bounds the number of metric series", () => {
    const metrics = Array.from(
      { length: maximumPerformanceMetrics + 1 },
      (_, index) => ({
        ...improvingMetric,
        id: `METRIC_${index}`,
      }),
    );
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-011",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics,
    });

    expect(analysis.invalidReason).toBe("TOO_MANY_METRICS");
  });

  it("bounds the actual paired-run arrays independently of the minimum", () => {
    const baseline = Array.from(
      { length: maximumPerformancePairedRuns + 1 },
      () => 100,
    );
    const candidate = baseline.map(() => 90);
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-012",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [{ ...improvingMetric, baseline, candidate }],
    });

    expect(analysis.invalidReason).toBe("TOO_MANY_PAIRED_RUNS");
  });

  it("rejects arithmetic overflow instead of emitting an infinite summary", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-013",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 2,
      metrics: [
        {
          id: "EXTREME_RATIO",
          direction: "HIGHER_IS_BETTER",
          baseline: [Number.MIN_VALUE, Number.MIN_VALUE],
          candidate: [Number.MAX_VALUE, Number.MAX_VALUE],
          requiredImprovementPercent: 1,
          allowedRegressionPercent: 1,
        },
      ],
    });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.invalidReason).toBe("NUMERIC_OVERFLOW");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("returns immutable summaries", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-009",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [improvingMetric],
    });

    expect(Object.isFrozen(analysis)).toBe(true);
    expect(Object.isFrozen(analysis.summaries)).toBe(true);
    expect(Object.isFrozen(analysis.summaries[0])).toBe(true);
  });
});
