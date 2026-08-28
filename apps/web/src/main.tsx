import "@fontsource-variable/cairo/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defaultLocale, getDirection } from "@elrs-easy/i18n";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ApplicationUpdateNotice } from "./pwa/ApplicationUpdateNotice";
import { NetworkModeNotice } from "./pwa/NetworkModeNotice";
import "./styles.css";
import "./pwa/pwa.css";
import "./reference-theme.css";

document.documentElement.lang = defaultLocale;
document.documentElement.dir = getDirection(defaultLocale);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <NetworkModeNotice />
    <ApplicationUpdateNotice />
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
