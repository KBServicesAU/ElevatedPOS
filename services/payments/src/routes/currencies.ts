import type { FastifyInstance } from 'fastify';
import { SUPPORTED_CURRENCIES, DEV_EXCHANGE_RATES, convertAmount } from '../lib/currency';

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function currencyRoutes(app: FastifyInstance) {
  // GET /rates — returns current exchange rates and supported currencies
  // This route is PUBLIC — no authentication required
  app.get('/rates', async (_request, reply) => {
    // In production: fetch live rates from RBA (https://www.rba.gov.au/statistics/frequency/exchange-rates.html)
    // or Open Exchange Rates (https://openexchangerates.org) and cache them with a TTL.
    // For dev: return hardcoded rates.

    const rates: Record<string, { rate: number; base: string }> = {};
    for (const currency of SUPPORTED_CURRENCIES) {
      rates[currency] = {
        rate: DEV_EXCHANGE_RATES[currency] ?? 1,
        base: 'AUD',
      };
    }

    return reply.status(200).send({
      data: {
        base: 'AUD',
        rates: DEV_EXCHANGE_RATES,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        updatedAt: new Date().toISOString(),
        source: 'dev-hardcoded', // In production: 'rba' | 'open-exchange-rates'
      },
    });
  });

  // GET /convert — convert an amount between currencies (public, no auth)
  app.get('/convert', async (request, reply) => {
    const q = request.query as { amount?: string; from?: string; to?: string };

    const amount = parseFloat(q.amount ?? '');
    const from = (q.from ?? '').toUpperCase();
    const to = (q.to ?? '').toUpperCase();

    if (isNaN(amount) || amount <= 0) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: 'amount must be a positive number.' });
    }
    if (!SUPPORTED_CURRENCIES.includes(from)) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: `Unsupported source currency: ${from}` });
    }
    if (!SUPPORTED_CURRENCIES.includes(to)) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: `Unsupported target currency: ${to}` });
    }

    const converted = convertAmount(amount, from, to);

    return reply.status(200).send({
      data: {
        from,
        to,
        amount,
        converted,
        rate: DEV_EXCHANGE_RATES[to]! / DEV_EXCHANGE_RATES[from]!,
      },
    });
  });
}
