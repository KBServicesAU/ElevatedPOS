package com.elevatedpos.secondarydisplay

import android.app.Activity
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
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class SecondaryDisplayModule : Module() {

  private var presentation: CustomerPresentation? = null
  private val handler = Handler(Looper.getMainLooper())

  private fun getActivity(): Activity? {
    return appContext.currentActivity
  }

  override fun definition() = ModuleDefinition {
    Name("SecondaryDisplay")

    Function("isAvailable") {
      val activity = getActivity() ?: return@Function false
      val dm = activity.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        ?: return@Function false
      val displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
      displays.isNotEmpty()
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
    val activity = getActivity() ?: return
    val dm = activity.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return
    val displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
    if (displays.isEmpty()) return
    presentation = CustomerPresentation(activity, displays[0])
    presentation?.show()
  }

  private fun hidePresentation() {
    presentation?.dismiss()
    presentation = null
  }
}

class CustomerPresentation(context: Context, display: Display) : Presentation(context, display) {

  private lateinit var idleView: LinearLayout
  private lateinit var transactionView: LinearLayout
  private lateinit var thankYouView: LinearLayout
  private lateinit var idleWelcomeText: TextView
  private lateinit var txHeaderText: TextView
  private lateinit var txItemsContainer: LinearLayout
  private lateinit var txSubtotalText: TextView
  private lateinit var txGstText: TextView
  private lateinit var txTotalText: TextView
  private lateinit var tyMessageText: TextView
  private lateinit var tyTotalText: TextView

  private val bgColor = Color.parseColor("#0a0a14")
  private val accent = Color.parseColor("#6366f1")
  private val textPrimary = Color.parseColor("#e0e0e0")
  private val textDim = Color.parseColor("#888888")

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), context.resources.displayMetrics).toInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(bgColor)
      layoutParams = LinearLayout.LayoutParams(-1, -1)
    }

    idleView = buildIdleView()
    transactionView = buildTransactionView()
    thankYouView = buildThankYouView()

    root.addView(idleView)
    root.addView(transactionView)
    root.addView(thankYouView)

    idleView.visibility = View.VISIBLE
    transactionView.visibility = View.GONE
    thankYouView.visibility = View.GONE

    setContentView(root)
  }

  private fun buildIdleView(): LinearLayout {
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(-1, -1)

      addView(TextView(context).apply {
        text = "E"
        setTextColor(Color.WHITE)
        textSize = 48f
        gravity = Gravity.CENTER
        setBackgroundColor(accent)
        layoutParams = LinearLayout.LayoutParams(dp(120), dp(120)).apply {
          gravity = Gravity.CENTER; bottomMargin = dp(24)
        }
        setPadding(0, dp(20), 0, 0)
      })
      addView(TextView(context).apply {
        text = "ElevatedPOS"
        setTextColor(Color.WHITE)
        textSize = 32f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(12) }
      })
      idleWelcomeText = TextView(context).apply {
        text = "Welcome"
        setTextColor(textDim)
        textSize = 20f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER }
      }
      addView(idleWelcomeText)
    }
  }

  private fun buildTransactionView(): LinearLayout {
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(-1, -1)
      setPadding(dp(32), dp(32), dp(32), dp(32))

      txHeaderText = TextView(context).apply { text = "Your Order"; setTextColor(Color.WHITE); textSize = 28f; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(20) } }
      addView(txHeaderText)

      val scroll = ScrollView(context).apply { layoutParams = LinearLayout.LayoutParams(-1, 0, 1f) }
      txItemsContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(-1, -2) }
      scroll.addView(txItemsContainer)
      addView(scroll)

      addView(View(context).apply { setBackgroundColor(Color.parseColor("#2a2a3a")); layoutParams = LinearLayout.LayoutParams(-1, dp(1)).apply { topMargin = dp(16); bottomMargin = dp(16) } })

      txSubtotalText = TextView(context).apply { setTextColor(textDim); textSize = 18f; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(4) } }
      addView(txSubtotalText)
      txGstText = TextView(context).apply { setTextColor(textDim); textSize = 16f; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) } }
      addView(txGstText)
      txTotalText = TextView(context).apply { setTextColor(Color.WHITE); textSize = 36f; layoutParams = LinearLayout.LayoutParams(-1, -2) }
      addView(txTotalText)
    }
  }

  private fun buildThankYouView(): LinearLayout {
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(-1, -1)

      addView(TextView(context).apply { text = "\u2713"; setTextColor(Color.parseColor("#22c55e")); textSize = 72f; gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(24) } })
      tyMessageText = TextView(context).apply { text = "Thank you!"; setTextColor(Color.WHITE); textSize = 28f; gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(16) } }
      addView(tyMessageText)
      tyTotalText = TextView(context).apply { text = ""; setTextColor(accent); textSize = 36f; gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER } }
      addView(tyTotalText)
    }
  }

  fun showIdle(msg: String) {
    idleWelcomeText.text = msg
    idleView.visibility = View.VISIBLE; transactionView.visibility = View.GONE; thankYouView.visibility = View.GONE
  }

  fun showTransaction(dataJson: String) {
    try {
      val d = JSONObject(dataJson)
      val items = d.optJSONArray("items")
      val total = d.optDouble("total", 0.0)
      val gst = d.optDouble("gst", 0.0)
      val count = d.optInt("itemCount", 0)
      val cust = d.optString("customerName", "")

      txHeaderText.text = if (cust.isNotEmpty()) "Order for $cust" else "Your Order \u00b7 $count items"
      txItemsContainer.removeAllViews()
      if (items != null) {
        for (i in 0 until items.length()) {
          val item = items.getJSONObject(i)
          val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) } }
          val q = item.optInt("qty", 1); val n = item.optString("name", ""); val p = item.optDouble("price", 0.0)
          row.addView(TextView(context).apply { text = if (q > 1) "${q}\u00d7 $n" else n; setTextColor(textPrimary); textSize = 18f; layoutParams = LinearLayout.LayoutParams(0, -2, 1f) })
          row.addView(TextView(context).apply { text = "$${String.format("%.2f", p * q)}"; setTextColor(textPrimary); textSize = 18f })
          txItemsContainer.addView(row)
        }
      }
      txSubtotalText.text = "Subtotal  $${String.format("%.2f", total - gst)}"
      txGstText.text = "GST (10%)  $${String.format("%.2f", gst)}"
      txTotalText.text = "Total  $${String.format("%.2f", total)}"
      idleView.visibility = View.GONE; transactionView.visibility = View.VISIBLE; thankYouView.visibility = View.GONE
    } catch (_: Exception) {}
  }

  fun showThankYou(msg: String, total: String) {
    tyMessageText.text = msg; tyTotalText.text = total
    idleView.visibility = View.GONE; transactionView.visibility = View.GONE; thankYouView.visibility = View.VISIBLE
  }
}
