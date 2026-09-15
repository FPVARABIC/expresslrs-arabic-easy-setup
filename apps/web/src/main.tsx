import "@fontsource-variable/cairo/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defaultLocale, getDirection, translate } from "@elrs-easy/i18n";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ProductShell } from "./components/ProductShell";
import { ApplicationUpdateNotice } from "./pwa/ApplicationUpdateNotice";
import { NetworkModeNotice } from "./pwa/NetworkModeNotice";
import "./styles.css";
import "./pwa/pwa.css";
import "./reference-theme.css";
import "./parity-workbench.css";
import "./physical-acceptance.css";
import "./easy.css";

document.documentElement.lang = defaultLocale;
document.documentElement.dir = getDirection(defaultLocale);

// The title follows the chosen locale, so ProductShell owns it alongside
// `lang` and `dir`. Seeding it here from the default keeps the tab named
// before React mounts.
document.title = translate(defaultLocale, "app.name");

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <NetworkModeNotice />
    <ApplicationUpdateNotice />
    <AppErrorBoundary>
      <ProductShell />
    </AppErrorBoundary>
  </StrictMode>,
);
