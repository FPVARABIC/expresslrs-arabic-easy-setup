import type { MessageKey, TranslationParameters } from "@elrs-easy/i18n";

/**
 * What a completed firmware write actually proved about the bytes on the
 * device. The four routes verify very different things, and a completion
 * message that says "verified" for all of them would be claiming for XMODEM
 * what only the other three establish.
 */
export type FirmwareWriteVerification =
  /** esptool asked the chip's stub for the MD5 of every written region and compared it with the image. */
  | "DEVICE_FLASH_MD5_MATCHED"
  /** Every programmed block was read back over SWD and compared byte for byte. */
  | "SWD_READ_BACK_MATCHED"
  /** Every block was uploaded back from the DFU bootloader and compared byte for byte. */
  | "DFU_UPLOAD_READ_BACK_MATCHED"
  /** The bootloader acknowledged each XMODEM frame after checking its CRC-16 or checksum; nothing was read back. */
  | "RECEIVER_ACKNOWLEDGED_FRAMES";

/** What the rebooted device said about its regulatory domain, if anything. */
export type DomainEvidence =
  | Readonly<{ state: "MATCHED"; detail: string }>
  | Readonly<{ state: "NOT_PUBLISHED" }>;

export interface FirmwareWriteEvidence {
  readonly write: FirmwareWriteVerification;
  /** The device came back, and its Target, role and version/commit were read over CRSF and matched. */
  readonly identityAndVersion: "MATCHED_OVER_CRSF";
  readonly domain: DomainEvidence;
  /**
   * The binding phrase, Wi-Fi credentials, telemetry, fan, flag and buzzer
   * options are compiled into the image and are not readable over CRSF, so
   * nothing here can say the device is running them — only that the image
   * carrying them is what the write verified.
   */
  readonly optionsReadBack: "NOT_READABLE_OVER_CRSF";
}

export function firmwareWriteEvidence(input: {
  readonly write: FirmwareWriteVerification;
  readonly domain: DomainEvidence;
}): FirmwareWriteEvidence {
  return Object.freeze({
    write: input.write,
    identityAndVersion: "MATCHED_OVER_CRSF" as const,
    domain: input.domain,
    optionsReadBack: "NOT_READABLE_OVER_CRSF" as const,
  });
}

export interface EvidenceSentence {
  readonly key: MessageKey;
  readonly params?: TranslationParameters;
}

/**
 * The sentences that state the evidence, in the order they are shown: what
 * the write verified on the device, what the reboot proved, what the domain
 * said, and what could not be checked.
 */
export function firmwareWriteEvidenceSentences(
  evidence: FirmwareWriteEvidence,
): readonly EvidenceSentence[] {
  const sentences: EvidenceSentence[] = [
    { key: `wb.evidence.write.${evidence.write}` },
    { key: "wb.evidence.identityAndVersion" },
  ];
  if (evidence.domain.state === "MATCHED") {
    sentences.push({
      key: "wb.evidence.domain.MATCHED",
      params: { domain: evidence.domain.detail },
    });
  } else {
    sentences.push({ key: "wb.evidence.domain.NOT_PUBLISHED" });
  }
  sentences.push({ key: "wb.evidence.optionsNotReadBack" });
  return Object.freeze(sentences);
}
