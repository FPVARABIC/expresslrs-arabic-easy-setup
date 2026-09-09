import {
  parseCrsfLinkStatistics,
  type CrsfFrame,
  type CrsfLinkStatistics,
} from "./crsf";

/**
 * How strongly a bind result is supported. These are deliberately distinct:
 * a command acknowledgement, an operator's observation, and telemetry showing
 * an actual RF link are three different claims, and only the last is machine
 * evidence.
 */
export type BindingEvidenceLevel =
  /** The device accepted the bind command. Nothing about a link is known. */
  | "COMMAND_ACKNOWLEDGED_ONLY"
  /** A person reported seeing the link. Not machine-verifiable. */
  | "USER_CONFIRMED_LINK"
  /** Link statistics from the device reported a live link. */
  | "LINK_OBSERVED_BY_TELEMETRY";

export interface BindingEvidence {
  readonly level: BindingEvidenceLevel;
  /** Present only for LINK_OBSERVED_BY_TELEMETRY. */
  readonly statistics: CrsfLinkStatistics | null;
  /** How many qualifying link-statistics frames were seen. */
  readonly qualifyingFrames: number;
}

/**
 * A single frame with non-zero link quality can be a transient artefact while a
 * transmitter is still searching, so a link is only accepted after this many
 * qualifying frames.
 */
export const REQUIRED_LINK_FRAMES = 3 as const;

/**
 * Collects link-statistics frames and decides whether they demonstrate a live
 * RF link. Uplink link quality is the discriminator: a transmitter with no
 * connected receiver reports zero.
 */
export class BindingLinkObserver {
  #qualifying = 0;
  #latest: CrsfLinkStatistics | null = null;

  /** Feeds one frame. Returns true once the link threshold has been reached. */
  public observe(frame: CrsfFrame): boolean {
    const statistics = parseCrsfLinkStatistics(frame);
    if (statistics === null) return this.linked;
    if (statistics.uplinkLinkQuality <= 0) {
      // A dropped link resets the evidence rather than leaving a stale pass.
      this.#qualifying = 0;
      this.#latest = null;
      return false;
    }
    this.#qualifying += 1;
    this.#latest = statistics;
    return this.linked;
  }

  public get linked(): boolean {
    return this.#qualifying >= REQUIRED_LINK_FRAMES;
  }

  public get statistics(): CrsfLinkStatistics | null {
    return this.linked ? this.#latest : null;
  }

  public get qualifyingFrames(): number {
    return this.#qualifying;
  }

  public reset(): void {
    this.#qualifying = 0;
    this.#latest = null;
  }
}

/**
 * Grades a bind attempt. Telemetry outranks an operator's report, and an
 * operator's report is never promoted to machine evidence.
 */
export function gradeBindingEvidence(input: {
  readonly observer: BindingLinkObserver;
  readonly userReportedLink: boolean | null;
}): BindingEvidence {
  if (input.observer.linked) {
    return Object.freeze({
      level: "LINK_OBSERVED_BY_TELEMETRY" as const,
      statistics: input.observer.statistics,
      qualifyingFrames: input.observer.qualifyingFrames,
    });
  }
  return Object.freeze({
    level:
      input.userReportedLink === true
        ? ("USER_CONFIRMED_LINK" as const)
        : ("COMMAND_ACKNOWLEDGED_ONLY" as const),
    statistics: null,
    qualifyingFrames: input.observer.qualifyingFrames,
  });
}

/**
 * Only telemetry counts as verification. An operator's confirmation is recorded
 * as their claim, not as proof, so it must never be reported as a verified
 * success.
 */
export function isMachineVerifiedBinding(evidence: BindingEvidence): boolean {
  return evidence.level === "LINK_OBSERVED_BY_TELEMETRY";
}
