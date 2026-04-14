'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  'Business Info',
  'Your Account',
  'Location',
  'Staff',
  'Devices & Add-ons',
  'Payment Setup',
  'Subscribe',
] as const;

const INDUSTRIES = [
  { id: 'cafe',          label: 'Café',                  emoji: '☕', desc: 'Coffee shop, bakery' },
  { id: 'restaurant',    label: 'Restaurant',            emoji: '🍽️', desc: 'Dine-in, reservations' },
  { id: 'bar',           label: 'Bar / Pub',             emoji: '🍺', desc: 'Bar, nightclub' },
  { id: 'quick_service', label: 'Quick Service',         emoji: '🥗', desc: 'Takeaway, food court' },
  { id: 'retail',        label: 'Retail',                emoji: '🛍️', desc: 'General merchandise' },
  { id: 'fashion',       label: 'Fashion / Apparel',     emoji: '👗', desc: 'Clothing, accessories' },
  { id: 'grocery',       label: 'Grocery / Market',      emoji: '🥑', desc: 'Supermarket, deli' },
  { id: 'salon',         label: 'Hair Salon',            emoji: '💇', desc: 'Salon, spa' },
  { id: 'barber',        label: 'Barbershop',            emoji: '💈', desc: 'Barbershop' },
  { id: 'gym',           label: 'Gym / Fitness',         emoji: '🏋️', desc: 'Gym, yoga, personal training' },
  { id: 'services',      label: 'Professional Services', emoji: '🔧', desc: 'Trades, clinics, etc.' },
  { id: 'other',         label: 'Other',                 emoji: '🏪', desc: 'Everything else' },
];

const DEVICE_PRICES: Record<string, { label: string; cents: number; desc: string }> = {
  pos:     { label: 'POS Terminal',     cents: 4900, desc: 'Full point-of-sale, card payments' },
  kds:     { label: 'Kitchen Display',  cents: 1900, desc: 'Order display for kitchen staff' },
  kiosk:   { label: 'Self-Order Kiosk', cents: 4900, desc: 'Customer-facing self-order screen' },
  display: { label: 'Customer Display', cents: 1900, desc: 'Facing display showing order total' },
};

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

// ── Stripe ────────────────────────────────────────────────────────────────────

const stripePromise = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
  ? loadStripe(process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'])
  : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceQtys { pos: number; kds: number; kiosk: number; display: number }

interface FormState {
  businessName: string; abn: string; phone: string;
  street: string; suburb: string; state: string; postcode: string;
  websiteUrl: string; industry: string;
  firstName: string; lastName: string; email: string;
  password: string; confirmPassword: string;
  locationName: string; locAddress: string; locSuburb: string;
  locState: string; locPostcode: string; locPhone: string; locTimezone: string;
  devices: DeviceQtys; websiteAddon: boolean; customDomainAddon: boolean;
}

interface StaffMember { firstName: string; lastName: string; email: string; role: string; pin: string }

// ── Wizard ────────────────────────────────────────────────────────────────────

function SignupWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const refCode = params?.get('ref') ?? '';

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onboardingToken, setOnboardingToken] = useState('');
  const [orgId, setOrgId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [form, setForm] = useState<FormState>({
    businessName: '', abn: '', phone: '',
    street: '', suburb: '', state: 'NSW', postcode: '', websiteUrl: '', industry: '',
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
    locationName: '', locAddress: '', locSuburb: '', locState: 'NSW', locPostcode: '', locPhone: '',
    locTimezone: 'Australia/Sydney',
    devices: { pos: 1, kds: 0, kiosk: 0, display: 0 },
    websiteAddon: false, customDomainAddon: false,
  });

  const [staff, setStaff] = useState<StaffMember[]>([
    { firstName: '', lastName: '', email: '', role: 'staff', pin: '' },
  ]);

  const set = (key: keyof FormState, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const monthlyTotal = (
    form.devices.pos * 4900 + form.devices.kds * 1900 +
    form.devices.kiosk * 4900 + form.devices.display * 1900 +
    (form.websiteAddon ? 1500 : 0) + (form.customDomainAddon ? 500 : 0)
  ) / 100;

  async function api(path: string, body: unknown, token?: string) {
    const res = await fetch(`/api/proxy/organisations/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ?? onboardingToken ? { Authorization: `Bearer ${token ?? onboardingToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error((data['error'] as string) ?? 'Something went wrong');
    return data;
  }

  // Handle return from Stripe Connect redirect (?step=6&token=...)
  useEffect(() => {
    const stepParam = params?.get('step') ?? null;
    const tokenParam = params?.get('token') ?? null;
    if (stepParam === '6' && tokenParam) {
      const tok = decodeURIComponent(tokenParam);
      setOnboardingToken(tok);
      setStep(5);
      fetch('/api/proxy/organisations/onboard/connect-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: '{}',
      }).then(async (r) => {
        if (r.ok) {
          const d = await r.json() as { onboardingToken?: string };
          if (d.onboardingToken) setOnboardingToken(d.onboardingToken);
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function next() {
    setError('');
    setLoading(true);
    try {
      if (step === 0) {
        const d = await api('onboard/start', {
          businessName: form.businessName, abn: form.abn, phone: form.phone,
          businessAddress: { street: form.street, suburb: form.suburb, state: form.state, postcode: form.postcode },
          websiteUrl: form.websiteUrl || undefined, industry: form.industry,
          billingEmail: form.email || `${Date.now()}@placeholder.invalid`,
          refCode: refCode || undefined,
        }, '');
        setOnboardingToken(d['onboardingToken'] as string);
        setOrgId(d['orgId'] as string);
      } else if (step === 1) {
        const d = await api('onboard/owner', {
          firstName: form.firstName, lastName: form.lastName, email: form.email,
          password: form.password, confirmPassword: form.confirmPassword,
        });
        setOnboardingToken(d['onboardingToken'] as string);
      } else if (step === 2) {
        const d = await api('onboard/location', {
          name: form.locationName, address: form.locAddress, suburb: form.locSuburb,
          state: form.locState, postcode: form.locPostcode,
          phone: form.locPhone || undefined, timezone: form.locTimezone,
        });
        setOnboardingToken(d['onboardingToken'] as string);
      } else if (step === 3) {
        const d = await api('onboard/staff', { staff });
        setOnboardingToken(d['onboardingToken'] as string);
      } else if (step === 4) {
        const d = await api('onboard/devices', {
          pos: form.devices.pos, kds: form.devices.kds,
          kiosk: form.devices.kiosk, display: form.devices.display,
          websiteAddon: form.websiteAddon, customDomainAddon: form.customDomainAddon,
        });
        const tok = d['onboardingToken'] as string;
        setOnboardingToken(tok);
        // Redirect to Stripe Connect
        const returnUrl = `${window.location.origin}/signup?step=6&token=${encodeURIComponent(tok)}`;
        const refreshUrl = `${window.location.origin}/signup?step=5&token=${encodeURIComponent(tok)}`;
        const res = await fetch('/api/proxy/connect/platform-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ orgId, returnUrl, refreshUrl }),
        });
        const connectData = await res.json() as { url?: string };
        if (connectData.url) { window.location.href = connectData.url; return; }
      } else if (step === 5) {
        // Create the Stripe subscription and get clientSecret for PaymentElement
        const res = await fetch('/api/proxy/billing/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${onboardingToken}` },
          body: JSON.stringify({
            pos: form.devices.pos, kds: form.devices.kds,
            kiosk: form.devices.kiosk, display: form.devices.display,
            websiteAddon: form.websiteAddon, customDomainAddon: form.customDomainAddon,
          }),
        });
        const data = await res.json() as { data?: { clientSecret?: string } };
        setClientSecret(data.data?.clientSecret ?? '');
      }
      setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const canNext = (() => {
    if (step === 0) return form.businessName.length >= 2 && form.abn.length === 11 && form.phone.length >= 8
      && form.street && form.suburb && form.state && form.postcode && form.industry;
    if (step === 1) return form.firstName && form.lastName && form.email
      && form.password.length >= 8 && form.password === form.confirmPassword;
    if (step === 2) return form.locationName && form.locAddress && form.locSuburb && form.locPostcode;
    if (step === 3) return staff.length > 0 && staff.every((s) => s.firstName && s.lastName && s.email && s.pin.length === 4);
    if (step === 4) return form.devices.pos + form.devices.kds + form.devices.kiosk + form.devices.display > 0;
    return true;
  })();

  const btnLabel = loading ? 'Please wait…'
    : step === 4 ? 'Continue to Payment Setup →'
    : step === 5 ? 'Set Up Subscription →'
    : 'Continue →';

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 py-12">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-lg">E</span>
          </div>
          <span className="text-white font-black text-2xl tracking-widest">ElevatedPOS</span>
        </div>
        <p className="text-gray-500 text-sm">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
      </div>

      {/* Step pills */}
      <div className="flex items-center gap-1 mb-8 flex-wrap justify-center">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <div title={label} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${i < step ? 'bg-indigo-600 text-white' : i === step ? 'bg-indigo-500 text-white ring-2 ring-indigo-400/40' : 'bg-[#1e1e2e] text-gray-600'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < step ? 'bg-indigo-600' : 'bg-[#1e1e2e]'}`} />}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">
        <h2 className="text-xl font-bold text-white mb-1">{STEPS[step]}</h2>
        <p className="text-gray-500 text-sm mb-6">{STEP_SUBTITLES[step]}</p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
        )}

        {step === 0 && <StepBusinessInfo form={form} set={set} />}
        {step === 1 && <StepOwnerAccount form={form} set={set} />}
        {step === 2 && <StepLocation form={form} set={set} />}
        {step === 3 && <StepStaff staff={staff} setStaff={setStaff} />}
        {step === 4 && <StepDevices form={form} set={set} monthlyTotal={monthlyTotal} />}
        {step === 5 && <StepConnectInfo />}
        {step === 6 && (
          clientSecret && stripePromise
            ? <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#6366f1' } } }}>
                <StepSubscribe monthlyTotal={monthlyTotal} onboardingToken={onboardingToken}
                  onComplete={() => router.push('/login?registered=true')} />
              </Elements>
            : <div className="text-center py-8 text-gray-400">Setting up your subscription…</div>
        )}

        {step < 6 && (
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-[#1e1e2e]">
            {step > 0
              ? <button onClick={() => setStep((s) => s - 1)} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Back</button>
              : <div />}
            <button onClick={next} disabled={!canNext || loading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors">
              {btnLabel}
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-gray-600 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Sign in</Link>
      </p>
    </div>
  );
}

// ── Step subtitles ─────────────────────────────────────────────────────────────
const STEP_SUBTITLES = [
  'Tell us about your business — all fields are required',
  'Create your owner login credentials',
  'Where is your primary location?',
  'Add your team members (minimum one required)',
  'Select your devices and calculate your monthly cost',
  'Connect your bank account to receive payouts via ElevatedPOS Pay',
  'Review and confirm your subscription to get started',
];

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const cls = 'w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors';

function FInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cls} {...props} />;
}
function FSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cls} {...props} />;
}
function Label({ text, required }: { text: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-gray-300 mb-1.5">{text}{required && <span className="text-red-400 ml-0.5">*</span>}</label>;
}
function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div className={`grid gap-4 mb-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>;
}

// ── Step 1: Business Info ──────────────────────────────────────────────────────
function StepBusinessInfo({ form, set }: { form: FormState; set: (k: keyof FormState, v: unknown) => void }) {
  return (
    <div>
      <div className="mb-4">
        <Label text="Business Name" required />
        <FInput value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="e.g. The Corner Café" />
      </div>
      <Grid>
        <div>
          <Label text="ABN" required />
          <FInput value={form.abn} onChange={(e) => set('abn', e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="12 345 678 901" maxLength={11} />
        </div>
        <div>
          <Label text="Business Phone" required />
          <FInput value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0412 345 678" type="tel" />
        </div>
      </Grid>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-6">Business Address</p>
      <div className="mb-4">
        <Label text="Street Address" required />
        <FInput value={form.street} onChange={(e) => set('street', e.target.value)} placeholder="123 Main Street" />
      </div>
      <Grid cols={3}>
        <div>
          <Label text="Suburb" required />
          <FInput value={form.suburb} onChange={(e) => set('suburb', e.target.value)} placeholder="Sydney" />
        </div>
        <div>
          <Label text="State" required />
          <FSelect value={form.state} onChange={(e) => set('state', e.target.value)}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </FSelect>
        </div>
        <div>
          <Label text="Postcode" required />
          <FInput value={form.postcode} onChange={(e) => set('postcode', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2000" maxLength={4} />
        </div>
      </Grid>

      <div className="mb-6">
        <Label text="Website URL (optional)" />
        <FInput value={form.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} placeholder="https://yourcafe.com.au" type="url" />
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Industry</p>
      <div className="grid grid-cols-3 gap-2">
        {INDUSTRIES.map((ind) => (
          <button key={ind.id} type="button" onClick={() => set('industry', ind.id)}
            className={`p-3 rounded-xl border text-left transition-colors
              ${form.industry === ind.id
                ? 'border-indigo-500 bg-indigo-600/20 text-white'
                : 'border-[#2a2a3e] bg-[#0d0d14] text-gray-400 hover:border-indigo-500/50'}`}>
            <div className="text-xl mb-1">{ind.emoji}</div>
            <div className="text-xs font-semibold leading-tight">{ind.label}</div>
            <div className="text-xs text-gray-600 mt-0.5">{ind.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Owner Account ──────────────────────────────────────────────────────
function StepOwnerAccount({ form, set }: { form: FormState; set: (k: keyof FormState, v: unknown) => void }) {
  const mismatch = form.password && form.confirmPassword && form.password !== form.confirmPassword;
  return (
    <div>
      <Grid>
        <div><Label text="First Name" required /><FInput value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jane" /></div>
        <div><Label text="Last Name" required /><FInput value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Smith" /></div>
      </Grid>
      <div className="mb-4"><Label text="Email Address" required /><FInput value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@mycafe.com.au" type="email" /></div>
      <Grid>
        <div><Label text="Password" required /><FInput value={form.password} onChange={(e) => set('password', e.target.value)} type="password" placeholder="Min. 8 characters" /></div>
        <div><Label text="Confirm Password" required /><FInput value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} type="password" placeholder="Repeat password" /></div>
      </Grid>
      {mismatch && <p className="text-red-400 text-xs -mt-3 mb-3">Passwords don&apos;t match</p>}
      <div className="bg-[#1a1a2e] rounded-xl p-4 text-sm text-gray-400 mt-2">
        <p className="font-semibold text-gray-300 mb-1">This is your owner account</p>
        <p>Staff members get their own logins and PINs in the next step.</p>
      </div>
    </div>
  );
}

// ── Step 3: Location ───────────────────────────────────────────────────────────
function StepLocation({ form, set }: { form: FormState; set: (k: keyof FormState, v: unknown) => void }) {
  return (
    <div>
      <div className="mb-4"><Label text="Location Name" required /><FInput value={form.locationName} onChange={(e) => set('locationName', e.target.value)} placeholder="e.g. Main Store, CBD" /></div>
      <div className="mb-4"><Label text="Street Address" required /><FInput value={form.locAddress} onChange={(e) => set('locAddress', e.target.value)} placeholder="123 Main Street" /></div>
      <Grid cols={3}>
        <div><Label text="Suburb" required /><FInput value={form.locSuburb} onChange={(e) => set('locSuburb', e.target.value)} placeholder="Sydney" /></div>
        <div>
          <Label text="State" required />
          <FSelect value={form.locState} onChange={(e) => set('locState', e.target.value)}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </FSelect>
        </div>
        <div><Label text="Postcode" required /><FInput value={form.locPostcode} onChange={(e) => set('locPostcode', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2000" /></div>
      </Grid>
      <Grid>
        <div><Label text="Phone (optional)" /><FInput value={form.locPhone} onChange={(e) => set('locPhone', e.target.value)} placeholder="02 9XXX XXXX" /></div>
        <div>
          <Label text="Timezone" required />
          <FSelect value={form.locTimezone} onChange={(e) => set('locTimezone', e.target.value)}>
            <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
            <option value="Australia/Melbourne">Australia/Melbourne</option>
            <option value="Australia/Brisbane">Australia/Brisbane</option>
            <option value="Australia/Adelaide">Australia/Adelaide (ACST)</option>
            <option value="Australia/Perth">Australia/Perth (AWST)</option>
            <option value="Australia/Darwin">Australia/Darwin</option>
            <option value="Australia/Hobart">Australia/Hobart</option>
          </FSelect>
        </div>
      </Grid>
    </div>
  );
}

// ── Step 4: Staff ──────────────────────────────────────────────────────────────
function StepStaff({ staff, setStaff }: { staff: StaffMember[]; setStaff: (s: StaffMember[]) => void }) {
  function update(i: number, k: keyof StaffMember, v: string) {
    const next = [...staff]; next[i] = { ...next[i]!, [k]: v }; setStaff(next);
  }
  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">Staff members use a 4-digit PIN to clock in and process transactions.</p>
      <div className="space-y-4">
        {staff.map((m, i) => (
          <div key={i} className="bg-[#0d0d14] border border-[#2a2a3e] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member {i + 1}</span>
              {staff.length > 1 && (
                <button onClick={() => setStaff(staff.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-400 text-xs">Remove</button>
              )}
            </div>
            <Grid>
              <div><Label text="First Name" required /><FInput value={m.firstName} onChange={(e) => update(i, 'firstName', e.target.value)} placeholder="First name" /></div>
              <div><Label text="Last Name" required /><FInput value={m.lastName} onChange={(e) => update(i, 'lastName', e.target.value)} placeholder="Last name" /></div>
            </Grid>
            <Grid>
              <div><Label text="Email" required /><FInput value={m.email} onChange={(e) => update(i, 'email', e.target.value)} placeholder="staff@mybiz.com" type="email" /></div>
              <div>
                <Label text="Role" required />
                <FSelect value={m.role} onChange={(e) => update(i, 'role', e.target.value)}>
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="staff">Staff</option>
                </FSelect>
              </div>
            </Grid>
            <div>
              <Label text="4-Digit PIN" required />
              <FInput value={m.pin} onChange={(e) => update(i, 'pin', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 1234" maxLength={4} type="password" />
              <p className="text-xs text-gray-600 mt-1">Used to unlock the POS and clock in</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setStaff([...staff, { firstName: '', lastName: '', email: '', role: 'staff', pin: '' }])}
        className="mt-4 w-full py-2.5 border border-dashed border-[#2a2a3e] rounded-xl text-gray-500 hover:text-gray-300 hover:border-indigo-500/50 text-sm transition-colors">
        + Add Another Staff Member
      </button>
    </div>
  );
}

// ── Step 5: Devices & Add-ons ──────────────────────────────────────────────────
function StepDevices({ form, set, monthlyTotal }: { form: FormState; set: (k: keyof FormState, v: unknown) => void; monthlyTotal: number }) {
  function adj(type: keyof DeviceQtys, delta: number) {
    set('devices', { ...form.devices, [type]: Math.max(0, form.devices[type] + delta) });
  }
  return (
    <div>
      <p className="text-sm text-gray-400 mb-5">Select how many of each device you need. Add or remove at any time from billing settings.</p>
      <div className="space-y-3 mb-6">
        {(Object.entries(DEVICE_PRICES) as [keyof DeviceQtys, { label: string; cents: number; desc: string }][]).map(([type, info]) => (
          <div key={type} className="flex items-center justify-between bg-[#0d0d14] border border-[#2a2a3e] rounded-xl p-4">
            <div>
              <p className="text-white font-semibold text-sm">{info.label}</p>
              <p className="text-gray-500 text-xs">{info.desc}</p>
              <p className="text-indigo-400 text-xs font-semibold mt-1">${(info.cents / 100).toFixed(0)}/month per device</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => adj(type, -1)} disabled={form.devices[type] === 0}
                className="w-8 h-8 rounded-lg bg-[#1e1e2e] text-white disabled:opacity-30 hover:bg-[#2a2a3e] font-bold">−</button>
              <span className="w-6 text-center text-white font-bold">{form.devices[type]}</span>
              <button onClick={() => adj(type, 1)}
                className="w-8 h-8 rounded-lg bg-[#1e1e2e] text-white hover:bg-indigo-600 font-bold">+</button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between bg-[#0d0d14] border border-[#2a2a3e] rounded-xl p-4">
          <div>
            <p className="text-white font-semibold text-sm">Dashboard</p>
            <p className="text-gray-500 text-xs">Back-office, reports, staff management</p>
            <p className="text-emerald-400 text-xs font-semibold mt-1">Always free</p>
          </div>
          <span className="text-emerald-400 font-bold text-sm">✓ Included</span>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add-ons</p>
      <div className="space-y-2 mb-6">
        {[
          { key: 'websiteAddon' as const, label: 'Website', price: '$15/mo', desc: 'Online ordering, menu, or ecommerce storefront' },
          { key: 'customDomainAddon' as const, label: 'Custom Domain', price: '$5/mo', desc: 'Use your own domain name (e.g. order.mycafe.com.au)' },
        ].map((addon) => (
          <label key={addon.key} className="flex items-center gap-4 bg-[#0d0d14] border border-[#2a2a3e] rounded-xl p-4 cursor-pointer hover:border-indigo-500/50 transition-colors">
            <input type="checkbox" checked={form[addon.key]} onChange={(e) => set(addon.key, e.target.checked)} className="w-4 h-4 accent-indigo-500" />
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">{addon.label} <span className="text-indigo-400 text-xs">{addon.price}</span></p>
              <p className="text-gray-500 text-xs">{addon.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-300 font-semibold">Monthly Total</span>
          <span className="text-white font-black text-2xl">${monthlyTotal.toFixed(2)}<span className="text-gray-500 text-sm font-normal">/mo</span></span>
        </div>
        <p className="text-gray-500 text-xs mt-1">Charged monthly · No lock-in contracts · Adjust devices any time</p>
      </div>
    </div>
  );
}

// ── Step 6: Connect Info ───────────────────────────────────────────────────────
function StepConnectInfo() {
  return (
    <div className="text-center py-4">
      <div className="text-5xl mb-4">🏦</div>
      <h3 className="text-white font-bold text-lg mb-2">Set Up Your Payout Account</h3>
      <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
        You&apos;ll be redirected to Stripe to connect your bank account. This is how ElevatedPOS Pay sends your sales directly to your bank.
      </p>
      <div className="bg-[#0d0d14] border border-[#2a2a3e] rounded-xl p-4 text-left space-y-3 mb-6">
        {[
          ['🔒', 'Bank-level encryption — ElevatedPOS never stores your bank details'],
          ['⚡', 'Same-day or next-day payouts once verified'],
          ['🇦🇺', 'Accepts Australian BSB + account number'],
          ['↩️', 'You\'ll be automatically returned here after completing Stripe setup'],
        ].map(([icon, text], i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span>{icon}</span><span className="text-gray-400">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 7: Subscribe ──────────────────────────────────────────────────────────
function StepSubscribe({ monthlyTotal, onboardingToken, onComplete }: {
  monthlyTotal: number; onboardingToken: string; onComplete: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true); setErr('');

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/login?registered=true` },
      redirect: 'if_required',
    });

    if (error) { setErr(error.message ?? 'Payment failed'); setLoading(false); return; }

    // Mark onboarding complete — get full auth JWT
    await fetch('/api/proxy/organisations/onboard/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${onboardingToken}` },
      body: '{}',
    }).then(async (r) => {
      if (r.ok) {
        const d = await r.json() as { token?: string };
        if (d.token) sessionStorage.setItem('elevatedpos_auth_token', d.token);
      }
    }).catch(() => {});

    onComplete();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-gray-300 font-semibold">Your monthly plan</span>
          <span className="text-white font-black text-xl">${monthlyTotal.toFixed(2)}<span className="text-gray-500 text-sm font-normal">/mo</span></span>
        </div>
        <p className="text-gray-500 text-xs mt-1">First charge today · Cancel or adjust any time from billing settings</p>
      </div>
      <PaymentElement />
      {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
      <button type="submit" disabled={!stripe || loading}
        className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors">
        {loading ? 'Processing…' : `Pay $${monthlyTotal.toFixed(2)}/month →`}
      </button>
      <p className="text-gray-600 text-xs text-center mt-3">Secured by Stripe · No lock-in contract</p>
    </form>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────
export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="text-gray-500">Loading…</div></div>}>
      <SignupWizard />
    </Suspense>
  );
}
