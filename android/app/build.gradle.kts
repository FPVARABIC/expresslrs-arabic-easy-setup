import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fpvarabic.elrs.bridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fpvarabic.elrs.bridge"
        // USB host mode is the entire point of this host, and it is an API 12
        // feature. minSdk 24 keeps the runtime-permission model uniform.
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-unverified"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
        debug {
            isMinifyEnabled = false
            // Named so an artifact can never be mistaken for a tested release.
            versionNameSuffix = "-debug"
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
