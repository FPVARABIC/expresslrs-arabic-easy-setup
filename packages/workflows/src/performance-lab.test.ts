import { describe, expect, it } from "vitest";

import { analyzePerformanceExperiment } from "./performance-lab.js";

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

  it("requires external review even for caller-declared Hardware improvements", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-001",
      evidenceLevel: "HARDWARE_OBSERVED",
      minimumPairedRuns: 3,
      metrics: [improvingMetric],
    });

    expect(analysis.decision).toBe("REVIEW_HARDWARE_EVIDENCE");
    expect(analysis.hardwareEvidenceDisposition).toBe(
      "UNVERIFIED_CALLER_DECLARATION",
    );
    expect(analysis.performanceClaimAllowed).toBe(false);
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
    expect(analysis.decision).toBe("MODIFY_OR_RETEST");
  });

  it("rejects changed zero baselines because percentage change is undefined", () => {
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

  it("rejects an unreviewed evidence label instead of treating it as Synthetic", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-010",
      evidenceLevel: "FLIGHT_PROVEN",
      minimumPairedRuns: 2,
      metrics: [improvingMetric],
    });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.invalidReason).toBe("INVALID_EVIDENCE_LEVEL");
    expect(analysis.evidenceLevel).toBe("UNKNOWN");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("does not execute accessor-backed metric values", () => {
    let executed = false;
    const metric = Object.defineProperty({}, "id", {
      get() {
        executed = true;
        return "RECOVERY_MS";
      },
    });
    for (const [key, value] of Object.entries({
      direction: "LOWER_IS_BETTER",
      baseline: [100, 90],
      candidate: [80, 70],
      requiredImprovementPercent: 5,
      allowedRegressionPercent: 2,
    })) {
      Object.defineProperty(metric, key, { value });
    }

    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-011",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [metric],
    });

    expect(executed).toBe(false);
    expect(analysis.invalidReason).toBe("INVALID_METRIC");
    expect(analysis.performanceClaimAllowed).toBe(false);
  });

  it("bounds the number of metric declarations", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-012",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: Array.from({ length: 33 }, (_, index) => ({
        ...improvingMetric,
        id: `METRIC_${index}`,
      })),
    });

    expect(analysis.invalidReason).toBe("TOO_MANY_METRICS");
    expect(analysis.summaries).toEqual([]);
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

  it("computes even medians without overflowing their sum", () => {
    const analysis = analyzePerformanceExperiment({
      hypothesisId: "HYP-014",
      evidenceLevel: "SYNTHETIC",
      minimumPairedRuns: 2,
      metrics: [
        {
          id: "LARGE_LATENCY_UNIT",
          direction: "LOWER_IS_BETTER",
          baseline: [Number.MAX_VALUE, Number.MAX_VALUE],
          candidate: [Number.MAX_VALUE, Number.MAX_VALUE],
          requiredImprovementPercent: 1,
          allowedRegressionPercent: 1,
        },
      ],
    });

    expect(analysis.status).toBe("VALID");
    expect(Number.isFinite(analysis.summaries[0]?.medianBaseline)).toBe(true);
    expect(analysis.summaries[0]?.medianBaseline).toBe(Number.MAX_VALUE);
    expect(analysis.summaries[0]?.medianCandidate).toBe(Number.MAX_VALUE);
    expect(analysis.summaries[0]?.medianImprovementPercent).toBe(0);
  });
});
