import { NextPageContext } from 'next';
import Head from 'next/head';
import posthog from 'posthog-js';
import { useEffect } from 'react';

interface ErrorProps {
  statusCode: number;
  hasGetInitialPropsRun?: boolean;
  err?: Error;
}

function Error({ statusCode, err }: ErrorProps) {
  useEffect(() => {
    if (err) {
      posthog.captureException(err);
    } else {
      posthog.captureException(new Error(`Error ${statusCode}`), {
        extra: {
          statusCode,
          type: 'http_error'
        }
      });
    }
  }, [statusCode, err]);

  return (
    <>
      <Head>
        <title>Error {statusCode}</title>
      </Head>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h1 style={{ fontSize: '4rem', margin: '0', color: '#333' }}>
          {statusCode}
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#666', marginTop: '10px' }}>
          {statusCode === 404
            ? 'This page could not be found.'
            : 'An error occurred on the server.'}
        </p>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            marginTop: '30px',
            padding: '12px 24px',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0051cc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0070f3'}
        >
          Go to Home
        </button>
      </div>
    </>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode, err };
};

export default Error;