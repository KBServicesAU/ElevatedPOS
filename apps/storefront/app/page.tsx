import Link from 'next/link';
import { PricingSection } from '@/components/pricing-section';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-bold text-indigo-400 tracking-tight">
                ElevatedPOS
              </Link>
              <div className="hidden md:flex items-center gap-6">
                <a href="#features" className="text-sm text-gray-300 hover:text-white transition-colors">Features</a>
                <a href="#pricing" className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</a>
                <a href="#about" className="text-sm text-gray-300 hover:text-white transition-colors">About</a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://app.elevatedpos.com.au/login"
                className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-2"
              >
                Log in
              </a>
              <Link
                href="/onboard"
                className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Get started free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gray-900 min-h-screen flex flex-col justify-center overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-900/50 border border-indigo-700 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            <span className="text-sm text-indigo-200 font-medium">Built for Australian businesses</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            The POS that works as<br className="hidden sm:block" /> hard as you do
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            Cloud-based point of sale, kitchen display, and self-serve kiosk — all in one. Run your hospitality or retail business from anywhere.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/onboard"
              className="w-full sm:w-auto text-base font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-indigo-900/50"
            >
              Start for free
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto text-base font-semibold border border-gray-600 hover:border-gray-400 text-gray-200 hover:text-white px-8 py-3.5 rounded-xl transition-colors"
            >
              See how it works
            </a>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-700 rounded-2xl overflow-hidden border border-gray-700 max-w-3xl mx-auto">
            {[
              { value: '500+', label: 'businesses' },
              { value: '10M+', label: 'orders processed' },
              { value: '99.9%', label: 'uptime' },
              { value: '🇦🇺', label: 'Australian-owned' },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-800 px-6 py-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{stat.value}</div>
                <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything your business needs</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">One platform to run your entire operation — from the counter to the kitchen to the books.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                ),
                title: 'POS Terminal',
                description: 'Fast, intuitive point of sale. Take orders, split bills, and process payments in seconds.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                ),
                title: 'Kitchen Display',
                description: 'Real-time kitchen orders. Keep your kitchen in sync with live order tickets and smart bumping.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                ),
                title: 'Self-Serve Kiosk',
                description: 'Let customers order themselves. Reduce wait times and increase average order value.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                ),
                title: 'Inventory Management',
                description: 'Always know your stock. Get low-stock alerts, track usage, and automate reorders.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                ),
                title: 'Customer Loyalty',
                description: 'Built-in loyalty programs. Reward your regulars and bring them back more often.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                ),
                title: 'Analytics & Reports',
                description: 'Know your numbers. Daily summaries, top sellers, revenue trends — all in one dashboard.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group"
              >
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Up and running in minutes</h2>
            <p className="text-lg text-gray-500">No technical knowledge required. We handle the hard stuff.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: '01',
                title: 'Sign up',
                description: 'Create your account and choose a plan that suits your business size and needs.',
              },
              {
                step: '02',
                title: 'Add your menu',
                description: 'Import your existing products or build your catalog from scratch with our intuitive editor.',
              },
              {
                step: '03',
                title: 'Start selling',
                description: 'Pair your devices in seconds and take your first order. That\'s it — you\'re live.',
              },
            ].map((item) => (
              <div key={item.step} className="relative flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
                  <span className="text-xl font-bold text-white">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection />

      {/* Testimonials */}
      <section className="bg-gray-900 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Loved by Australian businesses</h2>
            <p className="text-gray-400 text-lg">Don&#39;t just take our word for it.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: 'The KDS integration alone saved us 20 minutes per service. Our kitchen has never been so organised.',
                name: 'Sarah M.',
                role: 'Cafe Owner',
                location: 'Melbourne',
              },
              {
                quote: 'We moved from three separate systems to ElevatedPOS and our ops costs dropped by 40%.',
                name: 'James T.',
                role: 'Restaurant Manager',
                location: 'Sydney',
              },
              {
                quote: 'Setup took less than an hour. The support team is brilliant.',
                name: 'Priya K.',
                role: 'Retail Store Owner',
                location: 'Brisbane',
              },
            ].map((t) => (
              <div key={t.name} className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-200 text-sm leading-relaxed mb-6">&#34;{t.quote}&#34;</p>
                <div>
                  <div className="font-semibold text-white text-sm">{t.name}</div>
                  <div className="text-gray-400 text-xs">{t.role}, {t.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-indigo-600 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to elevate your business?</h2>
          <p className="text-indigo-200 text-lg mb-8">Start your free 14-day trial. No credit card required.</p>
          <Link
            href="/onboard"
            className="inline-block text-base font-semibold bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-4 rounded-xl transition-colors shadow-lg"
          >
            Get started for free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="bg-gray-900 border-t border-gray-800 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <Link href="/" className="text-xl font-bold text-indigo-400 tracking-tight">ElevatedPOS</Link>
              <p className="text-gray-400 text-sm mt-3 max-w-xs leading-relaxed">
                The modern cloud POS built for Australian hospitality and retail businesses.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-gray-400 hover:text-white text-sm transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-gray-400 hover:text-white text-sm transition-colors">Pricing</a></li>
                <li><a href="https://app.elevatedpos.com.au/demo" className="text-gray-400 hover:text-white text-sm transition-colors">Demo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#about" className="text-gray-400 hover:text-white text-sm transition-colors">About</a></li>
                <li><a href="https://blog.elevatedpos.com.au" className="text-gray-400 hover:text-white text-sm transition-colors">Blog</a></li>
                <li><a href="mailto:careers@elevatedpos.com.au" className="text-gray-400 hover:text-white text-sm transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Support</h4>
              <ul className="space-y-2">
                <li><a href="https://help.elevatedpos.com.au" className="text-gray-400 hover:text-white text-sm transition-colors">Help Centre</a></li>
                <li><a href="mailto:support@elevatedpos.com.au" className="text-gray-400 hover:text-white text-sm transition-colors">Contact</a></li>
                <li><a href="https://status.elevatedpos.com.au" className="text-gray-400 hover:text-white text-sm transition-colors">Status</a></li>
              </ul>
              <h4 className="text-white font-semibold text-sm mb-4 mt-6">Legal</h4>
              <ul className="space-y-2">
                <li><a href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8">
            <p className="text-gray-500 text-sm text-center">
              © 2025 ElevatedPOS Pty Ltd. ABN 00 000 000 000. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
