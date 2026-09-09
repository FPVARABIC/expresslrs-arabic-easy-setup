import { describe, expect, it } from "vitest";

import {
  BindingLinkObserver,
  REQUIRED_LINK_FRAMES,
  gradeBindingEvidence,
  isMachineVerifiedBinding,
} from "./binding-evidence";
import {
  CrsfAddress,
  CrsfFrameType,
  encodeCrsfFrame,
  parseCrsfLinkStatistics,
  type CrsfFrame,
} from "./crsf";

function linkFrame(
  uplinkLinkQuality: number,
  overrides: readonly number[] = [],
): CrsfFrame {
  const payload = new Uint8Array([
    40, // uplink RSSI antenna 1 (-dBm)
    45, // uplink RSSI antenna 2
    uplinkLinkQuality,
    0x0a, // uplink SNR +10
    1, // active antenna
    6, // RF mode
    3, // uplink transmit power index
    50, // downlink RSSI
    99, // downlink link quality
    0xf6, // downlink SNR -10
  ]);
  for (const [index, value] of overrides.entries()) {
    if (value >= 0) payload[index] = value;
  }
  const raw = encodeCrsfFrame({
    address: CrsfAddress.usb,
    type: CrsfFrameType.linkStatistics,
    payload,
  });
  return {
    address: raw[0] ?? 0,
    frameSize: raw[1] ?? 0,
    type: CrsfFrameType.linkStatistics,
    payload,
    raw,
  };
}

describe("CRSF link statistics", () => {
  it("decodes the standard ten-byte payload", () => {
    const statistics = parseCrsfLinkStatistics(linkFrame(88));

    expect(statistics).toMatchObject({
      uplinkRssiAntenna1Dbm: -40,
      uplinkRssiAntenna2Dbm: -45,
      uplinkLinkQuality: 88,
      uplinkSnrDb: 10,
      activeAntenna: 1,
      rfMode: 6,
      uplinkTransmitPowerIndex: 3,
      downlinkRssiDbm: -50,
      downlinkLinkQuality: 99,
      downlinkSnrDb: -10,
    });
  });

  it("refuses a frame of another type", () => {
    const frame = linkFrame(88);
    expect(
      parseCrsfLinkStatistics({ ...frame, type: CrsfFrameType.deviceInfo }),
    ).toBeNull();
  });

  it("refuses a truncated payload rather than reading zeros as a link", () => {
    const frame = linkFrame(88);
    expect(
      parseCrsfLinkStatistics({ ...frame, payload: frame.payload.slice(0, 6) }),
    ).toBeNull();
  });

  it("refuses an impossible link quality", () => {
    expect(parseCrsfLinkStatistics(linkFrame(200))).toBeNull();
  });
});

describe("binding evidence", () => {
  it("does not accept a link from a single frame", () => {
    const observer = new BindingLinkObserver();
    expect(observer.observe(linkFrame(70))).toBe(false);
    expect(observer.linked).toBe(false);
  });

  it("accepts a link only after enough qualifying frames", () => {
    const observer = new BindingLinkObserver();
    for (let index = 0; index < REQUIRED_LINK_FRAMES - 1; index += 1) {
      expect(observer.observe(linkFrame(70))).toBe(false);
    }
    expect(observer.observe(linkFrame(70))).toBe(true);
    expect(observer.statistics?.uplinkLinkQuality).toBe(70);
  });

  it("treats zero link quality as no link and resets the evidence", () => {
    const observer = new BindingLinkObserver();
    observer.observe(linkFrame(70));
    observer.observe(linkFrame(70));
    observer.observe(linkFrame(0));

    expect(observer.linked).toBe(false);
    expect(observer.qualifyingFrames).toBe(0);
    expect(observer.statistics).toBeNull();
  });

  it("ignores frames that are not link statistics", () => {
    const observer = new BindingLinkObserver();
    const other = { ...linkFrame(70), type: CrsfFrameType.deviceInfo };
    for (let index = 0; index < 10; index += 1) observer.observe(other);
    expect(observer.linked).toBe(false);
  });

  it("grades telemetry above an operator's report", () => {
    const observer = new BindingLinkObserver();
    for (let index = 0; index < REQUIRED_LINK_FRAMES; index += 1) {
      observer.observe(linkFrame(70));
    }

    const evidence = gradeBindingEvidence({
      observer,
      userReportedLink: false,
    });

    expect(evidence.level).toBe("LINK_OBSERVED_BY_TELEMETRY");
    expect(isMachineVerifiedBinding(evidence)).toBe(true);
  });

  it("never promotes an operator's confirmation to machine evidence", () => {
    const evidence = gradeBindingEvidence({
      observer: new BindingLinkObserver(),
      userReportedLink: true,
    });

    expect(evidence.level).toBe("USER_CONFIRMED_LINK");
    expect(evidence.statistics).toBeNull();
    expect(isMachineVerifiedBinding(evidence)).toBe(false);
  });

  it("reports a bare command acknowledgement as exactly that", () => {
    const evidence = gradeBindingEvidence({
      observer: new BindingLinkObserver(),
      userReportedLink: null,
    });

    expect(evidence.level).toBe("COMMAND_ACKNOWLEDGED_ONLY");
    expect(isMachineVerifiedBinding(evidence)).toBe(false);
  });
});
