import type { MessageKey } from "@elrs-easy/i18n";

import type { ReadOnlyHealthPresentation } from "../view-model/readOnlyHealthPresentation";

interface ReadOnlyHealthPanelProps {
  readonly presentation: ReadOnlyHealthPresentation;
  readonly translate: (key: MessageKey) => string;
}

/**
 * Advanced-mode presentation only. This component receives the already
 * rebuilt fixed-category view model, never a device report or provider value.
 */
export function ReadOnlyHealthPanel({
  presentation,
  translate,
}: ReadOnlyHealthPanelProps) {
  return (
    <section
      className="technical-panel read-only-health-panel"
      aria-label={translate("advanced.heading")}
      data-health-tone={presentation.tone}
    >
      <div className="read-only-health-summary" role="status">
        <strong>{translate(presentation.overallKey)}</strong>
        <p>{translate(presentation.summaryKey)}</p>
      </div>

      <dl className="technical-grid read-only-health-grid">
        {presentation.rows.map((row) => (
          <div key={row.id} data-health-tone={row.tone}>
            <dt>{translate(row.labelKey)}</dt>
            <dd>{translate(row.statusKey)}</dd>
          </div>
        ))}
      </dl>

      <p className="read-only-health-boundary">
        {translate(presentation.writeBoundaryKey)}
      </p>
    </section>
  );
}
