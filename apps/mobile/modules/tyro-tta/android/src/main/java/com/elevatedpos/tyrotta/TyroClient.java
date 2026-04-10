package com.elevatedpos.tyrotta;

import android.annotation.SuppressLint;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Host-side wrapper around the Tyro iClient JavaScript SDK.
 *
 * The WebView loads a local HTML asset ({@code tyro-bridge.html}) that
 * pulls in {@code iclient-v1.js} from the appropriate Tyro environment
 * and exposes a small {@code window.tyroBridge} object the Java side can
 * drive via {@link WebView#evaluateJavascript(String, ValueCallback)}.
 *
 * All transaction callbacks (status / question / receipt / complete /
 * pairing) are routed back to Java via {@link #Android} (the bound
 * {@link JavascriptInterface}) and fan out to a single
 * {@link TyroEventListener}. That listener is implemented by
 * {@code TyroTTAModule} which fans out again to JavaScript as Expo
 * module events.
 */
public class TyroClient {

    private static final String BRIDGE_URL = "file:///android_asset/tyro-bridge.html";

    private final WebView webView;
    private final IclientSource source;
    private final TyroEventListener listener;

    private String apiKey;
    private PosProductData posProductData;
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
     * Initialise the Tyro iClient. Loads the HTML bridge (if not already
     * loaded) then calls {@code tyroBridge.init(...)} to create the
     * {@code TYRO.IClient} instance. Callers should wait for the
     * {@code onReady} event via {@link TyroEventListener#onReady()}
     * before issuing transactions.
     */
    public void init(String apiKey, PosProductData posProductData) {
        this.apiKey = apiKey;
        this.posProductData = posProductData;

        final String scriptUrl = source.getUrl() + "/iclient-v1.js";
        final String initJs = String.format(
                "window.tyroBridge && window.tyroBridge.init(%s,%s,%s,%s,%s);",
                jsString(apiKey),
                jsString(posProductData.getPosProductVendor()),
                jsString(posProductData.getPosProductName()),
                jsString(posProductData.getPosProductVersion()),
                jsString(scriptUrl)
        );

        // If the bridge script hasn't loaded yet, stash the init call
        // and run it from onScriptLoaded.
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

    public void submitAnswer(String answer) {
        evalJs(String.format("window.tyroBridge.submitAnswer(%s);", jsString(answer)));
    }

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
        // Fire any queued init call.
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
    public void onStatusMessage(String json) {
        if (listener == null) return;
        try {
            JSONObject o = new JSONObject(json);
            listener.onStatusMessage(o.optString("tag"), o.optString("message"));
        } catch (JSONException e) {
            listener.onStatusMessage("", json);
        }
    }

    @JavascriptInterface
    public void onQuestion(String json) {
        if (listener == null) return;
        listener.onQuestion(json);
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
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setAllowFileAccess(true);
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
