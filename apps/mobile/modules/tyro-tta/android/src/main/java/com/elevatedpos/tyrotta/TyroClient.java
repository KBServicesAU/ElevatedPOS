package com.elevatedpos.tyrotta;

import android.annotation.SuppressLint;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static java.lang.String.format;

public class TyroClient {

    private final WebView webView;
    private final String apiKey;
    private final PosProductData posProductData;
    private final IclientSource source;
    private final Gson gson = new Gson();

    private RequestContext requestContext;

    public TyroClient(WebView webView, String apiKey, PosProductData posProductData, IclientSource source) {
        this.webView = webView;
        this.apiKey = apiKey;
        this.posProductData = posProductData;
        this.source = source;
        initialiseWebView(webView);
    }

    public void pairTerminal() {
        webView.loadUrl(format("%s/configuration.html", source.getUrl()));
    }

    public void performOperation(String operation, Map<String, Object> parameters, ReceiptReceivedCallback receiptReceived, TransactionCompleteCallback transactionComplete) {
        this.requestContext = new RequestContext(operation, parameters, receiptReceived, transactionComplete);
        webView.loadUrl(format("%s/embedded.html?apiKey=%s", source.getUrl(), apiKey));
    }

    @JavascriptInterface
    public void ready() {
        webView.post(new Runnable() {
            @Override
            public void run() {
                String argument = gson.toJson(createArgsMap());
                String evalString = format("iClient.%s(%s)", requestContext.getName(), argument);
                webView.evaluateJavascript(evalString, null);
            }
        });
    }

    @JavascriptInterface
    public void receiptReceived(String receipt) {
        Map<String, String> receiptData = gson.fromJson(receipt, new TypeToken<Map<String, String>>(){}.getType());
        requestContext.getReceiptReceived().onReceiptData(receiptData);
    }

    @JavascriptInterface
    public void transactionComplete(String response) {
        Map<String, String> responseData = gson.fromJson(response, new TypeToken<Map<String, String>>(){}.getType());
        requestContext.getTransactionComplete().onTransactionComplete(responseData);
    }

    @SuppressLint({"JavascriptInterface", "SetJavaScriptEnabled"})
    private void initialiseWebView(WebView webView) {
        webView.addJavascriptInterface(this, "EmbeddedResponseAdapter");
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
    }

    private Map<String, Object> createArgsMap() {
        Map<String, Object> argumentMap = new LinkedHashMap<>(requestContext.getParams());
        Map<String, String> posProductMap = new LinkedHashMap<>();
        posProductMap.put("posProductName", posProductData.getPosProductName());
        posProductMap.put("posProductVendor", posProductData.getPosProductVendor());
        posProductMap.put("posProductVersion", posProductData.getPosProductVersion());
        argumentMap.put("posProductData", posProductMap);
        return argumentMap;
    }
}
