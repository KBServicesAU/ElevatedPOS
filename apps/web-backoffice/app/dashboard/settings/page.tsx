import type { Metadata } from 'next';
import { Building, CreditCard, Bell, Shield, Globe, Printer } from 'lucide-react';

export const metadata: Metadata = { title: 'Settings' };

const sections = [
  {
    id: 'business',
    icon: Building,
    title: 'Business Information',
    description: 'Name, address, tax number, and branding',
    fields: [
      { label: 'Business Name', value: 'Main Street Coffee', type: 'text' },
      { label: 'Legal Name', value: 'Main Street Coffee Pty Ltd', type: 'text' },
      { label: 'ABN / Tax Number', value: '12 345 678 901', type: 'text' },
      { label: 'Business Email', value: 'hello@mainstreetcoffee.com', type: 'email' },
      { label: 'Phone', value: '+61 2 9000 0000', type: 'tel' },
    ],
  },
  {
    id: 'locations',
    icon: Globe,
    title: 'Locations',
    description: 'Manage your locations and opening hours',
    fields: [
      { label: 'Default Location', value: 'Main Store — 42 Main St, Sydney', type: 'text' },
      { label: 'Timezone', value: 'Australia/Sydney (UTC+11)', type: 'text' },
    ],
  },
  {
    id: 'payments',
    icon: CreditCard,
    title: 'Payments',
    description: 'Accepted payment methods and acquirer settings',
    fields: [
      { label: 'Default Currency', value: 'AUD', type: 'text' },
      { label: 'Terminal Provider', value: 'Stripe Terminal', type: 'text' },
    ],
  },
  {
    id: 'receipts',
    icon: Printer,
    title: 'Receipts & Printing',
    description: 'Receipt format, logo, and printer settings',
    fields: [
      { label: 'Receipt Footer', value: 'Thank you for visiting!', type: 'text' },
      { label: 'Print Receipts By Default', value: 'Prompt on each sale', type: 'text' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500">Manage your business settings and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar nav */}
        <nav className="space-y-1">
          {[
            { icon: Building, label: 'Business', id: 'business' },
            { icon: Globe, label: 'Locations', id: 'locations' },
            { icon: CreditCard, label: 'Payments', id: 'payments' },
            { icon: Printer, label: 'Receipts', id: 'receipts' },
            { icon: Bell, label: 'Notifications', id: 'notifications' },
            { icon: Shield, label: 'Security', id: 'security' },
          ].map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          ))}
        </nav>

        {/* Settings panels */}
        <div className="lg:col-span-3 space-y-6">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                <div className="rounded-lg bg-nexus-50 p-2 dark:bg-nexus-900/30">
                  <section.icon className="h-5 w-5 text-nexus-600 dark:text-nexus-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{section.title}</h3>
                  <p className="text-sm text-gray-500">{section.description}</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {section.fields.map((field) => (
                  <div key={field.label}>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      defaultValue={field.value}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <button className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
