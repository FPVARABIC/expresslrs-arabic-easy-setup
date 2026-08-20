export const applicationViews = [
  "DEFAULT",
  "SOFTWARE_LABS",
  "BINDING_PREVIEW",
  "FIRMWARE_PREVIEW",
] as const;

export type ApplicationView = (typeof applicationViews)[number];

const queryValueByView = Object.freeze({
  SOFTWARE_LABS: "software-labs",
  BINDING_PREVIEW: "binding-preview",
  FIRMWARE_PREVIEW: "firmware-preview",
} as const satisfies Record<Exclude<ApplicationView, "DEFAULT">, string>);

/**
 * Selects only one exact known view. Unknown, empty, or duplicated `view`
 * parameters fail closed to the normal application.
 */
export function resolveApplicationView(search: string): ApplicationView {
  const parameters = new URLSearchParams(search);
  const viewValues = parameters.getAll("view");
  if (viewValues.length !== 1) {
    return "DEFAULT";
  }

  switch (viewValues[0]) {
    case queryValueByView.SOFTWARE_LABS:
      return "SOFTWARE_LABS";
    case queryValueByView.BINDING_PREVIEW:
      return "BINDING_PREVIEW";
    case queryValueByView.FIRMWARE_PREVIEW:
      return "FIRMWARE_PREVIEW";
    default:
      return "DEFAULT";
  }
}

/**
 * Produces a same-origin relative link while preserving unrelated query values,
 * pathname, and hash. Existing duplicated `view` values are removed first.
 */
export function buildApplicationViewHref(
  currentHref: string,
  view: ApplicationView,
): string {
  const url = new URL(currentHref, "https://elrs-easy.invalid");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Application view links require an HTTP(S) base URL");
  }

  url.searchParams.delete("view");
  if (view !== "DEFAULT") {
    url.searchParams.set("view", queryValueByView[view]);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
