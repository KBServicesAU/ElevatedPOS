package com.elevatedpos.tyrotta;

/**
 * Fan-out interface for Tyro iClient events. Implemented by the
 * Expo module so it can forward each event to JavaScript.
 *
 * Headful (IClientWithUI) mode — status messages and question prompts
 * are rendered by Tyro's own iframe UI inside the WebView. Only receipt
 * and transaction-complete events are forwarded here.
 */
public interface TyroEventListener {
    /** Called after the bridge script loads and {@code TYRO.IClientWithUI} is ready. */
    void onReady();

    /** Called if init() fails (script load error or IClientWithUI constructor throws). */
    void onInitError(String message);

    /** Called with the merchant receipt when integrated receipts are enabled. */
    void onReceipt(String json);

    /** Called when the transaction has finished (APPROVED / DECLINED / etc.). */
    void onTransactionComplete(String json);

    /** Generic response callback for operations like settlement, reports, tips. */
    void onResponse(String json);

    /** Pairing status updates: success / failure / inProgress. */
    void onPairingStatus(String json);

    /** Diagnostic log line from the bridge page. */
    void onLog(String message);
}
