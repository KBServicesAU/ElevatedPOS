package com.elevatedpos.tyrotta

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Expo module exposing the Tyro iClient to React Native.
 *
 * Architecture:
 *   React Native -> TyroTTAModule (kotlin) -> TyroClient (java) -> WebView(tyro-bridge.html) -> Tyro iClient SDK (JS)
 *
 * Events emitted to JS (see [sendEvent]):
 *   onReady              -> bridge initialised, IClient created
 *   onInitError          -> script load / IClient constructor failure
 *   onStatusMessage      -> { tag, message }
 *   onQuestion           -> { tag, text, options[], isError }
 *   onReceipt            -> { tag, signatureRequired, merchantReceipt }
 *   onTransactionComplete -> { tag, response }
 *   onResponse           -> { tag, response }     (settlement/report/tip/closeTab/etc.)
 *   onPairingStatus      -> { status, message?, integrationKey? }
 *   onLog                -> diagnostic string (debug only)
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
            "onStatusMessage",
            "onQuestion",
            "onReceipt",
            "onTransactionComplete",
            "onResponse",
            "onPairingStatus",
            "onLog"
        )

        /* ---------------------------------------------------------- */
        /* Init / lifecycle                                             */
        /* ---------------------------------------------------------- */

        Function("init") { apiKey: String, vendor: String, productName: String, version: String, environment: String ->
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
                tyroClient!!.init(apiKey, PosProductData(vendor, productName, version))
            }
        }

        Function("isInitialized") {
            tyroClient?.isInitialized == true
        }

        /* ---------------------------------------------------------- */
        /* Pairing                                                      */
        /* ---------------------------------------------------------- */

        Function("pair") { mid: String, tid: String ->
            handler.post { tyroClient?.pair(mid, tid) }
        }

        /* ---------------------------------------------------------- */
        /* Purchase / Refund                                            */
        /* ---------------------------------------------------------- */

        Function("purchase") { amountCents: String, cashoutCents: String, integratedReceipt: Boolean, enableSurcharge: Boolean, transactionId: String ->
            handler.post { tyroClient?.purchase(amountCents, cashoutCents, integratedReceipt, enableSurcharge, transactionId) }
        }

        Function("refund") { amountCents: String, integratedReceipt: Boolean, transactionId: String ->
            handler.post { tyroClient?.refund(amountCents, integratedReceipt, transactionId) }
        }

        /* ---------------------------------------------------------- */
        /* Question / Cancel                                            */
        /* ---------------------------------------------------------- */

        Function("submitAnswer") { answer: String ->
            handler.post { tyroClient?.submitAnswer(answer) }
        }

        Function("cancelTransaction") {
            handler.post { tyroClient?.cancel() }
        }

        /* ---------------------------------------------------------- */
        /* Bar tabs                                                     */
        /* ---------------------------------------------------------- */

        Function("openTab") { amountCents: String, integratedReceipt: Boolean ->
            handler.post { tyroClient?.openTab(amountCents, integratedReceipt) }
        }

        Function("closeTab") { completionReference: String, amountCents: String ->
            handler.post { tyroClient?.closeTab(completionReference, amountCents) }
        }

        /* ---------------------------------------------------------- */
        /* Pre-auth                                                     */
        /* ---------------------------------------------------------- */

        Function("openPreAuth") { amountCents: String, integratedReceipt: Boolean ->
            handler.post { tyroClient?.openPreAuth(amountCents, integratedReceipt) }
        }

        Function("incrementPreAuth") { completionReference: String, amountCents: String, integratedReceipt: Boolean ->
            handler.post { tyroClient?.incrementPreAuth(completionReference, amountCents, integratedReceipt) }
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

    override fun onStatusMessage(tag: String?, message: String?) {
        sendEvent("onStatusMessage", mapOf(
            "tag" to (tag ?: ""),
            "message" to (message ?: "")
        ))
    }

    override fun onQuestion(json: String?) {
        sendEvent("onQuestion", parseJson(json))
    }

    override fun onReceipt(json: String?) {
        sendEvent("onReceipt", parseJson(json))
    }

    override fun onTransactionComplete(json: String?) {
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

    /** Convert a JSON string from the bridge into a Map for Expo event fan-out. */
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
