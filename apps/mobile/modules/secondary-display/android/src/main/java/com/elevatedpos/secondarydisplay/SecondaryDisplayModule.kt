package com.elevatedpos.secondarydisplay

import android.app.Activity
import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
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
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
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

    // v2.7.84 — QR Pay screen. Payload shape:
    //   { "url": "https://checkout.stripe.com/...",
    //     "amount": "12.34",
    //     "tip": "1.23"  // optional, may be null }
    Function("showQrPay") { dataJson: String ->
      handler.post { presentation?.showQrPay(dataJson) }
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
  private lateinit var qrPayView: LinearLayout
  private lateinit var idleWelcomeText: TextView
  private lateinit var txHeaderText: TextView
  private lateinit var txItemsContainer: LinearLayout
  private lateinit var txSubtotalText: TextView
  private lateinit var txGstText: TextView
  private lateinit var txTotalText: TextView
  private lateinit var tyMessageText: TextView
  private lateinit var tyTotalText: TextView
  private lateinit var qrImageView: ImageView
  private lateinit var qrAmountText: TextView
  private lateinit var qrTipText: TextView

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
    qrPayView = buildQrPayView()

    root.addView(idleView)
    root.addView(transactionView)
    root.addView(thankYouView)
    root.addView(qrPayView)

    idleView.visibility = View.VISIBLE
    transactionView.visibility = View.GONE
    thankYouView.visibility = View.GONE
    qrPayView.visibility = View.GONE

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

  // v2.7.84 \u2014 QR Pay screen. Centered layout with a large white-bg QR
  // panel (so dark phone cameras pick it up reliably), the amount in
  // big numerals, and an optional "incl. tip" line.
  private fun buildQrPayView(): LinearLayout {
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(-1, -1)
      setPadding(dp(24), dp(24), dp(24), dp(24))

      addView(TextView(context).apply {
        text = "Scan to Pay"
        setTextColor(Color.WHITE)
        textSize = 36f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(20) }
      })

      // White card behind the QR \u2014 improves contrast on the dark theme
      // and matches what most retail customer-display QR flows do.
      val qrCard = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.WHITE)
        setPadding(dp(20), dp(20), dp(20), dp(20))
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(24) }
      }
      qrImageView = ImageView(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(360), dp(360))
      }
      qrCard.addView(qrImageView)
      addView(qrCard)

      qrAmountText = TextView(context).apply {
        text = ""
        setTextColor(Color.WHITE)
        textSize = 56f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(8) }
      }
      addView(qrAmountText)
      qrTipText = TextView(context).apply {
        text = ""
        setTextColor(textDim)
        textSize = 18f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER; bottomMargin = dp(20) }
      }
      addView(qrTipText)

      addView(TextView(context).apply {
        text = "Pay with your phone \u2014 Apple Pay, Google Pay, or card"
        setTextColor(textDim)
        textSize = 16f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER }
      })
    }
  }

  fun showIdle(msg: String) {
    idleWelcomeText.text = msg
    idleView.visibility = View.VISIBLE; transactionView.visibility = View.GONE; thankYouView.visibility = View.GONE; qrPayView.visibility = View.GONE
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
      idleView.visibility = View.GONE; transactionView.visibility = View.VISIBLE; thankYouView.visibility = View.GONE; qrPayView.visibility = View.GONE
    } catch (_: Exception) {}
  }

  fun showThankYou(msg: String, total: String) {
    tyMessageText.text = msg; tyTotalText.text = total
    idleView.visibility = View.GONE; transactionView.visibility = View.GONE; thankYouView.visibility = View.VISIBLE; qrPayView.visibility = View.GONE
  }

  // v2.7.84 — encode the URL into a QR bitmap and swap to the QR Pay view.
  fun showQrPay(dataJson: String) {
    try {
      val d = JSONObject(dataJson)
      val url = d.optString("url", "")
      val amount = d.optString("amount", "0.00")
      val tip: String? = if (d.has("tip") && !d.isNull("tip")) d.optString("tip", "") else null
      if (url.isEmpty()) return

      val bitmap = encodeQrToBitmap(url, dp(360))
      if (bitmap != null) qrImageView.setImageBitmap(bitmap)
      qrAmountText.text = "$$amount"
      qrTipText.text = if (tip != null) "incl. $$tip tip" else ""
      qrTipText.visibility = if (tip != null) View.VISIBLE else View.GONE

      idleView.visibility = View.GONE
      transactionView.visibility = View.GONE
      thankYouView.visibility = View.GONE
      qrPayView.visibility = View.VISIBLE
    } catch (_: Exception) {
      // Bad payload — leave whatever screen is currently visible.
    }
  }

  // Pure-Java ZXing pipeline: MultiFormatWriter → BitMatrix → Bitmap.
  // High error correction so the QR survives a bit of glare on the
  // customer screen, and a quiet zone of 1 module to keep it tight.
  private fun encodeQrToBitmap(content: String, sizePx: Int): Bitmap? {
    return try {
      val hints = mapOf<EncodeHintType, Any>(
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H,
        EncodeHintType.MARGIN to 1,
        EncodeHintType.CHARACTER_SET to "UTF-8",
      )
      val matrix = MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
      val w = matrix.width
      val h = matrix.height
      val pixels = IntArray(w * h)
      for (y in 0 until h) {
        val row = y * w
        for (x in 0 until w) {
          pixels[row + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
        }
      }
      val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      bmp.setPixels(pixels, 0, w, 0, 0, w, h)
      bmp
    } catch (_: Exception) {
      null
    }
  }
}
