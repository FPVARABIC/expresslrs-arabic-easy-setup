import "@fontsource-variable/cairo/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defaultLocale, getDirection } from "@elrs-easy/i18n";
import { App } from "./App";
import { BindingPreviewLab } from "./BindingPreviewLab";
import "./styles.css";

document.documentElement.lang = defaultLocale;
document.documentElement.dir = getDirection(defaultLocale);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

const selectedView = new URLSearchParams(window.location.search).get("view");

createRoot(root).render(
  <StrictMode>
    {selectedView === "binding-preview" ? <BindingPreviewLab /> : <App />}
  </StrictMode>,
);
