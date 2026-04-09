package com.elevatedpos.tyrotta

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import org.json.JSONObject

class TyroTTAModule : Module() {

    private var tyroClient: TyroClient? = null
    private var webView: WebView? = null
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

                // Create hidden WebView for Tyro communication
                if (webView == null) {
                    webView = WebView(activity).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
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

        // Pair terminal — opens Tyro configuration page in WebView
        Function("pairTerminal") {
            handler.post {
                tyroClient?.pairTerminal()
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
                    // Receipt callback
                    ReceiptReceivedCallback { receiptData ->
                        // Receipt data available — stored for later use
                    },
                    // Transaction complete callback
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

        // Check if TyroClient is initialized
        Function("isInitialized") {
            tyroClient != null
        }
    }
}
