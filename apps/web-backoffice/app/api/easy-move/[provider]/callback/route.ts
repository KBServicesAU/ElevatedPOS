import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.elevatedpos.com.au';

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/easy-move?error=oauth_denied`,
    );
  }

  try {
    let token = '';

    if (params.provider === 'square') {
      const res = await fetch('https://connect.squareup.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-17',
        },
        body: JSON.stringify({
          client_id: process.env.SQUARE_CLIENT_ID,
          client_secret: process.env.SQUARE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${appUrl}/api/easy-move/square/callback`,
        }),
      });
      const data = (await res.json()) as { access_token?: string };
      token = data.access_token ?? '';
    } else if (params.provider === 'lightspeed') {
      const res = await fetch(
        'https://cloud.lightspeedapp.com/oauth/access_token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.LIGHTSPEED_CLIENT_ID ?? '',
            client_secret: process.env.LIGHTSPEED_CLIENT_SECRET ?? '',
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${appUrl}/api/easy-move/lightspeed/callback`,
          }),
        },
      );
      const data = (await res.json()) as { access_token?: string };
      token = data.access_token ?? '';
    } else if (params.provider === 'vend') {
      const domainPrefix = searchParams.get('domain_prefix') ?? '';
      const res = await fetch(
        `https://${domainPrefix}.vendhq.com/api/1.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.VEND_CLIENT_ID ?? '',
            client_secret: process.env.VEND_CLIENT_SECRET ?? '',
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${appUrl}/api/easy-move/vend/callback`,
          }),
        },
      );
      const data = (await res.json()) as { access_token?: string };
      token = data.access_token ?? '';
    } else if (params.provider === 'kounta') {
      const res = await fetch('https://my.kounta.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.KOUNTA_CLIENT_ID ?? '',
          client_secret: process.env.KOUNTA_CLIENT_SECRET ?? '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${appUrl}/api/easy-move/kounta/callback`,
        }),
      });
      const data = (await res.json()) as { access_token?: string };
      token = data.access_token ?? '';
    }

    if (!token) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/easy-move?error=token_exchange_failed`,
      );
    }

    // Store token in a short-lived cookie and redirect to wizard
    const response = NextResponse.redirect(
      `${appUrl}/dashboard/easy-move?connected=1&provider=${params.provider}`,
    );
    response.cookies.set(
      `easy_move_token_${params.provider}`,
      token,
      {
        httpOnly: true,
        secure: true,
        maxAge: 3600, // 1 hour
        path: '/',
      },
    );
    return response;
  } catch {
    return NextResponse.redirect(
      `${appUrl}/dashboard/easy-move?error=server_error`,
    );
  }
}
