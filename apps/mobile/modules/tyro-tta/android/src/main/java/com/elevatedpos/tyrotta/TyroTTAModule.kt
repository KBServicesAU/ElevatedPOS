package com.elevatedpos.tyrotta

import android.app.AlertDialog
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import org.json.JSONObject

class TyroTTAModule : Module() {

    private var tyroClient: TyroClient? = null
    private var webView: WebView? = null
    private var pairingDialog: AlertDialog? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun definition() = ModuleDefinition {
        Name("TyroTTA")

        // Initialize TyroClient with API key and environment
        Function("init") { apiKey: String, vendor: String, productName: String, version: String, environment: String ->
            handler.post {
                val activity = appContext.currentActivity ?: return@post
                val source = when (environment.lowercase()) {
                    "production" -> IclientSource.PRODUCTION
                    "test" -> IclientSource.TEST
                    else -> IclientSource.SIMULATOR
                }

                // Create WebView for Tyro communication
                if (webView == null) {
                    webView = WebView(activity).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                }

                tyroClient = TyroClient(
                    webView,
                    apiKey,
                    PosProductData(vendor, productName, version),
                    source
                )
            }
        }

        // Pair terminal — shows WebView in a dialog so user can enter MID/TID
        Function("pairTerminal") {
            handler.post {
                val activity = appContext.currentActivity ?: return@post
                val client = tyroClient ?: return@post
                val wv = webView ?: return@post

                // Remove WebView from any existing parent
                (wv.parent as? ViewGroup)?.removeView(wv)

                // Create a full-screen dialog with the WebView
                val container = FrameLayout(activity).apply {
                    addView(wv, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    ))
                }

                pairingDialog?.dismiss()
                pairingDialog = AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_NoActionBar)
                    .setView(container)
                    .setOnDismissListener {
                        (wv.parent as? ViewGroup)?.removeView(wv)
                    }
                    .create()

                pairingDialog?.show()

                // Load Tyro's pairing/configuration page
                client.pairTerminal()
            }
        }

        // Close the pairing dialog
        Function("closePairing") {
            handler.post {
                pairingDialog?.dismiss()
                pairingDialog = null
            }
        }

        // Initiate a purchase transaction
        AsyncFunction("purchase") { amountCents: String, integratedReceipt: Boolean, promise: Promise ->
            handler.post {
                val client = tyroClient
                if (client == null) {
                    promise.reject("TYRO_NOT_INIT", "TyroClient not initialized. Call init() first.", null)
                    return@post
                }

                val params = mutableMapOf<String, Any>(
                    "amount" to amountCents,
                    "integratedReceipt" to integratedReceipt
                )

                client.performOperation(
                    "purchase",
                    params,
                    ReceiptReceivedCallback { _ -> },
                    TransactionCompleteCallback { responseData ->
                        try {
                            val json = JSONObject()
                            responseData?.forEach { (key, value) ->
                                json.put(key, value)
                            }
                            promise.resolve(json.toString())
                        } catch (e: Exception) {
                            promise.reject("TYRO_ERROR", e.message ?: "Transaction failed", e)
                        }
                    }
                )
            }
        }

        // Initiate a refund transaction
        AsyncFunction("refund") { amountCents: String, integratedReceipt: Boolean, promise: Promise ->
            handler.post {
                val client = tyroClient
                if (client == null) {
                    promise.reject("TYRO_NOT_INIT", "TyroClient not initialized. Call init() first.", null)
                    return@post
                }

                val params = mutableMapOf<String, Any>(
                    "amount" to amountCents,
                    "integratedReceipt" to integratedReceipt
                )

                client.performOperation(
                    "refund",
                    params,
                    ReceiptReceivedCallback { _ -> },
                    TransactionCompleteCallback { responseData ->
                        try {
                            val json = JSONObject()
                            responseData?.forEach { (key, value) ->
                                json.put(key, value)
                            }
                            promise.resolve(json.toString())
                        } catch (e: Exception) {
                            promise.reject("TYRO_ERROR", e.message ?: "Refund failed", e)
                        }
                    }
                )
            }
        }

        Function("isInitialized") {
            tyroClient != null
        }
    }
}
