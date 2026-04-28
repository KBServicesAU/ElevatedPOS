import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ElevatedPOS (KBServices) collects, uses, stores, and discloses personal information under the Australian Privacy Act 1988 and the Australian Privacy Principles.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '28 April 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-elevatedpos-950 via-elevatedpos-900 to-elevatedpos-800 px-4 py-16 text-elevatedpos-100">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-2 text-xs text-elevatedpos-400 hover:text-elevatedpos-200"
          >
            <span aria-hidden="true">&larr;</span> Back to ElevatedPOS
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-elevatedpos-500">Legal</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-elevatedpos-400">Last updated: {LAST_UPDATED}</p>
        </div>

        <article className="rounded-2xl border border-elevatedpos-700/50 bg-elevatedpos-800/60 p-6 shadow-2xl backdrop-blur sm:p-10">
          <div className="space-y-10 text-sm leading-relaxed text-elevatedpos-200">

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">1. Who we are</h2>
              <p>
                ElevatedPOS is a software-as-a-service point-of-sale platform operated by{' '}
                <strong className="font-medium text-white">KBServices</strong> (&ldquo;ElevatedPOS&rdquo;,
                &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), an Australian business based in
                New South Wales. The Service comprises the back-office dashboard, the POS, KDS, kiosk and
                customer-display applications, related APIs, and the marketing site at{' '}
                <strong className="font-medium text-white">elevatedpos.com.au</strong>.
              </p>
              <p className="mt-3">
                We are bound by the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles
                (APPs) contained in Schedule 1 of that Act. This policy explains what personal information
                we handle, why, and how merchants and their authorised users can exercise their rights.
              </p>
              <p className="mt-3">
                ElevatedPOS is a business-to-business product. The Service is intended for use by registered
                businesses and their authorised personnel. It is not directed at individuals under the age of
                18, and we do not knowingly collect personal information directly from children.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">2. Information we collect</h2>
              <p>We collect personal and business information in the following categories:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Merchant business information</strong> &mdash;
                    business name, ABN, trading address, industry, website, billing email and contact phone.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Owner and employee accounts</strong> &mdash;
                    name, email, role, hashed password, optional staff PIN, and audit metadata such as last
                    login time and IP address.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Customer records uploaded by merchants</strong> &mdash;
                    contact details, loyalty profile, transaction history and any notes the merchant chooses
                    to store. The merchant is the data controller for these records; we host them on the
                    merchant&rsquo;s behalf.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Transaction data</strong> &mdash; orders, line
                    items, payment method type, totals, refunds, tax breakdown, terminal identifiers and
                    timestamps. We do not store full card numbers or CVV; payment instruments are tokenised
                    by Stripe.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Device and diagnostic information</strong> &mdash;
                    device type, operating system, app version, paired hardware identifiers, IP address and
                    error/diagnostic logs.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Location data</strong> &mdash; the configured
                    physical location of each merchant venue, and, where the POS or mobile app requests it,
                    coarse device location used to match transactions to a venue. Granular GPS is not
                    continuously tracked.
                  </span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">3. How we use your information</h2>
              <p>We use the information described above to:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Operate, secure, and support the ElevatedPOS Service.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Process payments and payouts via Stripe Connect, including identity verification of the
                  connected account holder where required by Stripe and Australian financial-services rules.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Send transactional emails (receipts, password resets, billing notices, security alerts) via
                  our email provider Resend.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Provide customer support, troubleshoot issues, and respond to enquiries.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Detect and prevent fraud, abuse, and unauthorised access.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Meet our legal, tax, and financial record-keeping obligations.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Improve and optimise the Service using aggregated, de-identified usage data.
                </li>
              </ul>
              <p className="mt-4">
                We do not sell personal information. We do not use personal information for third-party
                advertising. AI features (where the merchant has opted in) are described in section 4.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">4. Who we share information with</h2>
              <p>
                We disclose personal information to the following categories of recipient, only to the extent
                needed to deliver the Service:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Stripe (Stripe Payments Australia Pty Ltd and Stripe, Inc.)</strong> &mdash;
                    payment processing, Stripe Connect onboarding, payout settlement, and dispute handling.
                    Stripe is the regulated payment processor; ElevatedPOS facilitates routing only and is
                    not an Australian Financial Services Licence holder.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Resend</strong> &mdash; transactional email
                    delivery. Resend transmits messages via Amazon SES infrastructure hosted in
                    ap-northeast-1 (Tokyo, Japan); see section 7 for international transfer disclosures.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Amazon Web Services (AWS)</strong> &mdash; our
                    primary infrastructure provider. All production data is stored in the AWS Asia Pacific
                    (Sydney) region, ap-southeast-2.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Anthropic</strong> &mdash; only where a
                    merchant opts in to AI-assisted features. Anthropic processes the relevant prompts and
                    minimal contextual data to generate the response. Anthropic does not train its models on
                    business data submitted via its API.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Reseller and partner organisations</strong> &mdash;
                    where a merchant signed up via a reseller, limited account-status information may be
                    shared with that reseller for the purposes of managing the referral.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Law enforcement and regulators</strong> &mdash;
                    where required by law, court order, or regulatory request.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Successors</strong> &mdash; in the event of a
                    business merger, acquisition, restructure or sale of assets, subject to the same privacy
                    obligations.
                  </span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">5. Where your data is stored</h2>
              <p>
                Production data is hosted in <strong className="font-medium text-white">AWS Asia Pacific
                (Sydney), region ap-southeast-2</strong>. The primary data stores are:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Amazon RDS for PostgreSQL &mdash; relational data (accounts, orders, inventory, etc.).
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Amazon ElastiCache for Redis &mdash; ephemeral session and caching data.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Amazon S3 &mdash; uploaded assets such as product images and receipts.
                </li>
              </ul>
              <p className="mt-3">
                All persistent storage is encrypted at rest using AWS-managed keys (AES-256). Data in transit
                is protected by TLS 1.2 or higher.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">6. Security measures</h2>
              <p>We implement organisational and technical safeguards including:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  TLS encryption for all client-server traffic.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Encryption at rest for databases, caches, and object storage.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Strict IAM role separation between services; least-privilege access for engineers.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Audit logging of administrative and security-sensitive actions.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Hashed and salted account passwords; staff PINs stored as one-way hashes.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Tokenised card data &mdash; full PANs and CVV are never stored on our infrastructure.
                </li>
              </ul>
              <p className="mt-3">
                Despite our safeguards, no internet-facing service can be guaranteed 100% secure. Merchants
                are responsible for keeping their credentials confidential and reporting any suspected
                compromise without delay.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">7. International transfers</h2>
              <p>
                The majority of personal information remains within Australia. The following limited
                cross-border transfers occur:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Resend / Amazon SES &mdash; Tokyo, Japan
                    (ap-northeast-1)</strong>: outbound transactional email is routed through SES
                    infrastructure in Tokyo. Email contents typically include the recipient address, the
                    sender, and the message body (e.g.&nbsp;a receipt or password-reset link).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Stripe &mdash; United States and other
                    Stripe regions</strong>: Stripe operates as a global payment processor; payment-related
                    information may be processed at Stripe facilities outside Australia in accordance with
                    Stripe&rsquo;s privacy notice.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  <span>
                    <strong className="font-medium text-white">Anthropic &mdash; United States</strong>:
                    where merchants opt in to AI features, prompts and minimal contextual data may be
                    processed by Anthropic in the United States.
                  </span>
                </li>
              </ul>
              <p className="mt-3">
                Each of these recipients is contractually bound to handle data in accordance with applicable
                privacy and security obligations. By using the relevant feature you consent to this transfer
                under APP&nbsp;8.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">8. Cookies and analytics</h2>
              <p>
                The dashboard uses minimal cookies. We set a session cookie (HTTP-only, secure) to keep you
                signed in, plus theme/preference cookies that store no personal information. We do not use
                third-party advertising cookies or cross-site tracking pixels in the dashboard. Disabling
                essential cookies will prevent login from working.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">9. Your rights (APP 12 and APP 13)</h2>
              <p>You have the right to:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Request access to the personal information we hold about you.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Request correction of information that is inaccurate, out of date, or incomplete.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Request deletion of your account and associated personal information, subject to legal
                  retention requirements (see section 10).
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Make a complaint about how we have handled your personal information.
                </li>
              </ul>
              <p className="mt-3">
                Requests should be sent to{' '}
                <a
                  href="mailto:privacy@elevatedpos.com.au"
                  className="text-elevatedpos-300 underline-offset-2 hover:text-white hover:underline"
                >
                  privacy@elevatedpos.com.au
                </a>
                . We aim to respond within 30 days. If we cannot resolve a complaint to your satisfaction
                you may lodge it with the Office of the Australian Information Commissioner (OAIC) at{' '}
                <a
                  href="https://www.oaic.gov.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-elevatedpos-300 underline-offset-2 hover:text-white hover:underline"
                >
                  oaic.gov.au
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">10. Data retention</h2>
              <p>
                We retain account and transaction data for as long as the merchant&rsquo;s account is active.
                After termination we retain the data for{' '}
                <strong className="font-medium text-white">seven (7) years</strong> to satisfy Australian
                tax, financial-records, and Australian Consumer Law obligations. After this period, personal
                information is deleted or de-identified except where ongoing retention is required by law.
              </p>
              <p className="mt-3">
                For up to 30 days after termination, the merchant may export their data via the dashboard or
                by request. After this export window, data may only be released subject to legal process.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">11. Updates to this policy</h2>
              <p>
                We may revise this Privacy Policy from time to time. Material changes will be notified by
                email to the registered owner contact and posted on this page with a new &ldquo;Last
                updated&rdquo; date. Changes take effect on the date stated. Continued use of the Service
                after the effective date constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">12. Contact</h2>
              <p>
                Privacy questions, access/correction/deletion requests, and complaints can be directed to
                our Privacy Officer:
              </p>
              <div className="mt-4 rounded-xl border border-elevatedpos-700/50 bg-elevatedpos-900/40 p-5">
                <p className="font-medium text-white">KBServices &mdash; ElevatedPOS</p>
                <p className="mt-1 text-elevatedpos-300">
                  Email:{' '}
                  <a
                    href="mailto:privacy@elevatedpos.com.au"
                    className="text-elevatedpos-300 underline-offset-2 hover:text-white hover:underline"
                  >
                    privacy@elevatedpos.com.au
                  </a>
                </p>
                <p className="mt-1 text-elevatedpos-400">
                  This is the official channel for privacy enquiries; please use it rather than general
                  support so we can route the request to the Privacy Officer.
                </p>
              </div>
            </section>

          </div>
        </article>

        <p className="mt-10 text-center text-xs text-elevatedpos-600">
          See also our{' '}
          <Link href="/terms" className="text-elevatedpos-400 hover:text-elevatedpos-200">
            Terms of Service
          </Link>
          {' '}&middot;{' '}
          <Link href="/login" className="text-elevatedpos-400 hover:text-elevatedpos-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
