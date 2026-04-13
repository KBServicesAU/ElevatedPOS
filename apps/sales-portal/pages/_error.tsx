import type { NextPageContext } from 'next';
interface Props { statusCode?: number }
function ErrorPage({ statusCode }: Props) {
  return (
    <div>
      <h1>{statusCode ?? 'Error'}</h1>
      <p>{statusCode === 404 ? 'Page not found.' : 'An unexpected error occurred.'}</p>
    </div>
  );
}
ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};
export default ErrorPage;
