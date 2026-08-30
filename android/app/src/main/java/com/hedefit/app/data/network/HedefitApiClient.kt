package com.hedefit.app.data.network

import com.hedefit.app.BuildConfig
import com.hedefit.app.data.auth.AuthRepository
import org.json.JSONObject

class HedefitApiClient(
    private val auth: AuthRepository,
    private val http: JsonHttpClient,
) {
    suspend fun get(path: String): HttpResponse = request(path, "GET", null)
    suspend fun post(path: String, body: JSONObject): HttpResponse = request(path, "POST", body.toString())
    suspend fun patch(path: String, body: JSONObject): HttpResponse = request(path, "PATCH", body.toString())
    suspend fun delete(path: String): HttpResponse = request(path, "DELETE", null)

    private suspend fun request(path: String, method: String, body: String?): HttpResponse {
        fun url() = "${BuildConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}"
        suspend fun execute(token: String) = http.request(
            url = url(),
            method = method,
            headers = mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json"),
            body = body,
            timeoutMs = when {
                path.contains("generate-plan") -> 75_000
                path.contains("/api/nutrition/parse-text") -> 50_000
                path.contains("/api/nutrition/analyze-photo") -> 70_000
                path.contains("/api/chat") -> 30_000
                else -> 40_000
            },
        )
        val first = execute(auth.validAccessToken())
        if (first.status == 401) return execute(auth.validAccessToken(forceRefresh = true))
        return first
    }
}
