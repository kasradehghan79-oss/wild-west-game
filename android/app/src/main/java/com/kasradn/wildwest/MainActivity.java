package com.kasradn.wildwest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The whole app: a fullscreen WebView pointing at the game that was copied into
 * assets/www at build time.
 *
 * Design notes
 * - No AndroidX or third party dependencies, so the same source compiles with the
 *   raw SDK command line tools (see ../build-apk.ps1) or with Gradle.
 * - The game is loaded from file:///android_asset/www/index.html. It keeps
 *   settings in localStorage; domStorage is enabled for that, and the game treats
 *   storage failures as non fatal, so nothing breaks if a WebView denies it.
 * - Backgrounding the app pauses the match (the page also listens for
 *   visibilitychange) and stops the WebView's own timers so the game does not
 *   burn battery behind the launcher.
 */
public class MainActivity extends Activity {

    private static final String GAME_URL = "file:///android_asset/www/index.html";
    private static final int BACKGROUND = 0xFF0A0806;

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // a match is 60 seconds long; do not let the screen sleep mid fight
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // draw under the notch instead of letterboxing around it
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // lets you attach chrome://inspect over USB to profile the game on device
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // a long press on the canvas should not pop a context menu or start a text
        // selection over the game
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true;
            }
        });

        // Exposed before any page script runs, so the game can tell it is inside the
        // app: the touch layer hides the browser fullscreen button (the activity is
        // already immersive) and can later ask for native features.
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean isApp() {
                return true;
            }

            @JavascriptInterface
            public String platform() {
                return "android";
            }
        }, "WildWestApp");

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // the game synthesises its own audio and unlocks it on the PLAY tap; the
        // WebView must not block playback for lack of a gesture
        s.setMediaPlaybackRequiresUserGesture(false);

        // keep navigation inside the app
        web.setWebViewClient(new WebViewClient());

        setContentView(web);
        immersive();
        web.loadUrl(GAME_URL);
    }

    /** Hide the status and navigation bars, and put them back if the user swipes them in. */
    private void immersive() {
        final View decor = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        decor.setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
            @Override
            public void onSystemUiVisibilityChange(int visibility) {
                decor.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        immersive();
                    }
                }, 1500);
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            // pause the match so a phone call does not cost the round
            web.evaluateJavascript("try{ if (typeof setPaused === 'function') setPaused(true); }catch(e){}", null);
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Back should feel like "put the game away", not "quit" - the shop and rounds survive. */
    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }
}
