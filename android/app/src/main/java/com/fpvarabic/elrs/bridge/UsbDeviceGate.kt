package com.fpvarabic.elrs.bridge

/**
 * The decisions this host makes about a USB device, with no Android types in
 * them, so they can be tested on a JVM without a device or an emulator.
 *
 * Everything that needs hardware lives in [UsbSerialBridge]. Everything that is
 * a rule lives here. That split is deliberate: the rules are what a reviewer
 * needs to be able to check, and they are exactly what an emulator cannot
 * exercise anyway, because an emulator has no USB host.
 */
object UsbDeviceGate {

    /** USB CDC-ACM, the class this host speaks. */
    const val CLASS_COMM = 2
    const val CLASS_CDC_DATA = 10

    /**
     * Why a device cannot be opened. Every value is a live condition about this
     * device right now — never a build stage, and never "not supported yet".
     */
    enum class Refusal {
        /** The operator has not granted USB permission for this device. */
        PERMISSION_NOT_GRANTED,

        /** The operator explicitly denied it. */
        PERMISSION_DENIED,

        /** Permission was granted and then revoked, so the handle is stale. */
        PERMISSION_REVOKED,

        /** The device exposes no CDC-ACM data interface this host can drive. */
        NO_CDC_DATA_INTERFACE,

        /** The device was detached. */
        DETACHED,
    }

    /** What the host knows about one device's permission. */
    enum class Permission { UNKNOWN, GRANTED, DENIED, REVOKED }

    data class InterfaceDescriptor(
        val interfaceClass: Int,
        val endpointCount: Int,
        val hasBulkIn: Boolean,
        val hasBulkOut: Boolean,
    )

    /**
     * A CDC-ACM data interface needs a bulk pair. An interface that only
     * advertises the class without endpoints cannot move bytes and must be
     * refused rather than opened and silently stalled.
     */
    fun isUsableDataInterface(descriptor: InterfaceDescriptor): Boolean =
        descriptor.interfaceClass == CLASS_CDC_DATA &&
            descriptor.hasBulkIn &&
            descriptor.hasBulkOut &&
            descriptor.endpointCount >= 2

    fun findDataInterface(
        interfaces: List<InterfaceDescriptor>,
    ): InterfaceDescriptor? = interfaces.firstOrNull(::isUsableDataInterface)

    /**
     * Whether a port may be opened, and if not, precisely why.
     *
     * Returning a [Refusal] rather than a boolean is the whole point: the web
     * layer shows the operator the reason and what to do about it, exactly as
     * it does for a missing browser API or an incompatible Target.
     */
    fun refusalFor(
        permission: Permission,
        attached: Boolean,
        interfaces: List<InterfaceDescriptor>,
    ): Refusal? {
        if (!attached) return Refusal.DETACHED
        when (permission) {
            Permission.DENIED -> return Refusal.PERMISSION_DENIED
            Permission.REVOKED -> return Refusal.PERMISSION_REVOKED
            Permission.UNKNOWN -> return Refusal.PERMISSION_NOT_GRANTED
            Permission.GRANTED -> Unit
        }
        if (findDataInterface(interfaces) == null) {
            return Refusal.NO_CDC_DATA_INTERFACE
        }
        return null
    }

    /**
     * A detach during an operation must close the port rather than leave it
     * held. Android does not reclaim a connection for us, and a held interface
     * blocks the next attempt — which is how an operator ends up power-cycling
     * a device mid-recovery.
     */
    fun shouldReleaseOnDetach(open: Boolean): Boolean = open
}
