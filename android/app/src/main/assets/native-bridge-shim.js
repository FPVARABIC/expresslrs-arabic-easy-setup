/*
 * The page half of the native USB bridge.
 *
 * This runs at document start, before the application bundle, and installs
 * `window.elrsNativeBridge` in the shape `apps/web/src/hardware/native-bridge.ts`
 * already accepts: a Web Serial-looking port factory. Nothing above it changes
 * between a desktop browser and this APK, which is the point — the CRSF
 * framing, the flashing, the recovery and the verification that were reviewed
 * and tested are the same code either way.
 *
 * It is injected by the host rather than bundled into the web build so that the
 * web assets inside the APK are byte-identical to the ones served on the web,
 * and the APK's recorded web build SHA means what it says.
 */
(function () {
  "use strict";

  var host = window.elrsNativeHost;
  if (!host || typeof host.postMessage !== "function") return;

  var CRSF_BAUD = 420000;
  /* Long enough that a quiet link is not a busy loop, short enough that a
   * cancelled read stops within a frame or two of the operator asking. */
  var READ_POLL_MS = 250;

  var pending = new Map();
  var nextCallId = 0;

  host.onmessage = (event) => {
    const raw = typeof event === "string" ? event : event && event.data;
    let reply;
    try {
      reply = JSON.parse(raw);
    } catch {
      // A reply this build cannot parse is a host it does not understand.
      // Dropping it leaves the caller's promise pending until the host's own
      // lifecycle rejects it, which is safer than resolving on a guess.
      return;
    }
    const settle = pending.get(reply.callId);
    if (!settle) return;
    pending.delete(reply.callId);
    if (reply.ok) settle.resolve(reply.result);
    else settle.reject(bridgeError(reply.reason, reply.message));
  };

  function bridgeError(reason, message) {
    var error = new Error(
      message || reason || "the native bridge refused the request",
    );
    error.name = reason || "BridgeError";
    /* The web layer maps a refusal to operator text by this field, not by
     * matching on the message, which is free text. */
    error.bridgeReason = reason || "UNKNOWN";
    return error;
  }

  function call(request) {
    return new Promise(function (resolve, reject) {
      var callId = "c" + nextCallId++;
      request.callId = callId;
      pending.set(callId, { resolve: resolve, reject: reject });
      try {
        host.postMessage(JSON.stringify(request));
      } catch (error) {
        pending.delete(callId);
        reject(error);
      }
    });
  }

  function matchesFilters(device, filters) {
    if (!filters || filters.length === 0) return true;
    for (var index = 0; index < filters.length; index += 1) {
      var filter = filters[index];
      var vendorOk =
        filter.usbVendorId === undefined ||
        filter.usbVendorId === device.vendorId;
      var productOk =
        filter.usbProductId === undefined ||
        filter.usbProductId === device.productId;
      if (vendorOk && productOk) return true;
    }
    return false;
  }

  /**
   * A Web Serial-shaped port over the native bridge.
   *
   * Built as a closure rather than a prototype so the session id and the
   * running byte offset are not properties a page bug can reach and corrupt
   * mid-firmware-write.
   */
  function nativePort(device) {
    let sessionId = null;
    let written = 0;

    const state = {
      get sessionId() {
        return sessionId;
      },
      get written() {
        return written;
      },
      advance(next) {
        written = next;
      },
    };

    const port = {
      readable: null,
      writable: null,
      ondisconnect: null,
      getInfo() {
        return { usbVendorId: device.vendorId, usbProductId: device.productId };
      },
      open(options) {
        const baudRate = (options && options.baudRate) || CRSF_BAUD;
        return call({
          operation: "open",
          deviceId: device.deviceId,
          baudRate: baudRate,
        }).then((result) => {
          sessionId = result.sessionId;
          written = 0;
          port.readable = { getReader: () => makeReader(state) };
          port.writable = { getWriter: () => makeWriter(state) };
        });
      },
      close() {
        if (sessionId === null) return Promise.resolve();
        const closing = sessionId;
        sessionId = null;
        port.readable = null;
        port.writable = null;
        return call({ operation: "close", sessionId: closing }).then(
          () => {},
          /* A port the host has already released — detach, background, a
           * destroyed Activity — is a closed port. Reporting that as a failure
           * would send the caller into an error path over an outcome it asked
           * for. */
          () => {},
        );
      },
    };

    /* Web Serial has no `forget`; the host releases the interface on close and
     * Android permission is per-device, so there is nothing further to drop. */
    return port;
  }

  function makeReader(state) {
    let cancelled = false;
    return {
      read() {
        if (cancelled || state.sessionId === null) {
          return Promise.resolve({ done: true });
        }
        return call({
          operation: "read",
          sessionId: state.sessionId,
          maxBytes: 4096,
          timeoutMillis: READ_POLL_MS,
        }).then(
          (result) => {
            if (cancelled) return { done: true };
            /* A quiet interval is not the end of the stream. An empty chunk
             * sends the caller round again, paced by the native read timeout
             * rather than by a spin. */
            if (!result.length)
              return { done: false, value: new Uint8Array(0) };
            return { done: false, value: Uint8Array.from(result.bytes) };
          },
          (error) => {
            if (cancelled) return { done: true };
            if (
              error.bridgeReason === "CANCELLED" ||
              error.bridgeReason === "SESSION_NOT_OPEN"
            ) {
              return { done: true };
            }
            throw error;
          },
        );
      },
      cancel() {
        cancelled = true;
        if (state.sessionId === null) return Promise.resolve();
        return call({ operation: "cancel", sessionId: state.sessionId }).then(
          () => {},
          () => {},
        );
      },
      releaseLock() {},
    };
  }

  function makeWriter(state) {
    /* Writes are serialised here as well as natively. The native side is the
     * guarantee; this keeps the promise ordering the caller sees honest. */
    let queue = Promise.resolve();
    return {
      write(data) {
        queue = queue.then(() => {
          if (state.sessionId === null) {
            return Promise.reject(
              bridgeError("SESSION_NOT_OPEN", "the port is closed"),
            );
          }
          const bytes = Array.prototype.slice.call(
            data instanceof Uint8Array ? data : new Uint8Array(data),
          );
          return call({
            operation: "write",
            sessionId: state.sessionId,
            bytes: bytes,
            offset: state.written,
            timeoutMillis: 5000,
          }).then((result) => {
            state.advance(result.offset);
          });
        });
        return queue;
      },
      releaseLock() {},
    };
  }

  function requestPort(options) {
    var filters = options && options.filters;
    return call({ operation: "list" }).then(function (devices) {
      var candidates = devices.filter(function (device) {
        return matchesFilters(device, filters);
      });
      if (candidates.length === 0) {
        throw bridgeError("NO_DEVICE", "no USB serial device is attached");
      }
      var device = candidates[0];
      if (device.usable) return nativePort(device);
      return call({
        operation: "requestPermission",
        deviceId: device.deviceId,
      }).then(function (result) {
        if (!result.granted) {
          throw bridgeError(
            result.permission === "DENIED" ? "PERMISSION_DENIED" : "CANCELLED",
            result.permission === "DENIED"
              ? "USB permission was denied for this device"
              : "the USB permission request was dismissed",
          );
        }
        return nativePort(device);
      });
    });
  }

  function getPorts() {
    /* Android grants USB permission per attach, so there is no persistent
     * previously-granted set to hand back. An empty list is the truth. */
    return Promise.resolve([]);
  }

  Object.defineProperty(window, "elrsNativeBridge", {
    value: Object.freeze({
      version: 1,
      serial: Object.freeze({ requestPort: requestPort, getPorts: getPorts }),
      host: Object.freeze(JSON.parse(window.__elrsNativeHostIdentity || "{}")),
    }),
    writable: false,
    configurable: false,
    enumerable: true,
  });
})();
