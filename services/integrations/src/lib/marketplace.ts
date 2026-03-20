export interface MarketplaceApp {
  id: string;
  name: string;
  category: 'accounting' | 'payments' | 'logistics' | 'marketing' | 'bnpl' | 'ecommerce';
  description: string;
  logoUrl: string;
  developer: string;
  pricing: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  docsUrl: string;
}

export const MARKETPLACE_APPS: MarketplaceApp[] = [
  {
    id: 'xero',
    name: 'Xero',
    category: 'accounting',
    description: 'Sync sales, refunds, and payments directly into Xero. Automatic reconciliation with daily journal entries and bank feeds.',
    logoUrl: 'https://cdn.nexus.app/integrations/xero.svg',
    developer: 'Xero Ltd',
    pricing: 'Free',
    rating: 4.8,
    reviewCount: 2341,
    tags: ['accounting', 'reconciliation', 'invoicing'],
    docsUrl: 'https://docs.nexus.app/integrations/xero',
  },
  {
    id: 'myob',
    name: 'MYOB AccountRight',
    category: 'accounting',
    description: 'Push sales data, customer records, and inventory adjustments into MYOB. Supports AccountRight and Essentials.',
    logoUrl: 'https://cdn.nexus.app/integrations/myob.svg',
    developer: 'MYOB',
    pricing: 'Free',
    rating: 4.5,
    reviewCount: 987,
    tags: ['accounting', 'payroll', 'gst'],
    docsUrl: 'https://docs.nexus.app/integrations/myob',
  },
  {
    id: 'tyro',
    name: 'Tyro EFTPOS',
    category: 'payments',
    description: 'Seamless integrated EFTPOS with Tyro terminals. Surcharge-free processing, split bills, and instant settlement.',
    logoUrl: 'https://cdn.nexus.app/integrations/tyro.svg',
    developer: 'Tyro Payments',
    pricing: 'Tyro fees apply',
    rating: 4.7,
    reviewCount: 1832,
    tags: ['eftpos', 'payments', 'terminals'],
    docsUrl: 'https://docs.nexus.app/integrations/tyro',
  },
  {
    id: 'afterpay',
    name: 'Afterpay',
    category: 'bnpl',
    description: 'Accept Afterpay in-store and online. Let customers split purchases into 4 interest-free payments.',
    logoUrl: 'https://cdn.nexus.app/integrations/afterpay.svg',
    developer: 'Afterpay',
    pricing: '4–6% per transaction',
    rating: 4.6,
    reviewCount: 3104,
    tags: ['bnpl', 'payments', 'buy-now-pay-later'],
    docsUrl: 'https://docs.nexus.app/integrations/afterpay',
  },
  {
    id: 'shippit',
    name: 'Shippit',
    category: 'logistics',
    description: 'Automate shipping for online orders. Compare rates across Australia Post, Startrack, CouriersPlease, and more.',
    logoUrl: 'https://cdn.nexus.app/integrations/shippit.svg',
    developer: 'Shippit Pty Ltd',
    pricing: 'From $0/month',
    rating: 4.4,
    reviewCount: 612,
    tags: ['shipping', 'logistics', 'fulfilment'],
    docsUrl: 'https://docs.nexus.app/integrations/shippit',
  },
  {
    id: 'starshipit',
    name: 'Starshipit',
    category: 'logistics',
    description: 'Multi-carrier shipping platform with automated rules, branded tracking pages, and returns management.',
    logoUrl: 'https://cdn.nexus.app/integrations/starshipit.svg',
    developer: 'Starshipit',
    pricing: 'From $49/month',
    rating: 4.6,
    reviewCount: 445,
    tags: ['shipping', 'tracking', 'returns'],
    docsUrl: 'https://docs.nexus.app/integrations/starshipit',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'marketing',
    description: 'Sync customers and purchase history to Mailchimp audiences. Trigger automated campaigns based on POS activity.',
    logoUrl: 'https://cdn.nexus.app/integrations/mailchimp.svg',
    developer: 'Mailchimp / Intuit',
    pricing: 'Mailchimp plan required',
    rating: 4.3,
    reviewCount: 1204,
    tags: ['email', 'marketing', 'automation'],
    docsUrl: 'https://docs.nexus.app/integrations/mailchimp',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    description: 'Unified inventory and order management across your Shopify store and NEXUS POS. Real-time stock sync and omni-channel reporting.',
    logoUrl: 'https://cdn.nexus.app/integrations/shopify.svg',
    developer: 'Shopify Inc',
    pricing: 'Shopify plan required',
    rating: 4.7,
    reviewCount: 4872,
    tags: ['ecommerce', 'omnichannel', 'inventory'],
    docsUrl: 'https://docs.nexus.app/integrations/shopify',
  },
];
