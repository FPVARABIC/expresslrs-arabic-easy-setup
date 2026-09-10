import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The stable signing identity for physical-test and release-candidate builds.
 *
 * Read from the environment, never from a file in this repository. A keystore
 * committed here would let anyone build an APK that Android accepts as an
 * update to this one, and for an application with USB write authority over
 * flight hardware that costs far more than it saves. CI materialises the
 * keystore from a protected secret into the runner's temporary directory and
 * deletes it afterwards; see docs/ANDROID_SIGNING.md.
 *
 * Null when any part is absent, which is what makes the build fail closed
 * rather than quietly fall back to a debug key.
 */
data class PhysicalTestSigning(
    val storeFile: java.io.File,
    val storePassword: String,
    val keyAlias: String,
    val keyPassword: String,
)

fun physicalTestSigning(): PhysicalTestSigning? {
    fun value(name: String): String? =
        (System.getenv(name) ?: providers.gradleProperty(name).orNull)?.takeIf { it.isNotBlank() }

    val path = value("ELRS_KEYSTORE_PATH") ?: return null
    val storePassword = value("ELRS_KEYSTORE_PASSWORD") ?: return null
    val keyAlias = value("ELRS_KEY_ALIAS") ?: return null
    val keyPassword = value("ELRS_KEY_PASSWORD") ?: return null
    val file = java.io.File(path)
    if (!file.isFile) return null
    return PhysicalTestSigning(file, storePassword, keyAlias, keyPassword)
}

val physicalTestSigning: PhysicalTestSigning? = physicalTestSigning()

/**
 * The certificate the physical-test channel is expected to be signed by.
 *
 * A public fingerprint, so it is committed rather than kept secret — and
 * committing it is the point: it is the independent record that makes a swapped
 * or wrong keystore a build failure instead of a silently different APK. The
 * keystore itself is never here. Blank until the first keystore exists.
 */
val expectedSigningCertificate: String =
    rootProject.layout.projectDirectory.file("signing/physical-test-certificate.sha256")
        .asFile
        .let { if (it.isFile) it.readText().trim().lowercase() else "" }

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
        if (physicalTestSigning != null) {
            create("physicalTest") {
                storeFile = physicalTestSigning.storeFile
                storePassword = physicalTestSigning.storePassword
                keyAlias = physicalTestSigning.keyAlias
                keyPassword = physicalTestSigning.keyPassword
                // Both schemes: v1 for API 24 installs, v2 for everything
                // after, so one APK covers the whole supported range.
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    sourceSets {
        getByName("main") {
            // The web application is bundled, not fetched. See MainActivity.
            // Two directories, not one: Gradle refuses to reason about two
            // tasks writing into the same output tree.
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
            assets.srcDir(layout.buildDirectory.dir("generated/identity"))
        }
    }

    buildFeatures {
        // AGP 8 does not generate BuildConfig by default, and the host reads
        // BuildConfig.DEBUG to decide whether WebView debugging is allowed.
        buildConfig = true
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
         * `physicalTest`: the release-candidate channel.
         *
         * Signed with the one stable keystore, supplied only through protected
         * secrets, so successive candidates install over one another and a
         * tester's data and durable recovery state survive an update. Not
         * minified: a physical-test build that cannot be read in a stack trace
         * is worth less than the size it saves.
         */
        create("physicalTest") {
            initWith(getByName("debug"))
            isMinifyEnabled = false
            isDebuggable = false
            versionNameSuffix = "-physical-test"
            signingConfig = signingConfigs.findByName("physicalTest")
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
tasks.configureEach {
    if (!name.startsWith("packagePhysicalTest")) return@configureEach
    doFirst {
        if (physicalTestSigning == null) {
            throw GradleException(
                "The physical-test channel has no signing keystore. It will not fall back to " +
                    "the debug key: a candidate signed by an ephemeral key cannot be installed " +
                    "over the previous one, so a tester would lose their data and their durable " +
                    "recovery state on every update. Set ELRS_KEYSTORE_PATH, " +
                    "ELRS_KEYSTORE_PASSWORD, ELRS_KEY_ALIAS and ELRS_KEY_PASSWORD. " +
                    "See docs/ANDROID_SIGNING.md for how to create the keystore and add the " +
                    "four repository secrets.",
            )
        }
        if (expectedSigningCertificate.isEmpty()) {
            // Not fatal, because the fingerprint can only be read from a
            // keystore that exists — this is the one-time bootstrap. CI still
            // refuses to publish a candidate whose certificate nobody recorded.
            logger.warn(
                "signing/physical-test-certificate.sha256 is absent, so this build's certificate " +
                    "will not be checked against a recorded expectation. Record it before " +
                    "publishing a candidate.",
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
