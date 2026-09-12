package com.fpvarabic.elrs.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UsbDeviceGateTest {

    private fun cdcData(
        hasBulkIn: Boolean = true,
        hasBulkOut: Boolean = true,
        endpointCount: Int = 2,
    ) = UsbDeviceGate.InterfaceDescriptor(
        interfaceClass = UsbDeviceGate.CLASS_CDC_DATA,
        endpointCount = endpointCount,
        hasBulkIn = hasBulkIn,
        hasBulkOut = hasBulkOut,
    )

    @Test
    fun `a complete CDC data interface is usable`() {
        assertTrue(UsbDeviceGate.isUsableDataInterface(cdcData()))
    }

    @Test
    fun `an interface without a bulk pair cannot move bytes`() {
        assertEquals(false, UsbDeviceGate.isUsableDataInterface(cdcData(hasBulkIn = false)))
        assertEquals(false, UsbDeviceGate.isUsableDataInterface(cdcData(hasBulkOut = false)))
        assertEquals(false, UsbDeviceGate.isUsableDataInterface(cdcData(endpointCount = 1)))
    }

    @Test
    fun `the control interface alone is not a data interface`() {
        val control = UsbDeviceGate.InterfaceDescriptor(
            interfaceClass = UsbDeviceGate.CLASS_COMM,
            endpointCount = 1,
            hasBulkIn = false,
            hasBulkOut = false,
        )
        assertEquals(false, UsbDeviceGate.isUsableDataInterface(control))
        assertNull(UsbDeviceGate.findDataInterface(listOf(control)))
    }

    @Test
    fun `a detached device is refused before anything else is considered`() {
        assertEquals(
            UsbDeviceGate.Refusal.DETACHED,
            UsbDeviceGate.refusalFor(
                permission = UsbDeviceGate.Permission.GRANTED,
                attached = false,
                interfaces = listOf(cdcData()),
            ),
        )
    }

    @Test
    fun `each permission state has its own reason`() {
        val cases = mapOf(
            UsbDeviceGate.Permission.UNKNOWN to UsbDeviceGate.Refusal.PERMISSION_NOT_GRANTED,
            UsbDeviceGate.Permission.DENIED to UsbDeviceGate.Refusal.PERMISSION_DENIED,
            UsbDeviceGate.Permission.REVOKED to UsbDeviceGate.Refusal.PERMISSION_REVOKED,
        )
        for ((permission, expected) in cases) {
            assertEquals(
                expected,
                UsbDeviceGate.refusalFor(
                    permission = permission,
                    attached = true,
                    interfaces = listOf(cdcData()),
                ),
            )
        }
    }

    @Test
    fun `a granted device with no usable interface says so`() {
        assertEquals(
            UsbDeviceGate.Refusal.NO_CDC_DATA_INTERFACE,
            UsbDeviceGate.refusalFor(
                permission = UsbDeviceGate.Permission.GRANTED,
                attached = true,
                interfaces = emptyList(),
            ),
        )
    }

    @Test
    fun `a granted attached CDC device is not refused`() {
        assertNull(
            UsbDeviceGate.refusalFor(
                permission = UsbDeviceGate.Permission.GRANTED,
                attached = true,
                interfaces = listOf(cdcData()),
            ),
        )
    }

    @Test
    fun `an open port is released when the device detaches`() {
        assertTrue(UsbDeviceGate.shouldReleaseOnDetach(open = true))
        assertEquals(false, UsbDeviceGate.shouldReleaseOnDetach(open = false))
    }
}
