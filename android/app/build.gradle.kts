plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun readRootEnv(): Map<String, String> {
    val file = rootDir.parentFile.resolve(".env")
    if (!file.isFile) return emptyMap()
    return file.readLines().mapNotNull { line ->
        val clean = line.trim()
        if (clean.isEmpty() || clean.startsWith("#") || !clean.contains('=')) return@mapNotNull null
        val key = clean.substringBefore('=').trim()
        val value = clean.substringAfter('=').trim().removeSurrounding("\"").removeSurrounding("'")
        key to value
    }.toMap()
}

val rootEnv = readRootEnv()
fun appConfig(name: String, fallback: String = ""): String =
    providers.gradleProperty(name).orNull
        ?: providers.environmentVariable(name).orNull
        ?: rootEnv[name]
        ?: fallback

fun quoted(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "com.hedefit.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hedefit.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true

        buildConfigField("String", "API_BASE_URL", quoted(appConfig("HEDEFIT_API_BASE_URL", "https://hedefit.frknian.workers.dev")))
        buildConfigField("String", "SUPABASE_URL", quoted(appConfig("NEXT_PUBLIC_SUPABASE_URL")))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(appConfig("NEXT_PUBLIC_SUPABASE_ANON_KEY")))
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            quoted(appConfig(
                "GOOGLE_WEB_CLIENT_ID",
                appConfig(
                    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
                    "755194872819-ouv943k16kr9rd5jpv6bdtgcnjv2mcr7.apps.googleusercontent.com",
                ),
            )),
        )
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.09.00"))
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("androidx.credentials:credentials:1.7.0-alpha02")
    implementation("androidx.credentials:credentials-play-services-auth:1.7.0-alpha02")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.09.00"))
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
