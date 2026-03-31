import Link from 'next/link';
import { KeyRound, Shield, CheckCircle, Lock, RefreshCw } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

const scopes = [
  { scope: 'catalog:read', access: 'Read', description: 'Read products, categories, modifiers, and price lists.' },
  { scope: 'catalog:write', access: 'Write', description: 'Create and update products, categories, and price lists.' },
  { scope: 'orders:read', access: 'Read', description: 'List and retrieve orders and line items.' },
  { scope: 'orders:write', access: 'Write', description: 'Create orders, update status, initiate refunds.' },
  { scope: 'customers:read', access: 'Read', description: 'Search and retrieve customer profiles.' },
  { scope: 'customers:write', access: 'Write', description: 'Create and update customer records.' },
  { scope: 'loyalty:read', access: 'Read', description: 'View programs, members, and point balances.' },
  { scope: 'loyalty:write', access: 'Write', description: 'Accrue and redeem loyalty points.' },
  { scope: 'payments:read', access: 'Read', description: 'View payment records and methods.' },
  { scope: 'payments:write', access: 'Write', description: 'Create payment intents, capture, and void.' },
  { scope: 'inventory:read', access: 'Read', description: 'Read stock levels, movements, and alerts.' },
  { scope: 'inventory:write', access: 'Write', description: 'Adjust stock and create transfers.' },
  { scope: 'reports:read', access: 'Read', description: 'Access sales, inventory, and financial reports.' },
  { scope: 'webhooks:write', access: 'Write', description: 'Register and manage webhook subscriptions.' },
  { scope: 'automations:read', access: 'Read', description: 'Read automation rules and execution history.' },
  { scope: 'automations:write', access: 'Write', description: 'Create and modify automation rules.' },
];

const steps = [
  {
    step: '1',
    title: 'Register your app',
    description: 'Create an OAuth app in the developer dashboard to receive a client_id and client_secret.',
    endpoint: null,
  },
  {
    step: '2',
    title: 'Redirect the merchant',
    description: 'Send the merchant to the ElevatedPOS authorization URL with your client_id, requested scopes, and redirect_uri.',
    endpoint: 'GET https://app.elevatedpos.com.au/oauth/authorize',
  },
  {
    step: '3',
    title: 'Merchant approves',
    description: 'The merchant reviews requested permissions on the ElevatedPOS consent screen and approves or denies.',
    endpoint: null,
  },
  {
    step: '4',
    title: 'Exchange the code',
    description: 'ElevatedPOS redirects to your redirect_uri with a code parameter. Exchange it for tokens immediately — codes expire in 60 seconds.',
    endpoint: 'POST https://api.elevatedpos.com.au/api/v1/oauth/token',
  },
  {
    step: '5',
    title: 'Access the API',
    description: 'Use the access_token as a Bearer token. It expires in 900 seconds — refresh using refresh_token before expiry.',
    endpoint: null,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OAuthPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300">OAuth Apps</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-8 h-8 text-amber-400" />
          <h1 className="text-3xl font-bold text-white">OAuth 2.0</h1>
        </div>
        <p className="text-gray-400 mb-10">
          Implement the Authorization Code flow to access the ElevatedPOS API on behalf of merchant accounts. OAuth apps can
          act on a merchant's data with the exact permissions they approve — no need to handle merchant credentials.
        </p>

        {/* ── 1. Flow Diagram ─────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-5">Authorization Code Flow</h2>

          {/* ASCII art diagram */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 overflow-x-auto">
            <pre className="text-xs text-gray-400 font-mono leading-relaxed">{`  Your App                   Auth Server                  Merchant (User)
     │                            │                               │
     │  1. Redirect to /authorize  │                               │
     │ ─────────────────────────► │                               │
     │                            │  2. Show consent screen       │
     │                            │ ─────────────────────────────►│
     │                            │                               │
     │                            │  3. Merchant approves          │
     │                            │ ◄─────────────────────────────│
     │                            │                               │
     │  4. Redirect with ?code=…  │                               │
     │ ◄───────────────────────── │                               │
     │                            │                               │
     │  5. POST /oauth/token      │                               │
     │    {code, client_secret}   │                               │
     │ ─────────────────────────► │                               │
     │                            │                               │
     │  6. {access_token,         │                               │
     │      refresh_token}        │                               │
     │ ◄───────────────────────── │                               │
     │                            │                               │
     │  7. API calls with Bearer  │                               │
     │ ─────────────────────────► │                               │`}</pre>
          </div>

          {/* Step-by-step */}
          <div className="relative">
            {steps.map((s, i) => (
              <div key={s.step} className="flex gap-4 mb-0">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {s.step}
                  </div>
                  {i < steps.length - 1 && <div className="w-px flex-1 bg-gray-800 min-h-[24px] mt-1" />}
                </div>
                <div className="pb-5 pt-1 flex-1">
                  <h3 className="text-sm font-semibold text-gray-200 mb-0.5">{s.title}</h3>
                  <p className="text-sm text-gray-500 mb-1">{s.description}</p>
                  {s.endpoint && (
                    <code className="text-xs font-mono text-indigo-300 bg-indigo-950 border border-indigo-900 px-2 py-0.5 rounded">
                      {s.endpoint}
                    </code>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. Authorization URL ─────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Authorization URL</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">{`https://app.elevatedpos.com.au/oauth/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fyourapp.com%2Fcallback
  &scope=catalog%3Aread+orders%3Aread+customers%3Awrite
  &state=RANDOM_CSRF_STATE_TOKEN`}</pre>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { param: 'response_type', value: 'code', required: true, note: 'Always "code" for Authorization Code flow.' },
              { param: 'client_id', value: 'YOUR_CLIENT_ID', required: true, note: 'From your registered OAuth app.' },
              { param: 'redirect_uri', value: 'https://yourapp.com/callback', required: true, note: 'Must match a registered URI exactly.' },
              { param: 'scope', value: 'catalog:read orders:read', required: true, note: 'Space-separated list of requested scopes.' },
              { param: 'state', value: 'random_string', required: true, note: 'CSRF protection token. Verify on callback to prevent CSRF attacks.' },
            ].map((p) => (
              <div key={p.param} className="flex gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                <code className="font-mono text-amber-300 text-xs w-32 flex-shrink-0">{p.param}</code>
                <code className="font-mono text-gray-400 text-xs flex-1 min-w-0 truncate">{p.value}</code>
                <span className="text-xs text-gray-500 flex-shrink-0 max-w-[200px] text-right">{p.note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. Token Exchange ────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Token Exchange</h2>

          {/* Exchange code */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-500 mb-2 font-mono">Node.js — exchange authorization code for tokens</p>
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`async function exchangeCodeForTokens(code: string) {
  const response = await fetch('https://api.elevatedpos.com.au/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.ELEVATEDPOS_CLIENT_ID,
      client_secret: process.env.ELEVATEDPOS_CLIENT_SECRET,
      redirect_uri: 'https://yourapp.com/callback',
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(\`Token exchange failed: \${err.error_description}\`);
  }

  return response.json() as Promise<TokenResponse>;
}`}</pre>
          </div>

          {/* Refresh token */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-500 mb-2 font-mono">Node.js — refresh an expired access token</p>
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://api.elevatedpos.com.au/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.ELEVATEDPOS_CLIENT_ID,
      client_secret: process.env.ELEVATEDPOS_CLIENT_SECRET,
    }),
  });

  if (!response.ok) throw new Error('Failed to refresh token — re-authorize required');
  return response.json() as Promise<TokenResponse>;
}`}</pre>
          </div>

          {/* Token response shape */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-2 font-mono">Token response format</p>
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`interface TokenResponse {
  access_token: string;    // Bearer token for API requests
  refresh_token: string;   // Use to obtain a new access_token
  token_type: 'Bearer';
  expires_in: 900;         // Seconds until access_token expires (15 min)
  scope: string;           // Approved scopes (may differ from requested)
  org_id: string;          // The merchant's organisation ID
}

// Example JSON response:
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "catalog:read orders:read customers:write",
  "org_id": "org_01HXXXXXXXXXXXXXXXX"
}`}</pre>
          </div>
        </section>

        {/* ── 4. Scopes Reference ──────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Scopes Reference</h2>
          <p className="text-gray-400 text-sm mb-4">
            Request only the scopes your integration needs. Merchants are more likely to approve minimal permission sets.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Scope</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Access</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {scopes.map((s) => (
                  <tr key={s.scope} className="hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <code className="font-mono text-indigo-300 text-xs">{s.scope}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                        s.access === 'Read'
                          ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50'
                          : 'bg-sky-900/40 text-sky-300 border-sky-800/50'
                      }`}>
                        {s.access}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 5. Token Revocation ─────────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-bold text-white">Token Revocation</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Tokens can be revoked by the merchant (via the ElevatedPOS dashboard) or programmatically by your app:
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`// Revoke a token (access or refresh)
await fetch('https://api.elevatedpos.com.au/api/v1/oauth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: accessTokenOrRefreshToken,
    client_id: process.env.ELEVATEDPOS_CLIENT_ID,
    client_secret: process.env.ELEVATEDPOS_CLIENT_SECRET,
  }),
});
// Returns 200 OK on success (even if token was already expired)`}</pre>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Revoking an access token immediately invalidates it. Revoking a refresh token invalidates all access
            tokens derived from it.
          </p>
        </section>

        {/* ── 6. Token Lifecycle ───────────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Token Lifecycle</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: 'Access Token',
                duration: '15 minutes',
                detail: 'Short-lived. Include as Authorization: Bearer <token> on every API request.',
                color: 'border-emerald-800/50 bg-emerald-950/20',
                textColor: 'text-emerald-300',
              },
              {
                label: 'Refresh Token',
                duration: '30 days',
                detail: 'Long-lived. Use to obtain a new access token. Rotating — each use issues a new refresh token.',
                color: 'border-sky-800/50 bg-sky-950/20',
                textColor: 'text-sky-300',
              },
              {
                label: 'Authorization Code',
                duration: '60 seconds',
                detail: 'One-time use. Exchange immediately after receiving. Codes are invalidated after first use.',
                color: 'border-amber-800/50 bg-amber-950/20',
                textColor: 'text-amber-300',
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border p-4 ${item.color}`}>
                <p className={`text-sm font-bold mb-1 ${item.textColor}`}>{item.label}</p>
                <p className="text-lg font-bold text-white mb-2">{item.duration}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. Security Best Practices ───────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Security Best Practices</h2>
          </div>
          <div className="space-y-3">
            {[
              {
                title: 'Keep client_secret server-side only',
                detail: 'Never expose your client_secret in frontend JavaScript, mobile binaries, or public repositories. It should only live in server-side environment variables.',
              },
              {
                title: 'Always validate the state parameter',
                detail: 'Generate a cryptographically random state value before redirecting. Verify it matches on callback. This prevents CSRF attacks where a malicious site tricks a user into authorizing your app.',
              },
              {
                title: 'Request minimal scopes',
                detail: 'Request only the scopes your integration actually needs. Merchants are more likely to approve minimal permissions, and a narrower token minimises damage if compromised.',
              },
              {
                title: 'Implement PKCE for public clients',
                detail: 'For mobile apps and SPAs where client_secret cannot be kept secret, implement PKCE (Proof Key for Code Exchange, RFC 7636). Generate a code_verifier and send its SHA256 hash as code_challenge.',
              },
              {
                title: 'Rotate refresh tokens on every use',
                detail: 'ElevatedPOS issues a new refresh token each time you use one. Always store and use the latest refresh token. If a previous refresh token is presented, ElevatedPOS will revoke the entire token family.',
              },
              {
                title: 'Store tokens encrypted at rest',
                detail: 'Encrypt stored access and refresh tokens using AES-256-GCM or a KMS-managed key. Never store tokens in plaintext in your database.',
              },
              {
                title: 'Handle merchant-initiated revocation gracefully',
                detail: 'Merchants can disconnect your app at any time from their dashboard. Handle 401 responses from the API by detecting invalid_grant errors and re-initiating the OAuth flow.',
              },
            ].map(({ title, detail }) => (
              <div key={title} className="flex gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
                <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-200 mb-0.5">{title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
