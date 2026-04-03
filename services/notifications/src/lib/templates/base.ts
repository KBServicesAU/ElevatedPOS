/**
 * Base branded email template for ElevatedPOS.
 * Usage: wrap(content) — returns a complete HTML email string.
 */
export function wrapEmail(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ElevatedPOS</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f0f2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .shell{max-width:620px;margin:40px auto 60px;padding:0 16px}
  .card{background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  /* Header */
  .header{background:#09090b;padding:32px 40px;text-align:center}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#ffffff;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,.25)}
  .logo-ring span{font-size:30px;font-weight:900;color:#09090b;line-height:1;font-family:Georgia,"Times New Roman",serif}
  .brand-name{color:#ffffff;font-size:16px;font-weight:600;letter-spacing:.6px;margin-top:10px;opacity:.85}
  /* Body */
  .body{padding:40px 40px 32px}
  .preheader{font-size:13px;color:#a1a1aa;margin-bottom:24px;display:block}
  h1{color:#09090b;font-size:22px;font-weight:700;line-height:1.3;margin-bottom:12px}
  p{color:#52525b;font-size:15px;line-height:1.75;margin-bottom:16px}
  strong{color:#18181b}
  /* Info box */
  .info-box{background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:20px 0}
  .info-box p{margin-bottom:6px;font-size:14px}
  .info-box p:last-child{margin-bottom:0}
  /* CTA Button */
  .btn-wrap{text-align:center;margin:28px 0 24px}
  .btn{display:inline-block;background:#09090b;color:#ffffff!important;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:.2px}
  .btn:hover{background:#27272a}
  /* Divider */
  .divider{border:none;border-top:1px solid #f4f4f5;margin:24px 0}
  .small{font-size:13px;color:#a1a1aa;line-height:1.6}
  .small a{color:#71717a;text-decoration:underline}
  /* Footer */
  .footer{padding:20px 40px 28px;text-align:center;background:#fafafa;border-top:1px solid #f4f4f5}
  .footer p{font-size:12px;color:#a1a1aa;line-height:1.8;margin:0}
  .footer a{color:#71717a;text-decoration:none}
  .footer a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="shell">
  <div class="card">
    <div class="header">
      <div class="logo-ring"><span>E</span></div>
      <div class="brand-name">ElevatedPOS</div>
    </div>
    <div class="body">
      ${bodyContent}
    </div>
    <div class="footer">
      <p><strong style="color:#71717a">ElevatedPOS</strong> &mdash; Point of Sale &amp; Business Management</p>
      <p style="margin-top:4px">Questions? <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a></p>
      <p style="margin-top:8px">
        <a href="https://elevatedpos.com.au/privacy">Privacy Policy</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;<a href="https://elevatedpos.com.au">elevatedpos.com.au</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;
}
