import { wrapEmail } from './base';

interface RosterShift {
  date: string;
  startTime: string;
  endTime: string;
  role?: string | undefined;
}

export function rosterEmail(opts: {
  employeeName: string;
  weekLabel: string;
  shifts: RosterShift[];
}): { subject: string; html: string } {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const shiftRows = opts.shifts
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((s) => {
      const d = new Date(s.date + 'T00:00:00');
      const dayName = dayNames[d.getDay()] ?? '';
      const dateLabel = `${dayName}, ${d.getDate()}/${d.getMonth() + 1}`;
      const roleCell = s.role ? `<td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;color:#52525b;font-size:14px;">${s.role}</td>` : '<td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;color:#a1a1aa;font-size:14px;">&mdash;</td>';
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;font-weight:500;color:#18181b;font-size:14px;">${dateLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;color:#52525b;font-size:14px;">${s.startTime} &ndash; ${s.endTime}</td>
        ${roleCell}
      </tr>`;
    })
    .join('');

  return {
    subject: `Your Roster \u2014 ${opts.weekLabel}`,
    html: wrapEmail(`
      <h1>Hey ${opts.employeeName}, your roster is ready</h1>
      <p>Your shifts for <strong>${opts.weekLabel}</strong> have been published. Here's what's coming up:</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr style="background:#fafafa;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e4e4e7;">Day</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e4e4e7;">Time</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e4e4e7;">Role</th>
          </tr>
        </thead>
        <tbody>
          ${shiftRows}
        </tbody>
      </table>

      <div class="info-box">
        <p><strong>Total shifts:</strong> ${opts.shifts.length}</p>
      </div>

      <p>If anything doesn't look right, please reach out to your manager as soon as possible.</p>

      <hr class="divider">

      <p class="small">This is an automated notification from your workplace roster. If you believe you received this in error, please contact your manager.</p>
    `),
  };
}
