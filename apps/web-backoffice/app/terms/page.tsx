import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The Terms of Service governing use of the ElevatedPOS software-as-a-service POS, KDS, kiosk and dashboard applications operated by KBServices in Australia.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '28 April 2026';

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-elevatedpos-400">Last updated: {LAST_UPDATED}</p>
        </div>

        <article className="rounded-2xl border border-elevatedpos-700/50 bg-elevatedpos-800/60 p-6 shadow-2xl backdrop-blur sm:p-10">
          <div className="space-y-10 text-sm leading-relaxed text-elevatedpos-200">

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">1. Agreement</h2>
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) form a binding agreement between{' '}
                <strong className="font-medium text-white">KBServices</strong> (trading as ElevatedPOS,
                &ldquo;ElevatedPOS&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) and the
                organisation that registers an account (the &ldquo;Merchant&rdquo;, &ldquo;you&rdquo;, or
                &ldquo;your&rdquo;). By creating an account or using any part of the Service you accept these
                Terms. If you are accepting on behalf of an organisation, you warrant that you have authority
                to bind that organisation.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">2. The Service</h2>
              <p>
                ElevatedPOS is a subscription-based software-as-a-service platform comprising the
                point-of-sale application, kitchen-display (KDS) application, self-order kiosk, customer
                display, the back-office dashboard, and supporting cloud APIs. Access is provided to the
                Merchant on a per-organisation basis. Each Merchant operates one organisation account; if
                you operate multiple legal entities, each entity requires its own account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">3. Permitted use</h2>
              <p>
                Subject to these Terms we grant you a limited, non-exclusive, non-transferable, revocable
                licence to access and use the Service for the internal business operations of your
                organisation during your subscription. You may permit your authorised employees and
                contractors to use the Service under your account, provided each user has their own
                credentials and you remain responsible for their conduct.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">4. Subscription, billing and pricing</h2>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Access to the Service requires an active paid subscription. Pricing is per-device for each
                  device tier (POS, KDS, kiosk, customer display) plus optional add-ons.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Subscriptions are billed in advance, monthly, in Australian dollars (AUD) and are
                  exclusive of GST unless otherwise stated. GST is added where applicable.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Subscriptions auto-renew at the end of each billing period unless cancelled in accordance
                  with section 9.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  We may change pricing on at least <strong className="font-medium text-white">30 days&rsquo;
                  written notice</strong> by email. Changes take effect from the next billing period after
                  the notice period.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Subscription fees are non-refundable except where required by the Australian Consumer Law.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  If a payment fails, we may suspend access after reasonable notice and a chance to remedy.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">5. Acceptable use</h2>
              <p>You must not, and must not permit any user to:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Use the Service for any unlawful, fraudulent, or deceptive purpose, or to process
                  transactions in breach of payment-network rules.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Resell, sublicense, or otherwise make the POS infrastructure available to third parties
                  outside your organisation without our prior written consent.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Reverse-engineer, decompile, disassemble, or attempt to extract source code from the
                  Service, except to the extent expressly permitted by Australian law.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Share account credentials, PINs, or session tokens between users, or allow access by
                  unauthorised persons.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Attempt to interfere with the integrity, security, or performance of the Service, or
                  introduce malicious code.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Use the Service to send unsolicited communications or to handle data without the consents
                  required by applicable privacy law.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">6. Payment processing</h2>
              <p>
                Card and digital-wallet payments are processed by{' '}
                <strong className="font-medium text-white">Stripe</strong> (Stripe Payments Australia Pty
                Ltd and its affiliates) under your Stripe Connect account. Stripe is the regulated payment
                processor and merchant of record for card processing. ElevatedPOS facilitates routing of
                transactions to Stripe and reports the results back into the Service.
              </p>
              <p className="mt-3">
                ElevatedPOS is{' '}
                <strong className="font-medium text-white">not the holder of an Australian Financial
                Services Licence (AFSL)</strong> and does not provide payment services in its own right.
                Disputes, chargebacks, refunds, settlement timing, and identity verification are governed
                by Stripe&rsquo;s terms and the rules of the relevant card schemes. You agree to comply
                with Stripe&rsquo;s terms as a condition of using payment features in the Service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">7. Australian Consumer Law</h2>
              <p>
                Nothing in these Terms excludes, restricts, or modifies any guarantee, right, or remedy
                conferred on you under the Australian Consumer Law (Schedule 2 of the{' '}
                <em>Competition and Consumer Act 2010</em> (Cth)) or any other law that cannot be excluded.
                Where our liability for breach of a non-excludable consumer guarantee can be limited, our
                liability is limited (at our option) to resupplying the Service or paying the cost of
                resupply.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">8. Intellectual property and your data</h2>
              <p>
                The Service, including all software, designs, branding, and documentation, is owned by
                KBServices or its licensors and is protected by Australian and international intellectual
                property laws. We retain all rights, title, and interest in the platform.
              </p>
              <p className="mt-3">
                You retain ownership of all data you and your users input or generate via the Service
                (&ldquo;Merchant Data&rdquo;), including catalog, customer records, transactions, and
                reports. You grant us a limited, non-exclusive licence to host, process, transmit, back up,
                and display Merchant Data solely as needed to deliver and support the Service. You are
                responsible for the lawfulness of the Merchant Data you submit and for obtaining any
                consents required from your end customers.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">9. Termination</h2>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Either party may terminate the subscription for convenience on at least{' '}
                  <strong className="font-medium text-white">30 days&rsquo; written notice</strong>.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  We may suspend or terminate the Service immediately, with notice where reasonable, if
                  you materially breach these Terms, fail to pay, engage in fraud, or where required by
                  law or by Stripe or a card scheme.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-elevatedpos-500" />
                  Upon termination, your access to the Service ends. We will keep your data available for
                  export for <strong className="font-medium text-white">30 days</strong> following
                  termination. After this period, Merchant Data may be deleted or de-identified, subject
                  to the retention periods set out in the Privacy Policy.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">10. Disclaimers</h2>
              <p>
                Subject to section 7 and to the extent permitted by law, the Service is provided
                &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We do not warrant that the Service will
                be uninterrupted, error-free, or fit for any particular purpose beyond what is reasonably
                described in our documentation. We do not warrant the accuracy of third-party services,
                payment-network outcomes, or hardware not supplied by us.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">11. Limitation of liability</h2>
              <p>
                Subject to section 7 and to the extent permitted by law, neither party is liable for
                indirect, consequential, incidental, special, or punitive damages, or for loss of profits,
                revenue, goodwill, anticipated savings, or business opportunity, however caused.
              </p>
              <p className="mt-3">
                Our total aggregate liability to you under or in connection with these Terms in any
                12-month period is limited to the{' '}
                <strong className="font-medium text-white">subscription fees paid by you to us in the
                12 months immediately preceding</strong> the event giving rise to the claim. Nothing in
                this section limits a liability that cannot be limited under the Australian Consumer Law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">12. Indemnity</h2>
              <p>
                You will indemnify and hold harmless KBServices, its officers, directors, employees, and
                agents from and against any claims, losses, liabilities, damages, and reasonable legal
                costs arising out of or in connection with: (a)&nbsp;your breach of these Terms;
                (b)&nbsp;Merchant Data, including any claim that it infringes a third party&rsquo;s rights
                or breaches privacy law; and (c)&nbsp;your use of the Service in violation of applicable
                law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">13. Confidentiality</h2>
              <p>
                Each party will keep confidential any non-public information of the other received under
                these Terms, and use it only to perform its rights and obligations. This section does not
                apply to information that is or becomes public through no fault of the receiving party,
                was already known, is independently developed, or must be disclosed by law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">14. Changes to the Service or Terms</h2>
              <p>
                We may modify the Service from time to time, including adding or removing features. For
                material changes to these Terms, we will give at least 14 days&rsquo; notice by email or
                in-app notification. Continued use of the Service after the effective date constitutes
                acceptance of the revised Terms. If you do not accept material changes you may terminate
                in accordance with section 9.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">15. Governing law and disputes</h2>
              <p>
                These Terms are governed by the laws of{' '}
                <strong className="font-medium text-white">New South Wales, Australia</strong>. Each party
                submits to the exclusive jurisdiction of the courts of New South Wales and the federal
                courts sitting in New South Wales for any dispute arising under or in connection with
                these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">16. Contact</h2>
              <p>Notices and questions about these Terms should be sent to:</p>
              <div className="mt-4 rounded-xl border border-elevatedpos-700/50 bg-elevatedpos-900/40 p-5">
                <p className="font-medium text-white">KBServices &mdash; ElevatedPOS</p>
                <p className="mt-1 text-elevatedpos-300">
                  Email:{' '}
                  <a
                    href="mailto:legal@elevatedpos.com.au"
                    className="text-elevatedpos-300 underline-offset-2 hover:text-white hover:underline"
                  >
                    legal@elevatedpos.com.au
                  </a>
                </p>
              </div>
              <p className="mt-3">
                Privacy-related questions should be addressed under our{' '}
                <Link
                  href="/privacy"
                  className="text-elevatedpos-300 underline-offset-2 hover:text-white hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

          </div>
        </article>

        <p className="mt-10 text-center text-xs text-elevatedpos-600">
          See also our{' '}
          <Link href="/privacy" className="text-elevatedpos-400 hover:text-elevatedpos-200">
            Privacy Policy
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
