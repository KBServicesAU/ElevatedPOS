/**
 * Minimal Pages Router app wrapper.
 *
 * Overrides Next.js's default _app which wraps every page with styled-jsx's
 * StyleRegistry. In Next.js 14.2.x, the StyleRegistry fails during prerender
 * of /_error pages with:
 *   TypeError: Cannot read properties of null (reading 'useContext')
 *
 * This minimal _app bypasses styled-jsx entirely for Pages Router pages.
 * The storefront is an App Router project — Pages Router is only present to
 * provide custom 404/500 error pages without the styled-jsx overhead.
 */
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
