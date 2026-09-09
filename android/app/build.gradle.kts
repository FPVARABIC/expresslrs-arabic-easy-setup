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

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        warningsAsErrors = true
        abortOnError = true
        // The report is uploaded by CI, so a failure is readable.
        htmlReport = true
        xmlReport = true
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}
