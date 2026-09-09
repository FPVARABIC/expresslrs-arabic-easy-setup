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

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    testImplementation("junit:junit:4.13.2")
}
