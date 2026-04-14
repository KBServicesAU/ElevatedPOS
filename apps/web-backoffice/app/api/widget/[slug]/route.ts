/**
 * GET /api/widget/[slug]
 *
 * Serves a self-contained JavaScript booking widget for a given org slug.
 * Merchants embed it with:
 *
 *   <div id="elevatedpos-booking"></div>
 *   <script src="https://app.elevatedpos.com.au/api/widget/MY-SLUG"></script>
 *
 * The widget:
 *  - Fetches org settings (colors, deposit config) from the public API
 *  - Renders a multi-step booking form in vanilla JS (no React dependency)
 *  - Integrates Stripe.js for deposit payment collection
 *  - Works for both restaurant reservations and service/appointment bookings
 */
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['INTEGRATIONS_API_URL'] ?? 'https://api.elevatedpos.com.au';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { slug } = params;

  const js = buildWidgetScript(slug, API_BASE);

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function buildWidgetScript(slug: string, apiBase: string): string {
  return `
(function() {
  'use strict';

  const ORG_SLUG = ${JSON.stringify(slug)};
  const API = ${JSON.stringify(apiBase + '/api/v1')};
  const STRIPE_JS = 'https://js.stripe.com/v3/';

  // ── Find container ────────────────────────────────────────────────────────
  const container = document.getElementById('elevatedpos-booking');
  if (!container) { console.warn('[ElevatedPOS Widget] No #elevatedpos-booking element found'); return; }

  let settings = null;
  let stripe = null;
  let selectedDate = '';
  let selectedSlot = '';
  let currentStep = 'loading'; // loading | type | date | slot | details | deposit | confirm | done

  // ── Load Stripe.js ─────────────────────────────────────────────────────────
  function loadStripe(publishableKey, accountId, cb) {
    if (window.Stripe) { cb(window.Stripe(publishableKey, { stripeAccount: accountId })); return; }
    const s = document.createElement('script');
    s.src = STRIPE_JS; s.onload = () => cb(window.Stripe(publishableKey, { stripeAccount: accountId }));
    document.head.appendChild(s);
  }

  // ── Fetch settings ─────────────────────────────────────────────────────────
  async function init() {
    try {
      const r = await fetch(API + '/reservations/public/' + ORG_SLUG + '/settings');
      if (!r.ok) { renderError('Booking is not available at this time.'); return; }
      settings = await r.json();
      renderStep('type');
    } catch(e) {
      renderError('Unable to load booking form. Please try again later.');
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function primaryColor() { return (settings && settings.widgetPrimaryColor) || '#6366f1'; }

  function baseStyles() {
    return \`
      #epb-widget *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #epb-widget{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;max-width:480px;margin:0 auto}
      #epb-widget h2{font-size:20px;font-weight:700;color:#111;margin:0 0 4px}
      #epb-widget p.sub{font-size:14px;color:#6b7280;margin:0 0 20px}
      #epb-widget .btn{display:inline-block;background:\${primaryColor()};color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-top:12px}
      #epb-widget .btn:disabled{opacity:0.5;cursor:not-allowed}
      #epb-widget .btn-secondary{background:#f3f4f6;color:#374151}
      #epb-widget input,#epb-widget select{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:12px;outline:none}
      #epb-widget input:focus,#epb-widget select:focus{border-color:\${primaryColor()}}
      #epb-widget .type-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
      #epb-widget .type-card{border:2px solid #e5e7eb;border-radius:10px;padding:16px;cursor:pointer;text-align:center;transition:border-color .2s}
      #epb-widget .type-card:hover,.type-card.selected{border-color:\${primaryColor()};background:\${primaryColor()}10}
      #epb-widget .type-card .icon{font-size:28px;margin-bottom:6px}
      #epb-widget .type-card .label{font-size:14px;font-weight:600;color:#111}
      #epb-widget .slot-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
      #epb-widget .slot{padding:8px 14px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;color:#374151}
      #epb-widget .slot:hover,.slot.selected{background:\${primaryColor()};color:#fff;border-color:\${primaryColor()}}
      #epb-widget .error{background:#fee2e2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:14px;margin-bottom:12px}
      #epb-widget .success{background:#d1fae5;color:#059669;padding:16px;border-radius:8px;text-align:center}
      #epb-widget label{font-size:13px;font-weight:500;color:#374151;display:block;margin-bottom:4px}
      #epb-widget .field{margin-bottom:12px}
    \`;
  }

  function renderError(msg) {
    container.innerHTML = '<div id="epb-widget"><style>' + baseStyles() + '</style><div class="error">' + msg + '</div></div>';
  }

  let bookingType = '';

  function renderStep(step) {
    currentStep = step;
    const color = primaryColor();
    const title = (settings && settings.widgetTitle) || 'Make a Booking';
    const orgName = (settings && settings.orgName) || '';

    let html = '<div id="epb-widget"><style>' + baseStyles() + '</style>';
    html += '<h2>' + escHtml(title) + '</h2>';
    html += '<p class="sub">' + escHtml(orgName) + '</p>';

    if (step === 'type') {
      const showRestaurant = settings && settings.restaurantEnabled;
      const showService = settings && settings.serviceEnabled;
      if (showRestaurant && showService) {
        html += '<div class="type-grid">';
        html += '<div class="type-card" onclick="epbSelectType(\\'restaurant\\')"><div class="icon">🍽️</div><div class="label">Table Reservation</div></div>';
        html += '<div class="type-card" onclick="epbSelectType(\\'service\\')"><div class="icon">✂️</div><div class="label">Book Appointment</div></div>';
        html += '</div>';
      } else {
        bookingType = showRestaurant ? 'restaurant' : 'service';
        renderStep('date');
        return;
      }
    } else if (step === 'date') {
      html += '<div class="field"><label>Select Date</label>';
      html += '<input type="date" id="epb-date" min="' + minDate() + '" max="' + maxDate() + '" value="' + selectedDate + '" onchange="epbDateChange(this.value)">';
      html += '</div>';
      if (bookingType === 'restaurant') {
        html += '<div class="field"><label>Party Size</label><select id="epb-party">';
        for (let i = 1; i <= 20; i++) html += '<option value="' + i + '">' + i + ' ' + (i === 1 ? 'person' : 'people') + '</option>';
        html += '</select></div>';
      }
      html += '<button class="btn" onclick="epbLoadSlots()" id="epb-date-btn">Check Availability →</button>';
    } else if (step === 'slots') {
      html += '<div class="field"><label>Available times on ' + escHtml(selectedDate) + '</label>';
      html += '<div id="epb-slot-container"><div class="slot-grid" id="epb-slots">Loading…</div></div></div>';
      html += '<button class="btn btn-secondary" onclick="epbStep(\\'date\\')">← Change Date</button>';
    } else if (step === 'details') {
      html += '<div class="field"><label>Full Name *</label><input id="epb-name" placeholder="Jane Smith" required></div>';
      html += '<div class="field"><label>Email Address *</label><input id="epb-email" type="email" placeholder="jane@email.com" required></div>';
      html += '<div class="field"><label>Phone</label><input id="epb-phone" type="tel" placeholder="0412 345 678"></div>';
      html += '<div class="field"><label>Notes (optional)</label><input id="epb-notes" placeholder="Any special requests…"></div>';
      html += '<p style="font-size:13px;color:#6b7280;margin-bottom:8px">Booking for <strong>' + escHtml(selectedSlot.replace('T', ' at ').slice(0, 19)) + '</strong></p>';
      const depositRequired = bookingType === 'restaurant' ? settings?.restaurantDepositRequired : settings?.serviceDepositRequired;
      const depositCents = bookingType === 'restaurant' ? settings?.restaurantDepositCents : settings?.serviceDepositCents;
      if (depositRequired && depositCents > 0) {
        html += '<p style="font-size:13px;color:#374151;background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:8px">A deposit of <strong>$' + (depositCents/100).toFixed(2) + '</strong> is required to confirm your booking.</p>';
      }
      html += '<button class="btn" onclick="epbSubmitDetails()" id="epb-details-btn">Continue →</button>';
      html += '<button class="btn btn-secondary" onclick="epbStep(\\'slots\\')">← Back</button>';
    } else if (step === 'deposit') {
      html += '<p style="font-size:14px;color:#374151;margin-bottom:16px">Complete your deposit payment to confirm this booking.</p>';
      html += '<div id="epb-payment-element"></div>';
      html += '<div id="epb-deposit-error"></div>';
      html += '<button class="btn" onclick="epbConfirmDeposit()" id="epb-deposit-btn">Pay Deposit →</button>';
    } else if (step === 'done') {
      html += '<div class="success"><div style="font-size:32px;margin-bottom:8px">✓</div>';
      html += '<strong>Booking Confirmed!</strong><br>';
      html += '<p style="font-size:14px;margin:8px 0 0">A confirmation has been sent to your email.</p></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    if (step === 'slots') loadSlots();
    if (step === 'deposit') mountPaymentElement();
  }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
  function minDate() { return new Date().toISOString().slice(0,10); }
  function maxDate() { const d = new Date(); d.setDate(d.getDate() + ((settings && settings.advanceBookingDays) || 60)); return d.toISOString().slice(0,10); }

  async function loadSlots() {
    const el = document.getElementById('epb-slots');
    if (!el) return;
    try {
      const r = await fetch(API + '/reservations/public/' + ORG_SLUG + '/availability?date=' + selectedDate);
      const data = await r.json();
      const slots = data.slots || [];
      if (slots.length === 0) { el.innerHTML = '<p style="color:#6b7280;font-size:14px">No available times on this date.</p>'; return; }
      el.innerHTML = slots.map(function(s) {
        const t = s.slice(11, 16);
        return '<div class="slot" onclick="epbSelectSlot(\'' + s + '\',this)">' + t + '</div>';
      }).join('');
    } catch(e) {
      if (el) el.innerHTML = '<p style="color:#dc2626;font-size:14px">Unable to load availability. Please try again.</p>';
    }
  }

  let reservationId = null;
  let clientSecret = null;
  let stripePublishableKey = null;
  let stripeAccountId = null;
  let paymentElements = null;

  async function submitDetails(name, email, phone, notes) {
    const partyEl = document.getElementById('epb-party');
    const partySize = partyEl ? parseInt(partyEl.value) : undefined;
    const body = {
      bookingType: bookingType,
      customerName: name, customerEmail: email,
      customerPhone: phone || undefined,
      scheduledAt: selectedSlot,
      notes: notes || undefined,
    };
    if (partySize) body.partySize = partySize;

    const r = await fetch(API + '/reservations/public/' + ORG_SLUG, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function mountPaymentElement() {
    if (!stripe || !clientSecret) return;
    const elements = stripe.elements({ clientSecret: clientSecret });
    paymentElements = elements;
    const pe = elements.create('payment');
    const mount = document.getElementById('epb-payment-element');
    if (mount) pe.mount(mount);
  }

  // ── Global handlers (called from inline onclick) ───────────────────────────
  window.epbSelectType = function(type) { bookingType = type; renderStep('date'); };
  window.epbStep = function(step) { renderStep(step); };
  window.epbDateChange = function(val) { selectedDate = val; };
  window.epbLoadSlots = function() {
    if (!selectedDate) return;
    renderStep('slots');
  };
  window.epbSelectSlot = function(slot, el) {
    selectedSlot = slot;
    document.querySelectorAll('.slot').forEach(function(s) { s.classList.remove('selected'); });
    el.classList.add('selected');
    setTimeout(function() { renderStep('details'); }, 300);
  };
  window.epbSubmitDetails = async function() {
    const nameEl = document.getElementById('epb-name');
    const emailEl = document.getElementById('epb-email');
    const phoneEl = document.getElementById('epb-phone');
    const notesEl = document.getElementById('epb-notes');
    if (!nameEl.value.trim() || !emailEl.value.trim()) {
      alert('Please enter your name and email address.');
      return;
    }
    const btn = document.getElementById('epb-details-btn');
    btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const data = await submitDetails(nameEl.value.trim(), emailEl.value.trim(), phoneEl ? phoneEl.value : '', notesEl ? notesEl.value : '');
      reservationId = data.reservationId;
      if (data.depositRequired && data.clientSecret) {
        clientSecret = data.clientSecret;
        stripePublishableKey = data.stripePublishableKey;
        stripeAccountId = data.stripeAccountId;
        loadStripe(stripePublishableKey, stripeAccountId, function(s) { stripe = s; renderStep('deposit'); });
      } else {
        renderStep('done');
      }
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Continue →';
      const errEl = document.getElementById('epb-deposit-error');
      if (errEl) errEl.innerHTML = '<div class="error">Something went wrong. Please try again.</div>';
    }
  };
  window.epbConfirmDeposit = async function() {
    if (!stripe || !paymentElements) return;
    const btn = document.getElementById('epb-deposit-btn');
    const errEl = document.getElementById('epb-deposit-error');
    btn.disabled = true; btn.textContent = 'Processing…';
    const { error } = await stripe.confirmPayment({
      elements: paymentElements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      btn.disabled = false; btn.textContent = 'Pay Deposit →';
      errEl.innerHTML = '<div class="error">' + (error.message || 'Payment failed. Please try again.') + '</div>';
    } else {
      renderStep('done');
    }
  };

  // ── Kick off ───────────────────────────────────────────────────────────────
  init();
})();
`;
}
