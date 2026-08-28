import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { WebSerialPort } from "../view-model/webSerialConnection";
import { DeviceConnectionHubPanel } from "./DeviceConnectionHub";

function fakePort(): WebSerialPort {
  return {
    ondisconnect: null,
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
  };
}

describe("real device connection hub", () => {
  it("offers direct TX Wi-Fi addresses without starting a background request", () => {
    render(<DeviceConnectionHubPanel locale="ar" />);

    expect(
      screen.getByRole("heading", { name: "اتصال الجهاز" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "فتح صفحة الجهاز 10.0.0.1" }),
    ).toHaveAttribute("href", "http://10.0.0.1/");
    expect(
      screen.getByRole("link", {
        name: "فتح عنوان المرسل elrs_tx.local",
      }),
    ).toHaveAttribute("href", "http://elrs_tx.local/");
  });

  it("opens and closes one user-selected USB port without writing", async () => {
    const user = userEvent.setup();
    const port = fakePort();
    const requestPort = vi.fn().mockResolvedValue(port);
    render(
      <DeviceConnectionHubPanel
        locale="ar"
        navigatorObject={{ serial: { requestPort } }}
        secureContext
      />,
    );

    await user.click(screen.getByRole("tab", { name: "USB / UART" }));
    await user.click(
      screen.getByRole("button", { name: "اختيار وفتح منفذ USB" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("منفذ USB مفتوح"),
    );
    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115_200 });
    expect(screen.getByText(/VID 0x303A · PID 0x1001/u)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "إغلاق منفذ USB" }));
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("تم إغلاق منفذ USB");
  });

  it("routes receiver passthrough to the official Web Flasher", async () => {
    const user = userEvent.setup();
    render(<DeviceConnectionHubPanel locale="ar" />);

    await user.click(screen.getByRole("button", { name: "جهاز استقبال RX" }));
    await user.click(
      screen.getByRole("tab", { name: "Betaflight Passthrough" }),
    );

    expect(
      screen.getByRole("link", { name: "فتح Web Flasher الرسمي" }),
    ).toHaveAttribute(
      "href",
      "https://expresslrs.github.io/web-flasher/?type=rx&method=betaflight",
    );
  });

  it("reports unsupported Web Serial honestly", async () => {
    const user = userEvent.setup();
    render(
      <DeviceConnectionHubPanel
        locale="ar"
        navigatorObject={{}}
        secureContext
      />,
    );

    await user.click(screen.getByRole("tab", { name: "USB / UART" }));
    await user.click(
      screen.getByRole("button", { name: "اختيار وفتح منفذ USB" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Web Serial غير مدعوم في هذا المتصفح",
      ),
    );
  });
});
