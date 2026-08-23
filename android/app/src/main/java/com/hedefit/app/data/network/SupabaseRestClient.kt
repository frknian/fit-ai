package com.hedefit.app.data.network

import com.hedefit.app.BuildConfig
import com.hedefit.app.data.auth.AuthRepository
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

class SupabaseRestClient(
    private val auth: AuthRepository,
    private val http: JsonHttpClient,
) {
    suspend fun select(table: String, query: String): JSONArray {
        val response = request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/rest/v1/$table?$query",
        ).requireSuccess("$table verileri yüklenemedi.")
        return response.jsonArray()
    }

    suspend fun insert(table: String, row: JSONObject): JSONObject {
        val response = request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/rest/v1/$table",
            method = "POST",
            extraHeaders = mapOf("Content-Type" to "application/json", "Prefer" to "return=representation"),
            body = row.toString(),
        ).requireSuccess("$table kaydı oluşturulamadı.")
        return response.jsonArray().optJSONObject(0) ?: JSONObject()
    }

    suspend fun upsert(table: String, row: JSONObject, onConflict: String): JSONObject {
        val response = request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/rest/v1/$table?on_conflict=${encode(onConflict)}",
            method = "POST",
            extraHeaders = mapOf(
                "Content-Type" to "application/json",
                "Prefer" to "resolution=merge-duplicates,return=representation",
            ),
            body = row.toString(),
        ).requireSuccess("$table kaydı güncellenemedi.")
        return response.jsonArray().optJSONObject(0) ?: JSONObject()
    }

    suspend fun update(table: String, query: String, row: JSONObject): JSONObject {
        val response = request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/rest/v1/$table?$query",
            method = "PATCH",
            extraHeaders = mapOf("Content-Type" to "application/json", "Prefer" to "return=representation"),
            body = row.toString(),
        ).requireSuccess("$table verileri güncellenemedi.")
        return response.jsonArray().optJSONObject(0) ?: JSONObject()
    }

    suspend fun delete(table: String, query: String) {
        request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/rest/v1/$table?$query",
            method = "DELETE",
            extraHeaders = mapOf("Prefer" to "return=minimal"),
        ).requireSuccess("$table kaydı silinemedi.")
    }

    private suspend fun request(
        url: String,
        method: String = "GET",
        extraHeaders: Map<String, String> = emptyMap(),
        body: String? = null,
    ): HttpResponse {
        suspend fun execute(token: String) = http.request(
            url = url,
            method = method,
            headers = mapOf(
                "apikey" to BuildConfig.SUPABASE_ANON_KEY,
                "Authorization" to "Bearer $token",
            ) + extraHeaders,
            body = body,
        )
        val first = execute(auth.validAccessToken())
        return if (first.status == 401) execute(auth.validAccessToken(forceRefresh = true)) else first
    }

    companion object {
        fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
    }
}
