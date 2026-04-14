package com.elevatedpos.tyrotta

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Expo module exposing the Tyro IClientWithUI to React Native.
 *
 * Architecture:
 *   React Native → TyroTTAModule (kotlin) → TyroClient (java)
 *       → WebView (tyro-bridge.html) → TYRO.IClientWithUI SDK (JS)
 *
 * Headful mode: Tyro renders its own transaction UI inside the WebView.
 * The WebView is shown as a full-screen overlay over the Activity when a
 * transaction starts and hidden after the transaction completes.
 *
 * Events emitted to JS (see [sendEvent]):
 *   onReady               — IClientWithUI created, ready for transactions
 *   onInitError           — script load or constructor failure
 *   onReceipt             — { tag, signatureRequired, merchantReceipt }
 *   onTransactionComplete — { tag, response }
 *   onResponse            — { tag, response }  (settlement/report/tip/closeTab)
 *   onPairingStatus       — { status, message?, integrationKey? }
 *   onLog                 — diagnostic string (debug only)
 */
class TyroTTAModule : Module(), TyroEventListener {

    private var tyroClient: TyroClient? = null
    private var webView: WebView? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun definition() = ModuleDefinition {
        Name("TyroTTA")

        Events(
            "onReady",
            "onInitError",
            "onReceipt",
            "onTransactionComplete",
            "onResponse",
            "onPairingStatus",
            "onLog"
        )

        /* ---------------------------------------------------------- */
        /* Init / lifecycle                                             */
        /* ---------------------------------------------------------- */

        Function("init") { apiKey: String, vendor: String, productName: String, version: String, siteReference: String, environment: String ->
            handler.post {
                val activity = appContext.currentActivity ?: return@post
                val source = when (environment.lowercase()) {
                    "production" -> IclientSource.PRODUCTION
                    "test"       -> IclientSource.TEST
                    else         -> IclientSource.SIMULATOR
                }

                if (webView == null) {
                    webView = WebView(activity.applicationContext)
                }
                val wv = webView!!

                if (tyroClient == null) {
                    tyroClient = TyroClient(wv, source, this@TyroTTAModule)
                }
                tyroClient!!.init(apiKey, PosProductData(vendor, productName, version), siteReference)
            }
        }

        Function("isInitialized") {
            tyroClient?.isInitialized == true
        }

        /* ---------------------------------------------------------- */
        /* Pairing (headless — mandatory on Android 12+)               */
        /* ---------------------------------------------------------- */

        Function("pair") { mid: String, tid: String ->
            handler.post { tyroClient?.pair(mid, tid) }
        }

        /* ---------------------------------------------------------- */
        /* Purchase / Refund                                            */
        /* ---------------------------------------------------------- */

        Function("purchase") { amountCents: String, cashoutCents: String, integratedReceipt: Boolean, enableSurcharge: Boolean, transactionId: String ->
            handler.post {
                showWebViewOverlay()
                tyroClient?.purchase(amountCents, cashoutCents, integratedReceipt, enableSurcharge, transactionId)
            }
        }

        Function("refund") { amountCents: String, integratedReceipt: Boolean, transactionId: String ->
            handler.post {
                showWebViewOverlay()
                tyroClient?.refund(amountCents, integratedReceipt, transactionId)
            }
        }

        /* ---------------------------------------------------------- */
        /* Bar tabs                                                     */
        /* ---------------------------------------------------------- */

        Function("openTab") { amountCents: String, integratedReceipt: Boolean ->
            handler.post {
                showWebViewOverlay()
                tyroClient?.openTab(amountCents, integratedReceipt)
            }
        }

        Function("closeTab") { completionReference: String, amountCents: String ->
            handler.post { tyroClient?.closeTab(completionReference, amountCents) }
        }

        /* ---------------------------------------------------------- */
        /* Pre-auth                                                     */
        /* ---------------------------------------------------------- */

        Function("openPreAuth") { amountCents: String, integratedReceipt: Boolean ->
            handler.post {
                showWebViewOverlay()
                tyroClient?.openPreAuth(amountCents, integratedReceipt)
            }
        }

        Function("incrementPreAuth") { completionReference: String, amountCents: String, integratedReceipt: Boolean ->
            handler.post {
                showWebViewOverlay()
                tyroClient?.incrementPreAuth(completionReference, amountCents, integratedReceipt)
            }
        }

        Function("completePreAuth") { completionReference: String, amountCents: String, integratedReceipt: Boolean ->
            handler.post { tyroClient?.completePreAuth(completionReference, amountCents, integratedReceipt) }
        }

        Function("voidPreAuth") { completionReference: String, integratedReceipt: Boolean ->
            handler.post { tyroClient?.voidPreAuth(completionReference, integratedReceipt) }
        }

        /* ---------------------------------------------------------- */
        /* Tips / Settlement / Reports                                  */
        /* ---------------------------------------------------------- */

        Function("addTip") { completionReference: String, tipCents: String ->
            handler.post { tyroClient?.addTip(completionReference, tipCents) }
        }

        Function("manualSettlement") {
            handler.post { tyroClient?.manualSettlement() }
        }

        Function("reconciliationReport") { reportType: String, date: String ->
            handler.post { tyroClient?.reconciliationReport(reportType, date) }
        }

        Function("getConfiguration") {
            handler.post { tyroClient?.getConfiguration() }
        }

        /**
         * Emergency cancel — Tyro's iframe UI provides its own cancel
         * button in headful mode. This is a safety-valve only.
         */
        Function("cancelTransaction") {
            handler.post { tyroClient?.cancel() }
        }
    }

    /* ---------------------------------------------------------- */
    /* WebView overlay show / hide                                  */
    /* ---------------------------------------------------------- */

    /**
     * Show the Tyro WebView as a full-screen overlay above the app.
     * Called on the main thread immediately before starting a transaction
     * so Tyro's iframe UI appears as soon as the SDK receives the request.
     */
    private fun showWebViewOverlay() {
        val activity = appContext.currentActivity ?: return
        val wv = webView ?: return

        // Remove from any existing parent to avoid "already has a parent" crash.
        (wv.parent as? ViewGroup)?.removeView(wv)

        val decorView = activity.window.decorView as? ViewGroup ?: return
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        decorView.addView(wv, params)
        wv.visibility = View.VISIBLE
        wv.bringToFront()
    }

    /**
     * Remove the Tyro WebView overlay after a transaction completes.
     * The WebView stays alive (and paired) for the next transaction.
     */
    private fun hideWebViewOverlay() {
        val wv = webView ?: return
        (wv.parent as? ViewGroup)?.removeView(wv)
        wv.visibility = View.GONE
    }

    /* ---------------------------------------------------------- */
    /* TyroEventListener -> JS event fan-out                       */
    /* ---------------------------------------------------------- */

    override fun onReady() {
        sendEvent("onReady", mapOf("ok" to true))
    }

    override fun onInitError(message: String?) {
        sendEvent("onInitError", mapOf("message" to (message ?: "Unknown error")))
    }

    override fun onReceipt(json: String?) {
        sendEvent("onReceipt", parseJson(json))
    }

    override fun onTransactionComplete(json: String?) {
        // Hide the overlay on the main thread before notifying React Native.
        // The WebView stays alive and connected for the next transaction.
        handler.post { hideWebViewOverlay() }
        sendEvent("onTransactionComplete", parseJson(json))
    }

    override fun onResponse(json: String?) {
        sendEvent("onResponse", parseJson(json))
    }

    override fun onPairingStatus(json: String?) {
        sendEvent("onPairingStatus", parseJson(json))
    }

    override fun onLog(message: String?) {
        sendEvent("onLog", mapOf("message" to (message ?: "")))
    }

    /* ---------------------------------------------------------- */
    /* Helpers                                                      */
    /* ---------------------------------------------------------- */

    private fun parseJson(json: String?): Map<String, Any?> {
        if (json.isNullOrBlank()) return emptyMap()
        return try {
            jsonObjectToMap(JSONObject(json))
        } catch (e: Exception) {
            mapOf("raw" to json)
        }
    }

    private fun jsonObjectToMap(obj: JSONObject): Map<String, Any?> {
        val m = mutableMapOf<String, Any?>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            m[k] = unwrap(obj.opt(k))
        }
        return m
    }

    private fun unwrap(v: Any?): Any? = when (v) {
        is JSONObject -> jsonObjectToMap(v)
        is org.json.JSONArray -> {
            val list = mutableListOf<Any?>()
            for (i in 0 until v.length()) list.add(unwrap(v.opt(i)))
            list
        }
        JSONObject.NULL -> null
        else -> v
    }
}
