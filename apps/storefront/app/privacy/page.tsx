import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — ElevatedPOS' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">ElevatedPOS</Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Back to home</Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-10">Last updated: 1 April 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Who We Are</h2>
            <p>
              ElevatedPOS Pty Ltd (ABN 00 000 000 000) (&ldquo;ElevatedPOS&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates the ElevatedPOS
              point-of-sale platform, including the website at <strong>elevatedpos.com.au</strong> and all associated
              web applications, mobile apps, and APIs (collectively, the &ldquo;Service&rdquo;).
            </p>
            <p className="mt-2">
              We are bound by the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs)
              contained in that Act.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
            <p>We collect information you provide directly, including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Business and account registration details (business name, ABN, address)</li>
              <li>Contact information (name, email address, phone number)</li>
              <li>Payment and billing information (processed securely via Stripe — we do not store card numbers)</li>
              <li>Transaction and order data processed through your POS</li>
              <li>Customer loyalty and contact data that you upload or generate via the Service</li>
              <li>Device pairing information and hardware identifiers</li>
            </ul>
            <p className="mt-3">We also collect information automatically, including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Log data (IP address, browser type, pages visited, timestamps)</li>
              <li>Device information (device type, operating system)</li>
              <li>Usage analytics to improve the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process payments and manage billing</li>
              <li>Send transactional and operational emails (receipts, onboarding, support)</li>
              <li>Respond to your enquiries and provide customer support</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
              <li>Improve and develop the Service (using aggregated, de-identified data)</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Disclosure of Information</h2>
            <p>We may disclose your information to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Service providers</strong> who assist us in operating the Service (cloud infrastructure, payment processing, email delivery, analytics)</li>
              <li><strong>Reseller partners</strong> who referred your account, to the extent necessary to manage that referral relationship</li>
              <li><strong>Law enforcement or regulators</strong> when required by law or to protect our legal rights</li>
              <li><strong>Successors</strong> in the event of a business merger, acquisition, or sale of assets</li>
            </ul>
            <p className="mt-3">
              We require all third-party service providers to handle your data securely and only for the purposes
              we specify.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Storage and Security</h2>
            <p>
              Your data is stored on servers located in Australia (AWS Asia Pacific — Sydney region).
              We implement industry-standard security measures including encryption in transit (TLS),
              encryption at rest, access controls, and regular security reviews.
            </p>
            <p className="mt-2">
              Despite these measures, no transmission or storage of data over the internet can be guaranteed
              to be 100% secure. You use the Service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Cookies</h2>
            <p>
              We use essential cookies to authenticate your session and maintain your login state.
              We do not use third-party advertising cookies. You can control cookies through your
              browser settings, but disabling essential cookies may prevent the Service from functioning.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
            <p>Under the Australian Privacy Principles, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate or incomplete information</li>
              <li>Complain about how we have handled your personal information</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, contact us at <strong>privacy@elevatedpos.com.au</strong>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Retention</h2>
            <p>
              We retain your data for as long as your account is active and for up to 7 years thereafter
              to comply with Australian tax and financial record-keeping laws. You may request deletion of
              your account at any time; we will delete or de-identify your data except where retention is
              legally required.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              by email or by a prominent notice in the Service. Your continued use of the Service after
              the effective date constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices, please
              contact our Privacy Officer:
            </p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p><strong>ElevatedPOS Pty Ltd</strong></p>
              <p>Email: <a href="mailto:privacy@elevatedpos.com.au" className="text-blue-600 hover:underline">privacy@elevatedpos.com.au</a></p>
              <p>Website: <a href="https://elevatedpos.com.au" className="text-blue-600 hover:underline">elevatedpos.com.au</a></p>
            </div>
            <p className="mt-3">
              You may also lodge a complaint with the Office of the Australian Information Commissioner (OAIC)
              at <a href="https://www.oaic.gov.au" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">oaic.gov.au</a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 mt-16 py-8 text-center text-sm text-gray-400">
        © 2025 ElevatedPOS Pty Ltd. All rights reserved. &nbsp;·&nbsp;{' '}
        <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
      </footer>
    </div>
  );
}
