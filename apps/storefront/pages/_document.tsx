/**
 * Custom Document — overrides Next.js's default Pages Router document.
 *
 * The default _document uses styled-jsx's StyleRegistry, which crashes
 * in Next.js 14.2.x during prerender of error pages:
 *   TypeError: Cannot read properties of null (reading 'useContext')
 *
 * This minimal _document bypasses styled-jsx entirely for Pages Router pages.
 */
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
