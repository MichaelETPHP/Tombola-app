package com.tombola.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ (targetSdk 35+) enforces edge-to-edge display
        // regardless of app config — without explicitly opting the Activity
        // in here too, the WebView's env(safe-area-inset-*) CSS values can
        // report stale/zero on first paint, letting content (the header)
        // render under the status bar intermittently instead of respecting
        // .safe-area-top consistently.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WebView webView = this.bridge.getWebView();

        // The viewport meta tag's user-scalable=no isn't always honored
        // reliably by Android WebView — lock pinch/double-tap zoom out at
        // the WebSettings level too, so it's actually impossible, not just
        // discouraged.
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // env(safe-area-inset-*) is computed entirely inside Chromium's
        // own WebView engine, and that computation has proven unreliable on
        // some manufacturer Android skins (reported on Samsung One UI) —
        // it can under-report or lag the status and navigation bars. That
        // lets the header or bottom navigation render underneath Android's
        // own controls. Read both insets from Android's WindowInsets API and
        // hand them to the page as CSS custom properties; app.css takes the
        // max() of the native and Chromium values on each device.
        //
        // WindowInsets callbacks fire on the Activity's own view-layout
        // timeline, not on WebView page-load events — the very first
        // dispatch typically lands before Capacitor has finished navigating
        // the WebView from its initial blank document to the real app
        // content. A property set on that blank document is discarded the
        // moment navigation completes, so the CSS variable never actually
        // reaches the loaded page unless something re-applies it afterward.
        // Re-requesting insets a few times after startup, once the real
        // content has almost certainly loaded, closes that gap without
        // touching Capacitor's own WebViewClient.
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets mandatoryGestures = insets.getInsets(
                WindowInsetsCompat.Type.mandatorySystemGestures()
            );
            float density = getResources().getDisplayMetrics().density;
            float topDp = statusBars.top / density;
            float bottomDp = Math.max(navigationBars.bottom, mandatoryGestures.bottom) / density;
            webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--native-safe-area-top','" + topDp + "px');" +
                "document.documentElement.style.setProperty('--native-safe-area-bottom','" + bottomDp + "px')",
                null
            );
            return insets;
        });

        int[] reapplyDelaysMs = { 50, 200, 500, 1200 };
        for (int delay : reapplyDelaysMs) {
            webView.postDelayed(() -> ViewCompat.requestApplyInsets(webView), delay);
        }
    }
}
