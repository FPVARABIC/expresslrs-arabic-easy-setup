package com.fpvarabic.elrs.bridge

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import java.io.IOException

/**
 * The only part of this host that needs real hardware.
 *
 * Everything else — origin confinement, input validation, session ownership,
 * lifecycle — sits above [UsbBackend] and is exercised against a fake. This
 * class is what an emulator cannot run, so it is kept to the smallest thing
 * that can move bytes over CDC-ACM and nothing else.
 */
class AndroidUsbBackend(private val context: Context) : UsbBackend {

    private val manager: UsbManager
        get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

    /** Devices the operator explicitly refused, which `hasPermission` cannot express. */
    private val denied = mutableSetOf<String>()

    override fun listDevices(): List<UsbDeviceSummary> =
        manager.deviceList.values.map { device ->
            UsbDeviceSummary(
                deviceId = device.deviceName,
                vendorId = device.vendorId,
                productId = device.productId,
                productName = runCatching { device.productName }.getOrNull(),
                interfaces = device.describeInterfaces(),
            )
        }

    override fun permissionFor(deviceId: String): UsbDeviceGate.Permission {
        val device = find(deviceId) ?: return UsbDeviceGate.Permission.REVOKED
        if (manager.hasPermission(device)) return UsbDeviceGate.Permission.GRANTED
        // A device the operator turned down stays turned down until they attach
        // it again. Re-prompting on every list would train them to tap through.
        return if (deviceId in denied) {
            UsbDeviceGate.Permission.DENIED
        } else {
            UsbDeviceGate.Permission.UNKNOWN
        }
    }

    override fun requestPermission(
        deviceId: String,
        onResult: (UsbDeviceGate.Permission) -> Unit,
    ) {
        val device = find(deviceId)
        if (device == null) {
            onResult(UsbDeviceGate.Permission.REVOKED)
            return
        }
        if (manager.hasPermission(device)) {
            onResult(UsbDeviceGate.Permission.GRANTED)
            return
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, intent: Intent?) {
                runCatching { context.unregisterReceiver(this) }
                if (intent?.action != PERMISSION_ACTION) return
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                if (granted) {
                    denied.remove(deviceId)
                    onResult(UsbDeviceGate.Permission.GRANTED)
                } else {
                    denied.add(deviceId)
                    onResult(UsbDeviceGate.Permission.DENIED)
                }
            }
        }
        val filter = IntentFilter(PERMISSION_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }

        // Mutable because the framework fills in EXTRA_DEVICE and
        // EXTRA_PERMISSION_GRANTED; package-scoped so nothing else can deliver it.
        val intent = Intent(PERMISSION_ACTION).setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        manager.requestPermission(
            device,
            PendingIntent.getBroadcast(context, 0, intent, flags),
        )
    }

    override fun open(deviceId: String, baudRate: Int): UsbConnection {
        val device = find(deviceId)
            ?: throw UsbBackendException(UsbDeviceGate.Refusal.DETACHED, "device $deviceId is not attached")
        if (!manager.hasPermission(device)) {
            throw UsbBackendException(
                if (deviceId in denied) {
                    UsbDeviceGate.Refusal.PERMISSION_DENIED
                } else {
                    UsbDeviceGate.Refusal.PERMISSION_NOT_GRANTED
                },
                "USB permission has not been granted for $deviceId",
            )
        }

        val dataInterface = device.dataInterface()
            ?: throw UsbBackendException(
                UsbDeviceGate.Refusal.NO_CDC_DATA_INTERFACE,
                "device $deviceId exposes no CDC-ACM data interface",
            )
        val connection = manager.openDevice(device)
            ?: throw UsbBackendException(
                UsbDeviceGate.Refusal.PERMISSION_REVOKED,
                "the connection to $deviceId could not be opened",
            )
        if (!connection.claimInterface(dataInterface, true)) {
            connection.close()
            throw UsbBackendException(
                UsbDeviceGate.Refusal.NO_CDC_DATA_INTERFACE,
                "the data interface of $deviceId is held by another driver",
            )
        }

        val bulkIn = dataInterface.endpointOfDirection(UsbConstants.USB_DIR_IN)
        val bulkOut = dataInterface.endpointOfDirection(UsbConstants.USB_DIR_OUT)
        if (bulkIn == null || bulkOut == null) {
            connection.releaseInterface(dataInterface)
            connection.close()
            throw UsbBackendException(
                UsbDeviceGate.Refusal.NO_CDC_DATA_INTERFACE,
                "device $deviceId has no bulk endpoint pair",
            )
        }

        connection.configureLine(device, baudRate)
        return CdcAcmConnection(deviceId, connection, dataInterface, bulkIn, bulkOut)
    }

    private fun find(deviceId: String): UsbDevice? = manager.deviceList[deviceId]

    private companion object {
        /**
         * CDC-ACM class requests. `SET_LINE_CODING` carries the baud rate;
         * without `SET_CONTROL_LINE_STATE` most USB-serial bridges stay muted.
         */
        const val CDC_SET_LINE_CODING = 0x20
        const val CDC_SET_CONTROL_LINE_STATE = 0x22
        const val CDC_REQUEST_TYPE_OUT = 0x21
        const val CONTROL_TIMEOUT_MILLIS = 2_000
        const val PERMISSION_ACTION = "com.fpvarabic.elrs.bridge.USB_PERMISSION"

        fun UsbDevice.describeInterfaces(): List<UsbDeviceGate.InterfaceDescriptor> =
            (0 until interfaceCount).map { index ->
                val candidate = getInterface(index)
                UsbDeviceGate.InterfaceDescriptor(
                    interfaceClass = candidate.interfaceClass,
                    endpointCount = candidate.endpointCount,
                    hasBulkIn = candidate.endpointOfDirection(UsbConstants.USB_DIR_IN) != null,
                    hasBulkOut = candidate.endpointOfDirection(UsbConstants.USB_DIR_OUT) != null,
                )
            }

        fun UsbDevice.dataInterface(): UsbInterface? =
            (0 until interfaceCount)
                .map(::getInterface)
                .firstOrNull { candidate ->
                    UsbDeviceGate.isUsableDataInterface(
                        UsbDeviceGate.InterfaceDescriptor(
                            interfaceClass = candidate.interfaceClass,
                            endpointCount = candidate.endpointCount,
                            hasBulkIn = candidate.endpointOfDirection(UsbConstants.USB_DIR_IN) != null,
                            hasBulkOut = candidate.endpointOfDirection(UsbConstants.USB_DIR_OUT) != null,
                        ),
                    )
                }

        fun UsbInterface.endpointOfDirection(direction: Int): UsbEndpoint? =
            (0 until endpointCount)
                .map(::getEndpoint)
                .firstOrNull {
                    it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == direction
                }

        /** 8 data bits, 1 stop bit, no parity — what ExpressLRS speaks. */
        fun UsbDeviceConnection.configureLine(device: UsbDevice, baudRate: Int) {
            val controlIndex = (0 until device.interfaceCount)
                .map(device::getInterface)
                .firstOrNull { it.interfaceClass == UsbDeviceGate.CLASS_COMM }
                ?.id ?: 0
            val coding = byteArrayOf(
                (baudRate and 0xff).toByte(),
                ((baudRate shr 8) and 0xff).toByte(),
                ((baudRate shr 16) and 0xff).toByte(),
                ((baudRate shr 24) and 0xff).toByte(),
                0, // 1 stop bit
                0, // no parity
                8, // 8 data bits
            )
            controlTransfer(
                CDC_REQUEST_TYPE_OUT, CDC_SET_LINE_CODING, 0, controlIndex,
                coding, coding.size, CONTROL_TIMEOUT_MILLIS,
            )
            // DTR | RTS. ESP boards read these as the boot-mode strap, so they
            // are asserted here and driven explicitly by the flashing code.
            controlTransfer(
                CDC_REQUEST_TYPE_OUT, CDC_SET_CONTROL_LINE_STATE, 0x03, controlIndex,
                null, 0, CONTROL_TIMEOUT_MILLIS,
            )
        }
    }

    /** One claimed CDC-ACM interface. */
    private class CdcAcmConnection(
        override val deviceId: String,
        private val connection: UsbDeviceConnection,
        private val dataInterface: UsbInterface,
        private val bulkIn: UsbEndpoint,
        private val bulkOut: UsbEndpoint,
    ) : UsbConnection {

        @Volatile private var active = true
        override val isOpen: Boolean get() = active

        override fun write(bytes: ByteArray, timeoutMillis: Int): Int {
            if (!active) throw IOException("the port is closed")
            var sent = 0
            while (sent < bytes.size) {
                val chunk = minOf(bulkOut.maxPacketSize, bytes.size - sent)
                val moved = connection.bulkTransfer(
                    bulkOut, bytes, sent, chunk, timeoutMillis,
                )
                // A negative return is a stall or a timeout, not a short write.
                // Reporting it as success is how a truncated firmware image
                // reaches a device.
                if (moved < 0) throw IOException("the bulk write failed after $sent bytes")
                if (moved == 0) break
                sent += moved
            }
            return sent
        }

        override fun read(maxBytes: Int, timeoutMillis: Int): ByteArray {
            if (!active) throw IOException("the port is closed")
            val buffer = ByteArray(minOf(maxBytes, bulkIn.maxPacketSize * READ_PACKETS))
            val moved = connection.bulkTransfer(bulkIn, buffer, buffer.size, timeoutMillis)
            // A timeout with nothing to read is a quiet link, not a failure.
            if (moved <= 0) return ByteArray(0)
            return buffer.copyOf(moved)
        }

        override fun close() {
            if (!active) return
            active = false
            runCatching { connection.releaseInterface(dataInterface) }
            runCatching { connection.close() }
        }

        private companion object {
            const val READ_PACKETS = 8
        }
    }
}
