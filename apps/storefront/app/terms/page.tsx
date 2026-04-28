import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata = { title: 'Terms of Service — ElevatedPOS' };

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-neutral-500">Last updated: 28 April 2026</p>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-3xl space-y-10">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
              <p className="text-neutral-400 leading-relaxed">
                By accessing or using ElevatedPOS (&ldquo;the Service&rdquo;), operated by ElevatedPOS Pty Ltd
                (ABN 00 000 000 000) (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service
                (&ldquo;Terms&rdquo;). If you do not agree, you must not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
              <p className="text-neutral-400 leading-relaxed">
                ElevatedPOS is a cloud-based point-of-sale platform designed for Australian businesses.
                The Service includes web and mobile applications for managing sales, inventory, customers,
                staff, and connected hardware terminals.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. Account Registration</h2>
              <p className="text-neutral-400 leading-relaxed">
                To use the Service you must create an account. You agree to provide accurate, complete, and
                current information and to keep your credentials confidential. You are responsible for all
                activity that occurs under your account. Notify us immediately of any unauthorised use.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                You must be at least 18 years old and have authority to bind any business entity on whose
                behalf you register.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Subscription Plans and Billing</h2>
              <p className="text-neutral-400 leading-relaxed">
                Access to the Service requires a paid subscription. By selecting a plan and providing payment
                details, you authorise us to charge the applicable fees on a recurring basis (monthly or
                annually, as selected).
              </p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  All prices are in Australian dollars (AUD) and exclusive of GST unless stated otherwise.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  GST will be added where applicable under Australian law.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Subscription fees are non-refundable except as required by Australian Consumer Law.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  We reserve the right to change pricing with 30 days&rsquo; written notice.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Failed payments may result in suspension of access after reasonable notice.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Free Trial</h2>
              <p className="text-neutral-400 leading-relaxed">
                Where a free trial is offered, it begins on the date of registration and ends on the date
                specified at signup. At the end of the trial your selected subscription plan will automatically
                commence and you will be charged unless you cancel before the trial expires.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Acceptable Use</h2>
              <p className="text-neutral-400 leading-relaxed">You agree not to:</p>
              <ul className="mt-3 space-y-2 text-neutral-400">
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Use the Service for any unlawful purpose or in violation of applicable law
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Attempt to gain unauthorised access to any part of the Service or its infrastructure
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Transmit malicious code, spam, or disruptive content
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Reverse-engineer, decompile, or attempt to extract source code from the Service
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Resell or sublicense access to the Service without our written consent
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 block h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                  Use the Service to process transactions in violation of applicable payment network rules
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
              <p className="text-neutral-400 leading-relaxed">
                The Service, including all software, designs, logos, and content, is owned by ElevatedPOS Pty Ltd
                or its licensors and is protected by Australian and international intellectual property laws.
                These Terms grant you a limited, non-exclusive, non-transferable licence to use the Service
                for your internal business purposes only.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                You retain ownership of all data you input into the Service. You grant us a limited licence
                to process that data solely to provide and improve the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Data and Privacy</h2>
              <p className="text-neutral-400 leading-relaxed">
                Our collection and use of personal information is governed by our{' '}
                <Link href="/privacy" className="text-[#7c3aed] hover:text-white transition-colors">Privacy Policy</Link>,
                which forms part of these Terms. By using the Service you consent to such collection and use.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                You are responsible for obtaining any necessary consents from your customers before
                processing their personal information through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Uptime and Support</h2>
              <p className="text-neutral-400 leading-relaxed">
                We target 99.9% monthly uptime for core POS functions, excluding scheduled maintenance
                windows (notified in advance) and events beyond our reasonable control. Support is
                available via email and in-app chat during Australian business hours (AEST/AEDT),
                Monday to Friday.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Cancellation and Termination</h2>
              <p className="text-neutral-400 leading-relaxed">
                You may cancel your subscription at any time through your account settings. Cancellation takes
                effect at the end of the current billing period; you retain access until then.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                We may suspend or terminate your account immediately if you materially breach these Terms,
                engage in fraud, or if required by law. Upon termination, we will retain your data for
                30 days during which you may export it; thereafter it will be deleted or de-identified.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. Limitation of Liability</h2>
              <p className="text-neutral-400 leading-relaxed">
                To the maximum extent permitted by law, ElevatedPOS Pty Ltd is not liable for any indirect,
                incidental, consequential, or punitive damages arising from your use of, or inability to
                use, the Service. Our total aggregate liability to you in respect of any claim is limited
                to the fees paid by you in the 12 months preceding the event giving rise to the claim.
              </p>
              <p className="text-neutral-400 leading-relaxed mt-2">
                Nothing in these Terms excludes, restricts, or modifies any guarantee, right, or remedy
                that cannot be excluded, restricted, or modified under the Australian Consumer Law
                (Schedule 2 of the <em>Competition and Consumer Act 2010</em> (Cth)).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. Indemnification</h2>
              <p className="text-neutral-400 leading-relaxed">
                You agree to indemnify and hold harmless ElevatedPOS Pty Ltd, its officers, directors,
                employees, and agents from any claims, losses, or damages (including legal costs) arising
                from your use of the Service, your breach of these Terms, or your violation of any
                third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">13. Changes to the Service and Terms</h2>
              <p className="text-neutral-400 leading-relaxed">
                We may modify the Service or these Terms at any time. For material changes to Terms, we
                will provide at least 14 days&rsquo; notice by email or in-app notification. Continued use
                of the Service after the effective date constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">14. Governing Law</h2>
              <p className="text-neutral-400 leading-relaxed">
                These Terms are governed by the laws of New South Wales, Australia. You submit to the
                exclusive jurisdiction of the courts of New South Wales for any dispute arising under
                or in connection with these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">15. Contact</h2>
              <p className="text-neutral-400 leading-relaxed">Questions about these Terms should be directed to:</p>
              <div className="mt-4 border border-white/[0.08] rounded-xl p-6 bg-white/[0.02]">
                <p className="text-white font-medium">ElevatedPOS Pty Ltd</p>
                <p className="text-neutral-400 mt-1">
                  Email:{' '}
                  <a href="mailto:legal@elevatedpos.com.au" className="text-[#7c3aed] hover:text-white transition-colors">
                    legal@elevatedpos.com.au
                  </a>
                </p>
                <p className="text-neutral-400 mt-1">
                  Website:{' '}
                  <a href="https://elevatedpos.com.au" className="text-[#7c3aed] hover:text-white transition-colors">
                    elevatedpos.com.au
                  </a>
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
