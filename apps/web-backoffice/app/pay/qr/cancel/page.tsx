export const dynamic = 'force-dynamic';

export default function QrPayCancelPage() {
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
          background: '#374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          marginBottom: 28,
        }}
        aria-hidden
      >
        ✕
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>
        Payment cancelled
      </h1>
      <p style={{ fontSize: 15, color: '#a8a8b8', marginTop: 12, textAlign: 'center', maxWidth: 320 }}>
        No charge was made. Speak to the counter staff to try another payment method.
      </p>
      <p style={{ fontSize: 12, color: '#555', marginTop: 32 }}>You can close this window.</p>
    </div>
  );
}
