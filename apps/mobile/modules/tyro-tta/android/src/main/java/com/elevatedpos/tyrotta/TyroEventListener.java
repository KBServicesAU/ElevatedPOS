package com.elevatedpos.tyrotta;

/**
 * Fan-out interface for Tyro iClient events. Implemented by the
 * Expo module so it can forward each event to JavaScript.
 *
 * The {@code json} strings are the raw payloads emitted by the
 * bridge page. They are kept as strings so the module can forward
 * them directly without re-serialising.
 */
public interface TyroEventListener {
    /** Called after the bridge script loads and {@code TYRO.IClient} is ready. */
    void onReady();

    /** Called if init() fails (script load error or IClient constructor throws). */
    void onInitError(String message);

    /** Called with an in-flight status message, e.g. "Insert card". */
    void onStatusMessage(String tag, String message);

    /** Called when the terminal needs the merchant to answer a question. */
    void onQuestion(String json);

    /** Called with a merchant receipt when integrated receipts are enabled. */
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
