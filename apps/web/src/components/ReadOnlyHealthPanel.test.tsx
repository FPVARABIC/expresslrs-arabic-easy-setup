import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createReadOnlyHealthAssessment,
  type ReadOnlyHealthAssessment,
} from "@elrs-easy/diagnostics";
import { createTranslator } from "@elrs-easy/i18n";

import { ReadOnlyHealthPanel } from "./ReadOnlyHealthPanel";
import { createReadOnlyHealthPresentation } from "../view-model/readOnlyHealthPresentation";

function renderPanel(
  assessment: ReadOnlyHealthAssessment,
  locale: "ar" | "en",
) {
  const presentation = createReadOnlyHealthPresentation(assessment);
  render(
    <ReadOnlyHealthPanel
      presentation={presentation}
      translate={createTranslator(locale)}
    />,
  );
  return presentation;
}

function healthyAssessment() {
  return createReadOnlyHealthAssessment({
    confidence: "CONFIRMED",
    compatibility: "SUPPORTED_BY_CATALOG",
    binding: "LINK_ESTABLISHED_VERIFIED",
    firmware: "CURRENT_APPROVED",
    configuration: "READ_ONLY_AVAILABLE",
    connection: "STABLE_OBSERVED",
  });
}

describe("ReadOnlyHealthPanel", () => {
  it("renders only the six fixed health rows plus the read-only boundary", () => {
    const presentation = renderPanel(healthyAssessment(), "en");

    expect(screen.getByText("Detection confidence")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(
      screen.getByText("Bind transmitter and receiver"),
    ).toBeInTheDocument();
    expect(screen.getByText("Firmware")).toBeInTheDocument();
    expect(screen.getByText("Essential settings")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
    expect(screen.getAllByText("Complete")).toHaveLength(6);
    expect(
      screen.getByText("Safe preview. No command is sent to real hardware."),
    ).toBeInTheDocument();
    expect(presentation.rows).toHaveLength(6);
  });

  it("uses Arabic translations without introducing question-form prompts", () => {
    renderPanel(healthyAssessment(), "ar");

    const panel = screen.getByRole("region");
    expect(panel.textContent).not.toContain("؟");
    expect(panel.textContent).not.toContain("?");
  });

  it("shows blocked presentation without exposing automatic repair controls", () => {
    renderPanel(
      createReadOnlyHealthAssessment({
        confidence: "UNKNOWN",
        compatibility: "UNKNOWN",
        binding: "UNKNOWN",
        firmware: "UNKNOWN",
        configuration: "UNKNOWN",
        connection: "UNKNOWN",
      }),
      "en",
    );

    expect(
      screen.getByText("Sensitive operations are blocked"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never renders raw findings or secret-like data from the source assessment", () => {
    const assessment = {
      ...healthyAssessment(),
      findings: [
        {
          id: "ATTACKER_DEFINED",
          severity: "INFO",
          recommendationCode: "password=private-value",
          automaticFixAvailable: false,
        },
      ],
      rawResponse: "private-response",
    } as unknown as ReadOnlyHealthAssessment;

    const presentation = createReadOnlyHealthPresentation(assessment);
    render(
      <ReadOnlyHealthPanel
        presentation={presentation}
        translate={createTranslator("en")}
      />,
    );

    expect(document.body.textContent).not.toContain("private-value");
    expect(document.body.textContent).not.toContain("private-response");
    expect(document.body.textContent).not.toContain("ATTACKER_DEFINED");
  });
});
