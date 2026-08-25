import "@fontsource-variable/cairo/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defaultLocale, getDirection } from "@elrs-easy/i18n";
import { App } from "./App";
import { NetworkModeNotice } from "./pwa/NetworkModeNotice";
import { registerSafeServiceWorker } from "./pwa/register-service-worker";
import "./styles.css";
import "./pwa/pwa.css";

document.documentElement.lang = defaultLocale;
document.documentElement.dir = getDirection(defaultLocale);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <NetworkModeNotice />
    <App />
  </StrictMode>,
);

function startServiceWorkerRegistration() {
  void registerSafeServiceWorker();
}

if (document.readyState === "complete") {
  startServiceWorkerRegistration();
} else {
  window.addEventListener("load", startServiceWorkerRegistration, {
    once: true,
  });
}
