package com.hedefit.app.ui.components

import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.animation.Crossfade
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.hedefit.app.BuildConfig
import com.hedefit.app.ui.theme.HedefitColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.URL
import java.io.ByteArrayInputStream

private object ExerciseImageCache {
    private val cache = object : LruCache<String, Bitmap>(16 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount / 1024
    }
    fun get(key: String) = cache.get(key)
    fun put(key: String, value: Bitmap) = cache.put(key, value)
}

private fun sampledBitmap(address: String, maxDimension: Int): Bitmap? {
    val cacheKey = "$address@$maxDimension"
    ExerciseImageCache.get(cacheKey)?.let { return it }
    val connection = URL(address).openConnection().apply { connectTimeout = 6_000; readTimeout = 8_000 }
    val bytes = connection.getInputStream().use { it.readBytes() }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (bounds.outWidth / sample > maxDimension || bounds.outHeight / sample > maxDimension) sample *= 2
    return BitmapFactory.decodeStream(ByteArrayInputStream(bytes), null, BitmapFactory.Options().apply { inSampleSize = sample })?.also { ExerciseImageCache.put(cacheKey, it) }
}

@Composable
fun ExerciseMedia(path: String?, description: String, modifier: Modifier = Modifier, maxDimension: Int = 256) {
    val fullUrl = path?.takeIf(String::isNotBlank)?.let { if (it.startsWith("http")) it else "${BuildConfig.API_BASE_URL.trimEnd('/')}/${it.trimStart('/')}" }
    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, fullUrl) {
        value = fullUrl?.let { address -> withContext(Dispatchers.IO) { runCatching { sampledBitmap(address, maxDimension)?.asImageBitmap() }.getOrNull() } }
    }
    Box(modifier.background(HedefitColors.SurfaceHigh), contentAlignment = Alignment.Center) {
        bitmap?.let { Image(it, description, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            ?: Icon(Icons.Default.FitnessCenter, description, tint = HedefitColors.Lime)
    }
}

@Composable
fun ExerciseMotionPlayer(paths: List<String>, description: String, modifier: Modifier = Modifier) {
    val urls = remember(paths) { paths.filter(String::isNotBlank).take(2).map { if (it.startsWith("http")) it else "${BuildConfig.API_BASE_URL.trimEnd('/')}/${it.trimStart('/')}" } }
    val frames by produceState<List<ImageBitmap>>(emptyList(), urls) {
        value = withContext(Dispatchers.IO) { urls.mapNotNull { address -> runCatching { sampledBitmap(address, 768)?.asImageBitmap() }.getOrNull() } }
    }
    var playing by remember { mutableStateOf(true) }
    var frameIndex by remember { mutableStateOf(0) }
    LaunchedEffect(frames.size, playing) {
        while (playing && frames.size > 1) {
            delay(850)
            frameIndex = (frameIndex + 1) % frames.size
        }
    }
    Box(modifier.background(HedefitColors.SurfaceHigh), contentAlignment = Alignment.Center) {
        if (frames.isEmpty()) Icon(Icons.Default.FitnessCenter, description, tint = HedefitColors.Lime)
        else Crossfade(targetState = frameIndex.coerceAtMost(frames.lastIndex), label = "exercise-motion") { index ->
            Image(frames[index], "$description hareket gösterimi", Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
        }
        if (frames.size > 1) {
            IconButton(
                onClick = { playing = !playing },
                modifier = Modifier.align(Alignment.BottomEnd).size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = .68f)),
            ) { Icon(if (playing) Icons.Default.Pause else Icons.Default.PlayArrow, if (playing) "Animasyonu duraklat" else "Animasyonu oynat", tint = HedefitColors.Lime) }
        }
    }
}
