import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata = { title: 'Privacy Policy — ElevatedPOS' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">
            LEGAL
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-neutral-500">Last updated: 28 April 2026</p>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-3xl space-y-10">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Who We Are</h2>
              <p className="text-neutral-400 leading-relaxed">
                ElevatedPOS Pty Ltd (ABN 00 000 000 000) (&ldquo;ElevatedPOS&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates the ElevatedPOS
                point-of-sale platform, including the website at <strong className="text-white font-medium">elevatedpos.com.au</strong> and all associated
                web applications, mobile apps, and APIs (collectively, the &ldquo;Service&rdquo;).
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                We are bound by the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs)
                contained in that Act.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
              <p className="text-neutral-400 leading-relaxed">We collect information you provide directly, including:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Business and account registration details (business name, ABN, address)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Contact information (name, email address, phone number)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Payment and billing information (processed securely via Stripe — we do not store card numbers)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Transaction and order data processed through your POS
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Customer loyalty and contact data that you upload or generate via the Service
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Device pairing information and hardware identifiers
                </li>
              </ul>
              <p className="text-neutral-400 leading-relaxed mt-4">We also collect information automatically, including:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Log data (IP address, browser type, pages visited, timestamps)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Device information (device type, operating system)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Usage analytics to improve the Service
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
              <p className="text-neutral-400 leading-relaxed">We use your information to:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Provide, operate, and maintain the Service
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Process payments and manage billing
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Send transactional and operational emails (receipts, onboarding, support)
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Respond to your enquiries and provide customer support
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Detect and prevent fraud or abuse
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Comply with legal obligations
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Improve and develop the Service (using aggregated, de-identified data)
                </li>
              </ul>
              <p className="text-neutral-400 leading-relaxed mt-4">
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Disclosure of Information</h2>
              <p className="text-neutral-400 leading-relaxed">We may disclose your information to:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  <span><strong className="text-white font-medium">Service providers</strong> who assist us in operating the Service (cloud infrastructure, payment processing, email delivery, analytics)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  <span><strong className="text-white font-medium">Reseller partners</strong> who referred your account, to the extent necessary to manage that referral relationship</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  <span><strong className="text-white font-medium">Law enforcement or regulators</strong> when required by law or to protect our legal rights</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  <span><strong className="text-white font-medium">Successors</strong> in the event of a business merger, acquisition, or sale of assets</span>
                </li>
              </ul>
              <p className="text-neutral-400 leading-relaxed mt-4">
                We require all third-party service providers to handle your data securely and only for the purposes
                we specify.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Data Storage and Security</h2>
              <p className="text-neutral-400 leading-relaxed">
                Your data is stored on servers located in Australia (AWS Asia Pacific — Sydney region).
                We implement industry-standard security measures including encryption in transit (TLS),
                encryption at rest, access controls, and regular security reviews.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                Despite these measures, no transmission or storage of data over the internet can be guaranteed
                to be 100% secure. You use the Service at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Cookies</h2>
              <p className="text-neutral-400 leading-relaxed">
                We use essential cookies to authenticate your session and maintain your login state.
                We do not use third-party advertising cookies. You can control cookies through your
                browser settings, but disabling essential cookies may prevent the Service from functioning.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
              <p className="text-neutral-400 leading-relaxed">Under the Australian Privacy Principles, you have the right to:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Access the personal information we hold about you
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Request correction of inaccurate or incomplete information
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Complain about how we have handled your personal information
                </li>
              </ul>
              <p className="text-neutral-400 leading-relaxed mt-4">
                To exercise these rights, contact us at <strong className="text-white font-medium">privacy@elevatedpos.com.au</strong>.
                We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Retention</h2>
              <p className="text-neutral-400 leading-relaxed">
                We retain your data for as long as your account is active and for up to 7 years thereafter
                to comply with Australian tax and financial record-keeping laws. You may request deletion of
                your account at any time; we will delete or de-identify your data except where retention is
                legally required.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Changes to This Policy</h2>
              <p className="text-neutral-400 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material changes
                by email or by a prominent notice in the Service. Your continued use of the Service after
                the effective date constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Contact Us</h2>
              <p className="text-neutral-400 leading-relaxed">
                If you have questions or concerns about this Privacy Policy or our data practices, please
                contact our Privacy Officer:
              </p>
              <div className="mt-4 border border-white/[0.08] rounded-xl p-6 bg-white/[0.02]">
                <p className="text-white font-medium">ElevatedPOS Pty Ltd</p>
                <p className="text-neutral-400 mt-1">
                  Email:{' '}
                  <a href="mailto:privacy@elevatedpos.com.au" className="text-[#7c3aed] hover:text-white transition-colors">
                    privacy@elevatedpos.com.au
                  </a>
                </p>
                <p className="text-neutral-400 mt-1">
                  Website:{' '}
                  <a href="https://elevatedpos.com.au" className="text-[#7c3aed] hover:text-white transition-colors">
                    elevatedpos.com.au
                  </a>
                </p>
              </div>
              <p className="text-neutral-400 leading-relaxed mt-4">
                You may also lodge a complaint with the Office of the Australian Information Commissioner (OAIC)
                at{' '}
                <a
                  href="https://www.oaic.gov.au"
                  className="text-[#7c3aed] hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  oaic.gov.au
                </a>
                .
              </p>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
