package com.hedefit.app.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class HttpResponse(val status: Int, val body: String, val headers: Map<String, List<String>>) {
    val isSuccessful: Boolean get() = status in 200..299
    fun jsonObject(): JSONObject = if (body.isBlank()) JSONObject() else JSONObject(body)
    fun jsonArray(): JSONArray = if (body.isBlank()) JSONArray() else JSONArray(body)
}

class ApiException(
    val status: Int,
    val responseBody: String,
    message: String,
) : Exception(message)

class JsonHttpClient {
    suspend fun request(
        url: String,
        method: String = "GET",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        timeoutMs: Int = 30_000,
    ): HttpResponse = withContext(Dispatchers.IO) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = timeoutMs
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
            if (body != null) {
                doOutput = true
                if (getRequestProperty("Content-Type") == null) setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            HttpResponse(status, responseBody, connection.headerFields.filterKeys { it != null })
        } finally {
            connection.disconnect()
        }
    }
}

fun HttpResponse.requireSuccess(defaultMessage: String): HttpResponse {
    if (isSuccessful) return this
    val message = runCatching {
        val json = JSONObject(body)
        json.optString("error_description")
            .ifBlank { json.optString("msg") }
            .ifBlank { json.optString("message") }
            .ifBlank { json.optString("error") }
    }.getOrDefault("").ifBlank { defaultMessage }
    throw ApiException(status, body, message)
}

fun JSONObject.stringOrNull(name: String): String? = optString(name).trim().takeIf { it.isNotEmpty() && it != "null" }
fun JSONObject.doubleOrNull(name: String): Double? = if (has(name) && !isNull(name)) optDouble(name).takeIf { !it.isNaN() } else null
fun JSONObject.intOrNull(name: String): Int? = if (has(name) && !isNull(name)) optInt(name) else null
