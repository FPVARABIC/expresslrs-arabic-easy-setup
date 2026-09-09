package com.fpvarabic.elrs.bridge

import java.io.IOException
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

/**
 * A USB backend with no USB in it.
 *
 * An emulator has no USB host, so without this the bridge's rules — origin,
 * frame, session ownership, cancellation, lifecycle — could not be tested at
 * all, and "the Android path is untested" would stay true indefinitely. This
 * stands in for the hardware so everything above it can be exercised.
 */
class FakeUsbBackend : UsbBackend {

    /** What the operator will do the next time permission is asked for. */
    enum class PermissionAnswer { GRANT, DENY, DISMISS, NEVER_ANSWER }

    var devices: MutableList<UsbDeviceSummary> = mutableListOf(cdcDevice(DEFAULT_DEVICE))
    var permissions: MutableMap<String, UsbDeviceGate.Permission> = mutableMapOf()
    var permissionAnswer: PermissionAnswer = PermissionAnswer.GRANT

    /** Set to have the next open fail with this refusal. */
    var openRefusal: UsbDeviceGate.Refusal? = null

    val openCount = AtomicInteger(0)
    val connections = ConcurrentLinkedQueue<FakeConnection>()

    /** Everything written, in the order the backend saw it. */
    val written = ConcurrentLinkedQueue<ByteArray>()

    /** Queued reads. An empty queue reads as a quiet link. */
    val readQueue = ConcurrentLinkedQueue<ByteArray>()

    /** Set to have the next transfer throw. */
    @Volatile var failNextTransfer: IOException? = null

    /** Held to make a transfer block, so a cancel has something to overtake. */
    @Volatile var blockTransfer: CountDownLatch? = null

    override fun listDevices(): List<UsbDeviceSummary> = devices.toList()

    override fun permissionFor(deviceId: String): UsbDeviceGate.Permission =
        permissions[deviceId] ?: UsbDeviceGate.Permission.UNKNOWN

    override fun requestPermission(
        deviceId: String,
        onResult: (UsbDeviceGate.Permission) -> Unit,
    ) {
        when (permissionAnswer) {
            PermissionAnswer.GRANT -> {
                permissions[deviceId] = UsbDeviceGate.Permission.GRANTED
                onResult(UsbDeviceGate.Permission.GRANTED)
            }
            PermissionAnswer.DENY -> {
                permissions[deviceId] = UsbDeviceGate.Permission.DENIED
                onResult(UsbDeviceGate.Permission.DENIED)
            }
            // A dismissed dialog is not a denial. The host reports UNKNOWN, and
            // the page has to be able to tell those apart before it tells the
            // operator to go and change a system setting.
            PermissionAnswer.DISMISS -> onResult(UsbDeviceGate.Permission.UNKNOWN)
            PermissionAnswer.NEVER_ANSWER -> Unit
        }
    }

    override fun open(deviceId: String, baudRate: Int): UsbConnection {
        openRefusal?.let { refusal ->
            throw UsbBackendException(refusal, "the fake backend refused with $refusal")
        }
        if (devices.none { it.deviceId == deviceId }) {
            throw UsbBackendException(UsbDeviceGate.Refusal.DETACHED, "device $deviceId is not attached")
        }
        if (permissionFor(deviceId) != UsbDeviceGate.Permission.GRANTED) {
            throw UsbBackendException(
                UsbDeviceGate.Refusal.PERMISSION_NOT_GRANTED,
                "permission has not been granted for $deviceId",
            )
        }
        openCount.incrementAndGet()
        val connection = FakeConnection(deviceId, baudRate)
        connections.add(connection)
        return connection
    }

    /** The connection handed out most recently, open or not. */
    fun lastConnection(): FakeConnection? = connections.lastOrNull()

    inner class FakeConnection(
        override val deviceId: String,
        val baudRate: Int,
    ) : UsbConnection {

        @Volatile private var open = true
        val closeCount = AtomicInteger(0)

        override val isOpen: Boolean get() = open

        override fun write(bytes: ByteArray, timeoutMillis: Int): Int {
            gate()
            written.add(bytes.copyOf())
            return bytes.size
        }

        override fun read(maxBytes: Int, timeoutMillis: Int): ByteArray {
            gate()
            val next = readQueue.poll() ?: return ByteArray(0)
            return if (next.size <= maxBytes) next else next.copyOf(maxBytes)
        }

        override fun close() {
            if (!open) return
            open = false
            closeCount.incrementAndGet()
        }

        private fun gate() {
            if (!open) throw IOException("the fake port is closed")
            blockTransfer?.await()
            failNextTransfer?.let { failure ->
                failNextTransfer = null
                throw failure
            }
        }
    }

    companion object {
        const val DEFAULT_DEVICE = "/dev/bus/usb/001/002"

        /** A device shaped like a CDC-ACM serial adapter. */
        fun cdcDevice(
            deviceId: String,
            vendorId: Int = 0x10c4,
            productId: Int = 0xea60,
            productName: String? = "ExpressLRS TX",
        ) = UsbDeviceSummary(
            deviceId = deviceId,
            vendorId = vendorId,
            productId = productId,
            productName = productName,
            interfaces = listOf(
                UsbDeviceGate.InterfaceDescriptor(
                    interfaceClass = UsbDeviceGate.CLASS_COMM,
                    endpointCount = 1,
                    hasBulkIn = false,
                    hasBulkOut = false,
                ),
                UsbDeviceGate.InterfaceDescriptor(
                    interfaceClass = UsbDeviceGate.CLASS_CDC_DATA,
                    endpointCount = 2,
                    hasBulkIn = true,
                    hasBulkOut = true,
                ),
            ),
        )

        /** A device with no data interface, which this host cannot drive. */
        fun hidDevice(deviceId: String) = UsbDeviceSummary(
            deviceId = deviceId,
            vendorId = 0x046d,
            productId = 0xc52b,
            productName = "Some HID thing",
            interfaces = listOf(
                UsbDeviceGate.InterfaceDescriptor(
                    interfaceClass = 3,
                    endpointCount = 1,
                    hasBulkIn = false,
                    hasBulkOut = false,
                ),
            ),
        )
    }
}
