import { Component, type ReactNode } from "react";
import {
  getApplicationFailureCopy,
  type NetworkModeLocale,
} from "@elrs-easy/i18n";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly failed: boolean;
}

function readLocale(): NetworkModeLocale {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    const copy = getApplicationFailureCopy(readLocale());
    return (
      <main className="app-error-fallback" role="alert">
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </main>
    );
  }
}
