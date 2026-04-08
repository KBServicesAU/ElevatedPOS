package com.elevatedpos.secondarydisplay

import android.app.Presentation
import android.content.Context
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SecondaryDisplayModule : Module() {

  private var presentation: CustomerPresentation? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("SecondaryDisplay")

    Function("isAvailable") {
      val dm = appContext.reactContext?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
      val displays = dm?.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
      (displays?.isNotEmpty() == true)
    }

    Function("show") {
      handler.post { showPresentation() }
    }

    Function("hide") {
      handler.post { hidePresentation() }
    }

    Function("showIdle") { welcomeMessage: String ->
      handler.post { presentation?.showIdle(welcomeMessage) }
    }

    Function("showTransaction") { dataJson: String ->
      handler.post { presentation?.showTransaction(dataJson) }
    }

    Function("showThankYou") { message: String, total: String ->
      handler.post { presentation?.showThankYou(message, total) }
    }
  }

  private fun showPresentation() {
    if (presentation != null) return
    val context = appContext.reactContext ?: return
    val dm = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return
    val displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
    if (displays.isEmpty()) return
    val display = displays[0]
    presentation = CustomerPresentation(context, display)
    presentation?.show()
  }

  private fun hidePresentation() {
    presentation?.dismiss()
    presentation = null
  }
}

/**
 * Android Presentation rendered on the secondary display.
 * Supports three states: idle (logo + welcome), transaction (line items + total),
 * and thank-you (confirmation message).
 */
class CustomerPresentation(context: Context, display: Display) : Presentation(context, display) {

  private lateinit var rootLayout: LinearLayout
  private lateinit var idleView: LinearLayout
  private lateinit var transactionView: LinearLayout
  private lateinit var thankYouView: LinearLayout

  // Transaction views
  private lateinit var txItemsContainer: LinearLayout
  private lateinit var txSubtotalText: TextView
  private lateinit var txGstText: TextView
  private lateinit var txTotalText: TextView
  private lateinit var txHeaderText: TextView

  // Idle views
  private lateinit var idleWelcomeText: TextView

  // Thank you views
  private lateinit var tyMessageText: TextView
  private lateinit var tyTotalText: TextView

  private val bgColor = Color.parseColor("#0a0a14")
  private val accentColor = Color.parseColor("#6366f1")
  private val textColor = Color.parseColor("#e0e0e0")
  private val dimColor = Color.parseColor("#888888")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    rootLayout = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(bgColor)
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    }

    buildIdleView()
    buildTransactionView()
    buildThankYouView()

    rootLayout.addView(idleView)
    rootLayout.addView(transactionView)
    rootLayout.addView(thankYouView)

    // Start with idle visible
    idleView.visibility = View.VISIBLE
    transactionView.visibility = View.GONE
    thankYouView.visibility = View.GONE

    setContentView(rootLayout)
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics
    ).toInt()
  }

  private fun buildIdleView() {
    idleView = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    }

    // Logo circle
    val logoCircle = TextView(context).apply {
      text = "E"
      setTextColor(Color.WHITE)
      textSize = 48f
      gravity = Gravity.CENTER
      setBackgroundColor(accentColor)
      val size = dp(120)
      layoutParams = LinearLayout.LayoutParams(size, size).apply {
        gravity = Gravity.CENTER
        bottomMargin = dp(24)
      }
      // Make it circular — good enough for a solid color circle
      setPadding(0, dp(20), 0, 0)
    }
    idleView.addView(logoCircle)

    // Brand name
    val brandText = TextView(context).apply {
      text = "ElevatedPOS"
      setTextColor(Color.WHITE)
      textSize = 32f
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        gravity = Gravity.CENTER
        bottomMargin = dp(12)
      }
    }
    idleView.addView(brandText)

    // Welcome message
    idleWelcomeText = TextView(context).apply {
      text = "Welcome"
      setTextColor(dimColor)
      textSize = 20f
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { gravity = Gravity.CENTER }
    }
    idleView.addView(idleWelcomeText)
  }

  private fun buildTransactionView() {
    transactionView = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
      setPadding(dp(32), dp(32), dp(32), dp(32))
    }

    // Header
    txHeaderText = TextView(context).apply {
      text = "Your Order"
      setTextColor(Color.WHITE)
      textSize = 28f
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { bottomMargin = dp(20) }
    }
    transactionView.addView(txHeaderText)

    // Scrollable items area
    val scrollView = ScrollView(context).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
      )
    }
    txItemsContainer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
    }
    scrollView.addView(txItemsContainer)
    transactionView.addView(scrollView)

    // Divider
    transactionView.addView(View(context).apply {
      setBackgroundColor(Color.parseColor("#2a2a3a"))
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(1)
      ).apply { topMargin = dp(16); bottomMargin = dp(16) }
    })

    // Subtotal
    txSubtotalText = TextView(context).apply {
      setTextColor(dimColor)
      textSize = 18f
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { bottomMargin = dp(4) }
    }
    transactionView.addView(txSubtotalText)

    // GST
    txGstText = TextView(context).apply {
      setTextColor(dimColor)
      textSize = 16f
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { bottomMargin = dp(12) }
    }
    transactionView.addView(txGstText)

    // Total
    txTotalText = TextView(context).apply {
      setTextColor(Color.WHITE)
      textSize = 36f
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
    }
    transactionView.addView(txTotalText)
  }

  private fun buildThankYouView() {
    thankYouView = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    }

    // Checkmark
    val checkText = TextView(context).apply {
      text = "\u2713"
      setTextColor(Color.parseColor("#22c55e"))
      textSize = 72f
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        gravity = Gravity.CENTER
        bottomMargin = dp(24)
      }
    }
    thankYouView.addView(checkText)

    tyMessageText = TextView(context).apply {
      text = "Thank you!"
      setTextColor(Color.WHITE)
      textSize = 28f
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        gravity = Gravity.CENTER
        bottomMargin = dp(16)
      }
    }
    thankYouView.addView(tyMessageText)

    tyTotalText = TextView(context).apply {
      text = ""
      setTextColor(accentColor)
      textSize = 36f
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { gravity = Gravity.CENTER }
    }
    thankYouView.addView(tyTotalText)
  }

  // --- Public API ---

  fun showIdle(welcomeMessage: String) {
    idleWelcomeText.text = welcomeMessage
    idleView.visibility = View.VISIBLE
    transactionView.visibility = View.GONE
    thankYouView.visibility = View.GONE
  }

  fun showTransaction(dataJson: String) {
    try {
      val data = org.json.JSONObject(dataJson)
      val items = data.optJSONArray("items")
      val total = data.optDouble("total", 0.0)
      val gst = data.optDouble("gst", 0.0)
      val itemCount = data.optInt("itemCount", 0)
      val customerName = data.optString("customerName", "")

      // Header
      txHeaderText.text = if (customerName.isNotEmpty()) {
        "Order for $customerName"
      } else {
        "Your Order · $itemCount items"
      }

      // Items
      txItemsContainer.removeAllViews()
      if (items != null) {
        for (i in 0 until items.length()) {
          val item = items.getJSONObject(i)
          val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
              LinearLayout.LayoutParams.MATCH_PARENT,
              LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(8) }
          }

          val qty = item.optInt("qty", 1)
          val name = item.optString("name", "")
          val price = item.optDouble("price", 0.0)

          val nameView = TextView(context).apply {
            text = if (qty > 1) "${qty}× $name" else name
            setTextColor(textColor)
            textSize = 18f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
          }
          row.addView(nameView)

          val priceView = TextView(context).apply {
            text = "$${String.format("%.2f", price * qty)}"
            setTextColor(textColor)
            textSize = 18f
          }
          row.addView(priceView)

          txItemsContainer.addView(row)
        }
      }

      // Totals
      val subtotal = total - gst
      txSubtotalText.text = "Subtotal  $${String.format("%.2f", subtotal)}"
      txGstText.text = "GST (10%)  $${String.format("%.2f", gst)}"
      txTotalText.text = "Total  $${String.format("%.2f", total)}"

      idleView.visibility = View.GONE
      transactionView.visibility = View.VISIBLE
      thankYouView.visibility = View.GONE
    } catch (e: Exception) {
      // Parsing error — stay on current view
    }
  }

  fun showThankYou(message: String, total: String) {
    tyMessageText.text = message
    tyTotalText.text = total
    idleView.visibility = View.GONE
    transactionView.visibility = View.GONE
    thankYouView.visibility = View.VISIBLE
  }
}
