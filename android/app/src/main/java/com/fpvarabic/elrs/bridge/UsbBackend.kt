package com.fpvarabic.elrs.bridge

/**
 * The USB operations the bridge needs, behind an interface.
 *
 * Everything above this line — origin checks, input validation, session
 * ownership, lifecycle — is testable on an emulator, which has no USB host. The
 * real implementation is the only part that needs hardware, and swapping a fake
 * in here is what lets the rest be tested at all.
 */
interface UsbBackend {

    /** Devices currently attached that this host could drive. */
    fun listDevices(): List<UsbDeviceSummary>

    /** Whether the operator has already granted permission for this device. */
    fun permissionFor(deviceId: String): UsbDeviceGate.Permission

    /**
     * Asks the operator for permission. The result arrives through [onResult];
     * a cancelled dialog reports [UsbDeviceGate.Permission.UNKNOWN] rather than
     * a denial, because those are different facts.
     */
    fun requestPermission(deviceId: String, onResult: (UsbDeviceGate.Permission) -> Unit)

    /**
     * Opens the CDC-ACM data interface at [baudRate]. Throws
     * [UsbBackendException] on refusal.
     */
    fun open(deviceId: String, baudRate: Int): UsbConnection
}

data class UsbDeviceSummary(
    val deviceId: String,
    val vendorId: Int,
    val productId: Int,
    val productName: String?,
    val interfaces: List<UsbDeviceGate.InterfaceDescriptor>,
)

/** One open port. Closing twice is safe; using it after closing is not allowed. */
interface UsbConnection {
    val deviceId: String
    val isOpen: Boolean
    fun write(bytes: ByteArray, timeoutMillis: Int): Int
    fun read(maxBytes: Int, timeoutMillis: Int): ByteArray
    fun close()
}

class UsbBackendException(
    val refusal: UsbDeviceGate.Refusal,
    message: String,
) : Exception(message)
