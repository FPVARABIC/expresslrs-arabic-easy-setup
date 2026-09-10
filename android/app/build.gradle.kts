import java.io.File
import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The permanent signing secrets, and why Gradle must never see them.
 *
 * This build script is *candidate code*. It is checked out from a pull request
 * along with its plugins, its dependency graph and every script any of them
 * runs. If the permanent signing key were present in the environment while
 * this ran, then anyone able to open a pull request could read it — the key
 * that Android accepts as an update to an application holding USB write
 * authority over flight hardware. No amount of care inside this file fixes
 * that, because the file is not the only thing running.
 *
 * So signing moved out. The candidate build produces an *unsigned*
 * `physicalTest` APK; a separate trusted workflow on the default branch, which
 * never checks out a candidate commit and never runs Gradle, signs that exact
 * artifact afterwards. See docs/ANDROID_SIGNING.md.
 *
 * The names below therefore have no consumer here, and this refuses to build
 * if they appear anyway. That turns "we do not pass the key to Gradle" from a
 * promise into a mechanism: a workflow edit that exposes them fails the build
 * that would have read them, rather than succeeding quietly.
 */
val PERMANENT_SIGNING_SECRETS = listOf(
    "ELRS_KEYSTORE_BASE64",
    "ELRS_KEYSTORE_PASSWORD",
    "ELRS_KEY_ALIAS",
    "ELRS_KEY_PASSWORD",
)

/**
 * A disposable keystore for the update-persistence test, and nothing else.
 *
 * Deliberately named apart from the permanent secrets so the two cannot be
 * confused or wired together by accident. The property under test there is
 * "the same key across two builds", which any key satisfies, so the job
 * generates one, uses it, and shreds it. It never leaves the runner and it
 * signs nothing a person installs.
 */
data class DisposableTestSigning(
    val storeFile: File,
    val storePassword: String,
    val keyAlias: String,
    val keyPassword: String,
)

fun resolveDisposableTestSigning(): DisposableTestSigning? {
    fun value(name: String): String? =
        (System.getenv(name) ?: providers.gradleProperty(name).orNull)?.takeIf { it.isNotBlank() }

    val path = value("ELRS_TEST_KEYSTORE_PATH") ?: return null
    val storePassword = value("ELRS_TEST_KEYSTORE_PASSWORD") ?: return null
    val keyAlias = value("ELRS_TEST_KEY_ALIAS") ?: return null
    val keyPassword = value("ELRS_TEST_KEY_PASSWORD") ?: return null
    val file = File(path)
    if (!file.isFile) return null
    return DisposableTestSigning(file, storePassword, keyAlias, keyPassword)
}

val disposableTestSigning: DisposableTestSigning? = resolveDisposableTestSigning()

android {
    namespace = "com.fpvarabic.elrs.bridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fpvarabic.elrs.bridge"
        // USB host mode is the entire point of this host, and it is an API 12
        // feature. minSdk 24 keeps the runtime-permission model uniform.
        minSdk = 24
        targetSdk = 35
        // Monotonic, supplied by CI from the workflow run number, which only
        // ever increases for a workflow. A local build gets 1, which cannot be
        // installed over a CI build and is not meant to be.
        versionCode = (System.getenv("ELRS_VERSION_CODE") ?: "1").toInt()
        // Derived from the source rather than typed: CI passes the tag or the
        // commit, so an installed build names the tree it came from.
        versionName = System.getenv("ELRS_VERSION_NAME") ?: "0.1.0-unverified"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // Only ever the disposable test key. There is no configuration here
        // for a permanent one, which is the isolation: an artifact this build
        // produces is either unsigned or signed by a key that was generated
        // minutes ago and destroyed minutes later.
        val signing = disposableTestSigning
        if (signing != null) {
            create("disposableTest") {
                storeFile = signing.storeFile
                storePassword = signing.storePassword
                keyAlias = signing.keyAlias
                keyPassword = signing.keyPassword
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        /**
         * `debug-ci`: the ephemeral channel.
         *
         * Signed with whatever debug key the runner generated, which differs on
         * every run. Good enough to prove the project compiles and to run the
         * instrumentation suite; never presented as something an operator can
         * install over a previous build, because Android will refuse it.
         */
        debug {
            isMinifyEnabled = false
            // Named so an artifact can never be mistaken for a tested release.
            versionNameSuffix = "-debug"
        }

        /**
         * `physicalTest`: the candidate channel, built **unsigned**.
         *
         * Unsigned is the correct output here, not a degraded one. This build
         * runs on pull-request code, so it must not be anywhere near the
         * permanent key; the trusted signer takes this exact APK afterwards,
         * verifies its digest against what CI recorded, and signs it without
         * ever running Gradle. An unsigned APK cannot be installed, which is
         * the honest state of an artifact nobody has vouched for yet.
         *
         * Not minified: a physical-test build that cannot be read in a stack
         * trace is worth less than the size it saves.
         */
        create("physicalTest") {
            initWith(getByName("debug"))
            isMinifyEnabled = false
            isDebuggable = false
            versionNameSuffix = "-physical-test"
            // The disposable key when the update-persistence job supplied one,
            // and otherwise nothing at all.
            signingConfig = signingConfigs.findByName("disposableTest")
            matchingFallbacks += listOf("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // A real lint error fails the build.
        abortOnError = true
        // `warningsAsErrors = true` was tried and is deliberately not used: it
        // promotes Play Store targeting nudges such as OldTargetApi into build
        // failures on a debug host that is not published to a store. That is
        // noise, not signal. The checks that actually matter for a WebView host
        // are escalated by name instead.
        error += listOf("JavascriptInterface", "AddJavascriptInterface")
        // Uploaded by CI, so a failure is readable without a local checkout.
        htmlReport = true
        xmlReport = true
        textReport = true
    }

    /**
     * Which variant `connectedAndroidTest` builds against.
     *
     * `debug` normally. The update-persistence job sets `physicalTest`, because
     * the property it proves — that a tester's data survives an update — is a
     * property of the *signed* channel and cannot be demonstrated on a channel
     * whose key changes every run.
     */
    testBuildType = System.getenv("ELRS_TEST_BUILD_TYPE") ?: "debug"

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }
}

// Top-level: the `kotlin` extension comes from the Kotlin Android plugin and is
// not part of the `android { }` block.
kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

/**
 * Copies the built web application into the APK and records what went in.
 *
 * The host serves these bytes from `https://appassets.androidplatform.net/`
 * rather than loading the deployed site, so the APK is self-contained: an
 * installed build cannot silently start running different web code than the one
 * it was tested with.
 */
val webDist = rootProject.layout.projectDirectory.dir("../apps/web/dist")

val bundleWebAssets by tasks.registering(Copy::class) {
    description = "Bundles apps/web/dist into the APK"
    from(webDist)
    into(layout.buildDirectory.dir("generated/webAssets/web"))
    // A build with no web assets would produce a host that shows nothing, and
    // would be far more confusing than a build that refuses.
    doFirst {
        val source = webDist.asFile
        require(source.isDirectory && (source.listFiles()?.isNotEmpty() == true)) {
            "apps/web/dist is empty. Run `pnpm build` before assembling the APK: " +
                "the Android host bundles the web application rather than fetching it."
        }
    }
}

/**
 * Writes the identities an installed APK can be traced back to.
 *
 * `web` is a digest over every bundled web file, so it changes when the web
 * application changes. `native` is a digest over this host's own sources —
 * Kotlin, the manifest, and the JavaScript shim that is injected into the
 * WebView, which is native-host code even though it is written in JavaScript.
 * Both are surfaced in the diagnostics screen and reported by CI.
 */
val writeSourceIdentity by tasks.registering {
    description = "Records the embedded web and native source digests"
    val outputDir = layout.buildDirectory.dir("generated/identity")
    val nativeSourceDir = layout.projectDirectory.dir("src/main")
    outputs.dir(outputDir)
    doLast {
        fun digestOf(root: java.io.File, filter: (java.io.File) -> Boolean): String {
            val digest = MessageDigest.getInstance("SHA-256")
            root.walkTopDown()
                .filter { it.isFile && filter(it) }
                .sortedBy { it.relativeTo(root).invariantSeparatorsPath }
                .forEach { file ->
                    digest.update(file.relativeTo(root).invariantSeparatorsPath.toByteArray())
                    digest.update(0)
                    digest.update(file.readBytes())
                    digest.update(0)
                }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
        val web = webDist.asFile.let { if (it.isDirectory) digestOf(it) { true } else "absent" }
        val native = digestOf(nativeSourceDir.asFile) { file ->
            file.extension in setOf("kt", "xml", "js")
        }
        val file = outputDir.get().file("source-identity.json").asFile
        file.parentFile.mkdirs()
        file.writeText(
            """{"schemaVersion":1,"webBuildSha256":"$web","nativeSourceSha256":"$native"}""",
        )
        logger.lifecycle("embedded web build   sha256 $web")
        logger.lifecycle("embedded native src  sha256 $native")
    }
}

tasks.named("preBuild") {
    dependsOn(bundleWebAssets, writeSourceIdentity)
}

/**
 * Fails the physical-test channel closed when its signing inputs are absent.
 *
 * Without this, AGP produces an *unsigned* APK for a build type whose
 * signingConfig could not be created — a build that looks successful and
 * installs nowhere — or, worse, a future edit re-points it at the debug key and
 * nothing complains. A release candidate that is not signed by the one stable
 * key is not a release candidate, so it is refused by name.
 *
 * Attached to the package task rather than checked at configuration time so
 * that `assembleDebug`, lint and the unit tests keep working on a machine with
 * no secrets at all, which is every contributor's machine.
 */
/**
 * Refuses to build at all if a permanent signing secret is in the environment.
 *
 * This is the enforcement behind the comment at the top of the file. It is
 * attached to every task rather than to packaging, because the leak that
 * matters is any candidate code reading the environment — a plugin, a
 * dependency's build hook, a `doLast` someone adds — not specifically the step
 * that writes an APK. Failing loudly here is strictly better than a build that
 * succeeds while the key was readable.
 *
 * Checked at execution time so that a machine which happens to have these set
 * for unrelated reasons still gets a clear message rather than a configuration
 * crash.
 */
val leakedSigningSecrets: List<String> =
    PERMANENT_SIGNING_SECRETS.filter { !System.getenv(it).isNullOrBlank() }

tasks.configureEach {
    doFirst {
        if (leakedSigningSecrets.isNotEmpty()) {
            throw GradleException(
                "Refusing to run Gradle with permanent signing secrets in the environment: " +
                    leakedSigningSecrets.joinToString(", ") + ". This build script runs " +
                    "candidate code from pull requests, so anything it can read, a pull " +
                    "request can read. The candidate build produces an unsigned physicalTest " +
                    "APK and the trusted signer workflow signs it afterwards without running " +
                    "Gradle. See docs/ANDROID_SIGNING.md. For the update-persistence test, " +
                    "use the disposable ELRS_TEST_KEYSTORE_* variables instead.",
            )
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    // WebViewAssetLoader and the origin-restricted WebMessageListener bridge.
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
