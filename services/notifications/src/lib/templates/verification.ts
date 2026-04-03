import { wrapEmail } from './base';

export function verificationEmail(opts: {
  firstName: string;
  businessName: string;
  verifyUrl: string;
  plan: string;
}): { subject: string; html: string } {
  const planLabel = opts.plan.charAt(0).toUpperCase() + opts.plan.slice(1);

  return {
    subject: `Verify your email — welcome to ElevatedPOS, ${opts.firstName}!`,
    html: wrapEmail(`
      <h1>You're almost in, ${opts.firstName}! 👋</h1>
      <p>Thanks for signing up for <strong>ElevatedPOS</strong>. Before you start setting up your store, please verify your email address so we know it's really you.</p>

      <div class="btn-wrap">
        <a href="${opts.verifyUrl}" class="btn">Verify My Email &rarr;</a>
      </div>

      <div class="info-box">
        <p><strong>Business:</strong> ${opts.businessName}</p>
        <p><strong>Plan:</strong> ${planLabel}</p>
        <p><strong>Email:</strong> ${opts.firstName.toLowerCase()}@...</p>
      </div>

      <p>Once verified you'll have full access to your dashboard where you can add your location, set up your products, invite staff, and start taking payments.</p>

      <hr class="divider">

      <p class="small">This link expires in <strong>24 hours</strong>. If you didn't create an ElevatedPOS account, you can safely ignore this email — no account will be activated.</p>
      <p class="small">Button not working? Copy and paste this URL into your browser:<br><a href="${opts.verifyUrl}">${opts.verifyUrl}</a></p>
    `),
  };
}
