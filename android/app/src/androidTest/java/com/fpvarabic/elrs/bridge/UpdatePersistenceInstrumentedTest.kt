package com.fpvarabic.elrs.bridge

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * That installing a new candidate does not throw away the tester's work.
 *
 * The two halves of this run against **two separately installed APKs**: [seed]
 * under candidate A, then [verifySurvived] under candidate B, installed over
 * the top with `adb install -r`. Nothing in a single test run can demonstrate
 * that, which is why the job drives one method at a time and why both are
 * marked [PersistenceStage] and excluded from the ordinary suite.
 *
 * What it protects is concrete. A tester partway through the 25 physical rows
 * has an acceptance record in progress, a language they chose, and possibly a
 * recovery checkpoint from an interrupted firmware write. Before this, every
 * candidate was signed with a different ephemeral key, so an update was
 * impossible and the only way to install the next one was to uninstall — which
 * erased all three. The `physical-test` channel exists to make the update work;
 * this is the test that says it actually does.
 */
@RunWith(AndroidJUnit4::class)
class UpdatePersistenceInstrumentedTest {

    @Test
    @PersistenceStage
    fun seed() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()

            // Real keys, not invented ones: the acceptance recorder's own
            // storage key and the locale preference the shell reads on mount.
            // A synthetic marker sits alongside them so that a failure can be
            // told apart from the app simply never having written anything.
            val written = scenario.awaitValue(
                """
                (function () {
                  try {
                    localStorage.setItem('$LOCALE_KEY', 'en');
                    localStorage.setItem('$ACCEPTANCE_KEY', '$ACCEPTANCE_VALUE');
                    localStorage.setItem('$MARKER_KEY', '$MARKER_VALUE');
                    return 'stored';
                  } catch (error) {
                    return 'failed: ' + String(error);
                  }
                })();
                """.trimIndent(),
            )
            assertEquals("\"stored\"", written)

            // A simulated recovery checkpoint, in the shape and the place the
            // application's own journal uses. Written straight to IndexedDB
            // because the alternative is bricking a real device to get one.
            scenario.evaluate(seedCheckpointScript())
            assertEquals(
                "the checkpoint must be readable before the update",
                "\"$CHECKPOINT_TARGET\"",
                scenario.awaitValue("window.__checkpointTargetId"),
            )
        }
    }

    @Test
    @PersistenceStage
    fun verifySurvived() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()

            assertEquals(
                "the acceptance record must survive the update",
                "\"$ACCEPTANCE_VALUE\"",
                scenario.awaitValue("localStorage.getItem('$ACCEPTANCE_KEY')"),
            )
            assertEquals(
                "the persistent marker must survive the update",
                "\"$MARKER_VALUE\"",
                scenario.awaitValue("localStorage.getItem('$MARKER_KEY')"),
            )
            assertEquals(
                "the chosen language must survive the update",
                "\"en\"",
                scenario.awaitValue("localStorage.getItem('$LOCALE_KEY')"),
            )
            // And it must have taken effect, not merely still be stored: the
            // document renders in the language the operator chose before the
            // update, without them choosing it again.
            assertEquals(
                "the application must open in the remembered language",
                "\"en\"",
                scenario.awaitValue("document.documentElement.lang"),
            )

            scenario.evaluate(readCheckpointScript())
            assertEquals(
                "the recovery checkpoint must survive the update",
                "\"$CHECKPOINT_TARGET\"",
                scenario.awaitValue("window.__checkpointTargetId"),
            )
            assertEquals(
                "the checkpoint's stage must be intact, not merely present",
                "\"RECOVERY_REQUIRED\"",
                scenario.awaitValue("window.__checkpointStage"),
            )
        }
    }

    // ---- helpers ---------------------------------------------------------

    private fun seedCheckpointScript(): String =
        """
        window.__checkpointTargetId = null;
        (function () {
          var request = indexedDB.open('$RECOVERY_DB', 1);
          request.onupgradeneeded = function () {
            var database = request.result;
            if (!database.objectStoreNames.contains('$RECOVERY_STORE')) {
              database.createObjectStore('$RECOVERY_STORE');
            }
          };
          request.onsuccess = function () {
            var database = request.result;
            var transaction = database.transaction('$RECOVERY_STORE', 'readwrite');
            transaction.objectStore('$RECOVERY_STORE').put({
              schemaVersion: 1,
              targetId: '$CHECKPOINT_TARGET',
              productName: 'Vendor TX Module',
              packageSha256: '$CHECKPOINT_DIGEST',
              stage: 'RECOVERY_REQUIRED',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              safeError: null
            }, '$RECOVERY_KEY');
            transaction.oncomplete = function () {
              database.close();
              window.__checkpointTargetId = '$CHECKPOINT_TARGET';
            };
          };
        })();
        """.trimIndent()

    private fun readCheckpointScript(): String =
        """
        window.__checkpointTargetId = null;
        window.__checkpointStage = null;
        (function () {
          var request = indexedDB.open('$RECOVERY_DB', 1);
          // If the update wiped the database, `onupgradeneeded` fires and there
          // is nothing to read — which is exactly the failure this looks for.
          request.onsuccess = function () {
            var database = request.result;
            if (!database.objectStoreNames.contains('$RECOVERY_STORE')) {
              window.__checkpointTargetId = 'store-missing';
              window.__checkpointStage = 'store-missing';
              database.close();
              return;
            }
            var read = database.transaction('$RECOVERY_STORE', 'readonly')
              .objectStore('$RECOVERY_STORE')
              .get('$RECOVERY_KEY');
            read.onsuccess = function () {
              var value = read.result;
              window.__checkpointTargetId = value ? value.targetId : 'absent';
              window.__checkpointStage = value ? value.stage : 'absent';
              database.close();
            };
            read.onerror = function () {
              window.__checkpointTargetId = 'read-failed';
              window.__checkpointStage = 'read-failed';
              database.close();
            };
          };
        })();
        """.trimIndent()

    /**
     * Waits for the application to mount, so the shell has read the stored
     * language before anything is asserted about it.
     */
    private fun ActivityScenario<MainActivity>.awaitApplication() {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            if (evaluate("document.querySelectorAll('button').length").toIntOrNull()
                ?.let { it > 0 } == true
            ) {
                return
            }
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError(
            "the packaged application never rendered" +
                " | location=${evaluate("window.location.href")}" +
                " | readyState=${evaluate("document.readyState")}" +
                " | lang=${evaluate("document.documentElement.lang")}",
        )
    }

    /** Polls an expression until it stops being null, then returns it. */
    private fun ActivityScenario<MainActivity>.awaitValue(expression: String): String {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        var last = "null"
        while (System.currentTimeMillis() < deadline) {
            last = evaluate(expression)
            if (last != "null") return last
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError(
            "$expression stayed null for ${AWAIT_SECONDS}s" +
                " | lang=${evaluate("document.documentElement.lang")}" +
                " | keys=${evaluate("Object.keys(localStorage).join(',')")}",
        )
    }

    private fun ActivityScenario<MainActivity>.evaluate(script: String): String {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String?>(null)
        onActivity { activity ->
            activity.hostWebView.evaluateJavascript(script) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("the script never returned", latch.await(AWAIT_SECONDS, TimeUnit.SECONDS))
        return result.get() ?: "null"
    }

    private companion object {
        const val AWAIT_SECONDS = 30L
        const val POLL_MILLIS = 100L

        // The application's own keys. If any of these are renamed, this test
        // stops proving anything, which is why they are named rather than
        // discovered.
        const val LOCALE_KEY = "elrs-easy:locale:v1"
        const val ACCEPTANCE_KEY = "elrs-easy:physical-acceptance:v1"
        const val RECOVERY_DB = "elrs-easy-hardware-recovery-v1"
        const val RECOVERY_STORE = "checkpoint"
        const val RECOVERY_KEY = "active"

        const val MARKER_KEY = "elrs-easy:update-persistence-marker"
        const val MARKER_VALUE = "seeded-under-candidate-a"
        const val ACCEPTANCE_VALUE = "{\"schemaVersion\":1,\"rows\":[]}"
        const val CHECKPOINT_TARGET = "vendor/tx_2400/module"
        const val CHECKPOINT_DIGEST =
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    }
}
