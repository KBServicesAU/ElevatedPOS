/**
 * Customer-facing landing page after a successful QR-pay Checkout
 * Session. The POS doesn't depend on this — it polls /qr-status — so
 * this is purely a tidy "you're done" message for the customer's
 * phone. Includes a "return to your terminal to collect your receipt"
 * line to nudge them back to the staff screen.
 *
 * Marked dynamic so Next doesn't try to prerender it (the `session`
 * query param is per-request).
 */
export const dynamic = 'force-dynamic';

export default function QrPaySuccessPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg,#0a0a0f 0%,#1a1a2e 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          background: '#22c55e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          marginBottom: 28,
          boxShadow: '0 0 40px rgba(34,197,94,0.55)',
        }}
        aria-hidden
      >
        ✓
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>
        Payment received
      </h1>
      <p style={{ fontSize: 15, color: '#a8a8b8', marginTop: 12, textAlign: 'center', maxWidth: 320 }}>
        Thanks — please return to the counter to collect your order.
      </p>
      <p style={{ fontSize: 12, color: '#555', marginTop: 32 }}>You can close this window.</p>
    </div>
  );
}
