import "@fontsource-variable/cairo/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defaultLocale, getDirection } from "@elrs-easy/i18n";
import { App } from "./App";
import { BindingPreviewLab } from "./BindingPreviewLab";
import { FirmwarePreviewLab } from "./FirmwarePreviewLab";
import { SoftwareLabIndex } from "./SoftwareLabIndex";
import { SoftwareLabLauncher } from "./SoftwareLabLauncher";
import { resolveApplicationView } from "./view-model/applicationView";
import "./styles.css";
import "./software-lab-navigation.css";

document.documentElement.lang = defaultLocale;
document.documentElement.dir = getDirection(defaultLocale);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

const selectedView = resolveApplicationView(window.location.search);
const selectedApplication =
  selectedView === "SOFTWARE_LABS" ? (
    <SoftwareLabIndex />
  ) : selectedView === "BINDING_PREVIEW" ? (
    <BindingPreviewLab />
  ) : selectedView === "FIRMWARE_PREVIEW" ? (
    <FirmwarePreviewLab />
  ) : (
    <>
      <App />
      <SoftwareLabLauncher />
    </>
  );

createRoot(root).render(<StrictMode>{selectedApplication}</StrictMode>);
