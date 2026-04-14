package com.elevatedpos.tyrotta;

import android.annotation.SuppressLint;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Host-side wrapper around the Tyro iClient JavaScript SDK (headful mode).
 *
 * The WebView loads {@code tyro-bridge.html} which pulls in
 * {@code iclient-v1.js} from the Tyro environment and creates a
 * {@code TYRO.IClientWithUI} instance. Tyro renders its own modal
 * iframe inside the WebView — the POS app does not need to provide any
 * transaction UI.
 *
 * Native → JS: {@link WebView#evaluateJavascript(String, ValueCallback)}
 * JS → Native: the {@code Android} {@link JavascriptInterface} bound below
 *
 * The {@link TyroTTAModule} is responsible for making the WebView
 * visible (fullscreen overlay) before a transaction starts and hiding it
 * after {@code onTransactionComplete} fires.
 */
public class TyroClient {

    private static final String BRIDGE_URL = "file:///android_asset/tyro-bridge.html";

    private final WebView webView;
    private final IclientSource source;
    private final TyroEventListener listener;

    private String apiKey;
    private PosProductData posProductData;
    private String siteReference;
    private boolean scriptReady = false;
    private boolean clientReady = false;
    private String pendingInitJs = null;

    public TyroClient(WebView webView, IclientSource source, TyroEventListener listener) {
        this.webView = webView;
        this.source = source;
        this.listener = listener;
        initialiseWebView(webView);
    }

    public boolean isInitialized() {
        return clientReady;
    }

    /**
     * Initialise Tyro IClientWithUI. Loads the bridge page then calls
     * {@code tyroBridge.init(...)}. Wait for {@code onReady} before
     * issuing transactions.
     */
    public void init(String apiKey, PosProductData posProductData, String siteReference) {
        this.apiKey = apiKey;
        this.posProductData = posProductData;
        this.siteReference = siteReference != null ? siteReference : "";

        final String scriptUrl = source.getUrl() + "/iclient-v1.js";
        final String initJs = String.format(
                "window.tyroBridge && window.tyroBridge.init(%s,%s,%s,%s,%s,%s);",
                jsString(apiKey),
                jsString(posProductData.getPosProductVendor()),
                jsString(posProductData.getPosProductName()),
                jsString(posProductData.getPosProductVersion()),
                jsString(this.siteReference),
                jsString(scriptUrl)
        );

        if (!scriptReady) {
            this.pendingInitJs = initJs;
            webView.loadUrl(BRIDGE_URL);
        } else {
            evalJs(initJs);
        }
    }

    /* ---------------------------------------------------------- */
    /* Public operations (Java -> JS)                              */
    /* ---------------------------------------------------------- */

    public void pair(String mid, String tid) {
        evalJs(String.format("window.tyroBridge.pair(%s,%s);", jsString(mid), jsString(tid)));
    }

    public void purchase(String amountCents, String cashoutCents, boolean integratedReceipt, boolean enableSurcharge, String transactionId) {
        evalJs(String.format(
                "window.tyroBridge.purchase(%s,%s,%s,%s,%s);",
                jsString(amountCents),
                jsString(cashoutCents == null ? "" : cashoutCents),
                integratedReceipt ? "true" : "false",
                enableSurcharge ? "true" : "false",
                jsString(transactionId == null ? "" : transactionId)
        ));
    }

    public void refund(String amountCents, boolean integratedReceipt, String transactionId) {
        evalJs(String.format(
                "window.tyroBridge.refund(%s,%s,%s);",
                jsString(amountCents),
                integratedReceipt ? "true" : "false",
                jsString(transactionId == null ? "" : transactionId)
        ));
    }

    /**
     * Emergency cancel — in headful mode Tyro's iframe provides its own
     * cancel button. Only call this if the WebView is stuck.
     */
    public void cancel() {
        evalJs("window.tyroBridge.cancel();");
    }

    public void openTab(String amountCents, boolean integratedReceipt) {
        evalJs(String.format(
                "window.tyroBridge.openTab(%s,%s);",
                jsString(amountCents),
                integratedReceipt ? "true" : "false"
        ));
    }

    public void closeTab(String completionReference, String amountCents) {
        evalJs(String.format(
                "window.tyroBridge.closeTab(%s,%s);",
                jsString(completionReference),
                jsString(amountCents)
        ));
    }

    public void openPreAuth(String amountCents, boolean integratedReceipt) {
        evalJs(String.format(
                "window.tyroBridge.openPreAuth(%s,%s);",
                jsString(amountCents),
                integratedReceipt ? "true" : "false"
        ));
    }

    public void incrementPreAuth(String completionReference, String amountCents, boolean integratedReceipt) {
        evalJs(String.format(
                "window.tyroBridge.incrementPreAuth(%s,%s,%s);",
                jsString(completionReference),
                jsString(amountCents),
                integratedReceipt ? "true" : "false"
        ));
    }

    public void completePreAuth(String completionReference, String amountCents, boolean integratedReceipt) {
        evalJs(String.format(
                "window.tyroBridge.completePreAuth(%s,%s,%s);",
                jsString(completionReference),
                jsString(amountCents),
                integratedReceipt ? "true" : "false"
        ));
    }

    public void voidPreAuth(String completionReference, boolean integratedReceipt) {
        evalJs(String.format(
                "window.tyroBridge.voidPreAuth(%s,%s);",
                jsString(completionReference),
                integratedReceipt ? "true" : "false"
        ));
    }

    public void addTip(String completionReference, String tipCents) {
        evalJs(String.format(
                "window.tyroBridge.addTip(%s,%s);",
                jsString(completionReference),
                jsString(tipCents)
        ));
    }

    public void manualSettlement() {
        evalJs("window.tyroBridge.manualSettlement();");
    }

    public void reconciliationReport(String reportType, String date) {
        evalJs(String.format(
                "window.tyroBridge.reconciliationReport(%s,%s);",
                jsString(reportType == null ? "" : reportType),
                jsString(date == null ? "" : date)
        ));
    }

    public void getConfiguration() {
        evalJs("window.tyroBridge.getConfiguration();");
    }

    /* ---------------------------------------------------------- */
    /* JavaScript interface (JS -> Java)                           */
    /* ---------------------------------------------------------- */

    @JavascriptInterface
    public void onScriptLoaded(String json) {
        scriptReady = true;
        if (pendingInitJs != null) {
            final String toRun = pendingInitJs;
            pendingInitJs = null;
            webView.post(() -> webView.evaluateJavascript(toRun, null));
        }
    }

    @JavascriptInterface
    public void onReady(String json) {
        clientReady = true;
        if (listener != null) listener.onReady();
    }

    @JavascriptInterface
    public void onInitError(String json) {
        clientReady = false;
        if (listener != null) listener.onInitError(parseMessage(json));
    }

    @JavascriptInterface
    public void onReceipt(String json) {
        if (listener == null) return;
        listener.onReceipt(json);
    }

    @JavascriptInterface
    public void onTransactionComplete(String json) {
        if (listener == null) return;
        listener.onTransactionComplete(json);
    }

    @JavascriptInterface
    public void onResponse(String json) {
        if (listener == null) return;
        listener.onResponse(json);
    }

    @JavascriptInterface
    public void onPairingStatus(String json) {
        if (listener == null) return;
        listener.onPairingStatus(json);
    }

    @JavascriptInterface
    public void log(String message) {
        if (listener != null) listener.onLog(message);
    }

    /* ---------------------------------------------------------- */
    /* Internals                                                   */
    /* ---------------------------------------------------------- */

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void initialiseWebView(WebView webView) {
        webView.addJavascriptInterface(this, "Android");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(true);
        // Tyro's iframe loads from https://iclient.tyro.com. Allow the
        // file:// host page to make cross-origin XHR/fetch if needed.
        settings.setAllowUniversalAccessFromFileURLs(false);
        // Required for Tyro's iframe to open popup windows (e.g. iOS-style
        // prompts rendered as child windows on some SDK versions).
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        // Mixed-content: the host page is file:// but the iframe is https://.
        // ALWAYS_ALLOW avoids grey-iframe issues on older Android builds.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Accept third-party cookies so the Tyro iframe can read its session
        // cookies on Android < 12 (Android 12+ uses the headless pairing
        // path which does not rely on third-party cookies).
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        // Hardware layer for smooth Tyro UI rendering.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
    }

    private void evalJs(final String js) {
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /** Escape a string for safe embedding in a JS expression. */
    private static String jsString(String s) {
        if (s == null) return "''";
        StringBuilder b = new StringBuilder(s.length() + 16);
        b.append('\'');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': b.append("\\\\"); break;
                case '\'': b.append("\\'"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\u2028': b.append("\\u2028"); break;
                case '\u2029': b.append("\\u2029"); break;
                default: b.append(c);
            }
        }
        b.append('\'');
        return b.toString();
    }

    private static String parseMessage(String json) {
        try {
            return new JSONObject(json).optString("message", json);
        } catch (JSONException e) {
            return json;
        }
    }
}
