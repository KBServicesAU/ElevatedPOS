import { wrapEmail } from './base';

export function passwordResetEmail(opts: {
  firstName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Reset your ElevatedPOS password`,
    html: wrapEmail(`
      <h1>Password reset request</h1>
      <p>Hi ${opts.firstName}, we received a request to reset the password for your ElevatedPOS account.</p>

      <div class="btn-wrap">
        <a href="${opts.resetUrl}" class="btn">Reset My Password &rarr;</a>
      </div>

      <hr class="divider">

      <p class="small">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
      <p class="small">Button not working? Copy and paste this link:<br><a href="${opts.resetUrl}">${opts.resetUrl}</a></p>
    `),
  };
}
