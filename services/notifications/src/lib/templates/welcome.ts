import { wrapEmail } from './base';

export function welcomeEmail(opts: {
  firstName: string;
  businessName: string;
  loginUrl: string;
  plan: string;
}): { subject: string; html: string } {
  const planLabel = opts.plan.charAt(0).toUpperCase() + opts.plan.slice(1);

  return {
    subject: `Welcome to ElevatedPOS — your account is ready!`,
    html: wrapEmail(`
      <h1>You're all set, ${opts.firstName}! 🎉</h1>
      <p>Your email has been verified and your <strong>ElevatedPOS</strong> account is now fully active. Here's what was set up for you:</p>

      <div class="info-box">
        <p><strong>Business:</strong> ${opts.businessName}</p>
        <p><strong>Plan:</strong> ${planLabel}</p>
        <p><strong>Next step:</strong> Complete your store setup</p>
      </div>

      <p>Head to your dashboard to add your first location, create your product catalogue, invite your team, and connect your payment account.</p>

      <div class="btn-wrap">
        <a href="${opts.loginUrl}" class="btn">Go to Dashboard &rarr;</a>
      </div>

      <hr class="divider">

      <p class="small">Need help getting started? Our support team is available 7 days a week — reply to this email or chat with us from inside the dashboard.</p>
    `),
  };
}
