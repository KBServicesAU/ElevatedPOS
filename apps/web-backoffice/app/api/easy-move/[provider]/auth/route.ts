import { NextRequest, NextResponse } from 'next/server';

const OAUTH_URLS: Record<string, (req: NextRequest) => string> = {
  square: (_req) => {
    const clientId = process.env.SQUARE_CLIENT_ID ?? '';
    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au'}/api/easy-move/square/callback`,
    );
    return `https://connect.squareup.com/oauth2/authorize?client_id=${clientId}&scope=ITEMS_READ+CUSTOMERS_READ+EMPLOYEES_READ&redirect_uri=${redirectUri}&session=false`;
  },
  lightspeed: (_req) => {
    const clientId = process.env.LIGHTSPEED_CLIENT_ID ?? '';
    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au'}/api/easy-move/lightspeed/callback`,
    );
    return `https://cloud.lightspeedapp.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=employee:all&redirect_uri=${redirectUri}`;
  },
  vend: (_req) => {
    const clientId = process.env.VEND_CLIENT_ID ?? '';
    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au'}/api/easy-move/vend/callback`,
    );
    return `https://secure.vendhq.com/connect?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  },
  shopify: (_req) => {
    // Shopify needs a shop subdomain first — redirect to a page asking for it
    return `/dashboard/easy-move?step=shopify-shop`;
  },
  kounta: (_req) => {
    const clientId = process.env.KOUNTA_CLIENT_ID ?? '';
    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au'}/api/easy-move/kounta/callback`,
    );
    return `https://my.kounta.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const url = OAUTH_URLS[params.provider]?.(req);
  if (!url) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  return NextResponse.redirect(url);
}
