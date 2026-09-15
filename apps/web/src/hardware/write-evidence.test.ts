import { describe, expect, it } from "vitest";

import {
  firmwareWriteEvidence,
  firmwareWriteEvidenceSentences,
} from "./write-evidence";

describe("firmware write evidence", () => {
  it("states what each route verified, then the reboot, the domain, and what cannot be read back", () => {
    const md5 = firmwareWriteEvidence({
      write: "DEVICE_FLASH_MD5_MATCHED",
      domain: { state: "MATCHED", detail: "ISM2G4" },
    });
    expect(md5.identityAndVersion).toBe("MATCHED_OVER_CRSF");
    expect(md5.optionsReadBack).toBe("NOT_READABLE_OVER_CRSF");
    expect(firmwareWriteEvidenceSentences(md5).map((s) => s.key)).toEqual([
      "wb.evidence.write.DEVICE_FLASH_MD5_MATCHED",
      "wb.evidence.identityAndVersion",
      "wb.evidence.domain.MATCHED",
      "wb.evidence.optionsNotReadBack",
    ]);
    expect(firmwareWriteEvidenceSentences(md5)[2]?.params).toEqual({
      domain: "ISM2G4",
    });

    const xmodem = firmwareWriteEvidence({
      write: "RECEIVER_ACKNOWLEDGED_FRAMES",
      domain: { state: "NOT_PUBLISHED" },
    });
    expect(firmwareWriteEvidenceSentences(xmodem).map((s) => s.key)).toEqual([
      "wb.evidence.write.RECEIVER_ACKNOWLEDGED_FRAMES",
      "wb.evidence.identityAndVersion",
      "wb.evidence.domain.NOT_PUBLISHED",
      "wb.evidence.optionsNotReadBack",
    ]);
  });
});
