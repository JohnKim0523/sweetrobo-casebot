import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState } from 'react';

export default function Success() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    // Generate a session ID
    const id = Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    setSessionId(id.toUpperCase().substring(0, 20));

    // Prevent back navigation - more aggressive approach
    const preventBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      window.history.go(1);
    };

    // Push multiple states to make it harder to go back
    window.history.pushState(null, '', window.location.href);
    window.history.pushState(null, '', window.location.href);

    // Listen for popstate (back button)
    window.addEventListener('popstate', preventBack);

    // Also prevent beforeunload
    const preventUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);

    return () => {
      window.removeEventListener('popstate', preventBack);
      window.removeEventListener('beforeunload', preventUnload);
    };
  }, []);

  return (
    <>
      <Head>
        <title>Thank You! - Case Bot App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="success-page">
        <div className="content-wrapper">
          <div className="checkmark-circle">
            <svg className="checkmark" viewBox="0 0 52 52">
              <circle className="checkmark-circle-bg" cx="26" cy="26" r="25" fill="none"/>
              <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>

          <h1>Thank you!</h1>
          <p className="message">
            Your design has been submitted successfully. Your custom print will be ready shortly.
          </p>

          <p className="scan-message">
            Please scan QR code to start a new session.
          </p>

          <div className="session-info">
            <p className="session-label">Session ID</p>
            <p className="session-id">{sessionId || 'Loading...'}</p>
          </div>
        </div>

        <style jsx>{`
          .success-page {
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          .content-wrapper {
            background: white;
            border-radius: 24px;
            padding: 48px 32px;
            width: 100%;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          /* Checkmark animation */
          .checkmark-circle {
            width: 80px;
            height: 80px;
            margin: 0 auto 32px;
          }

          .checkmark {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: block;
            stroke-width: 2;
            stroke: #fff;
            stroke-miterlimit: 10;
            animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
          }

          .checkmark-circle-bg {
            stroke-dasharray: 166;
            stroke-dashoffset: 166;
            stroke-width: 2;
            stroke-miterlimit: 10;
            stroke: #d946ef;
            fill: #d946ef;
            animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
          }

          .checkmark-check {
            transform-origin: 50% 50%;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            stroke: white;
            animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
          }

          @keyframes stroke {
            100% {
              stroke-dashoffset: 0;
            }
          }

          @keyframes scale {
            0%, 100% {
              transform: none;
            }
            50% {
              transform: scale3d(1.1, 1.1, 1);
            }
          }

          h1 {
            font-size: 32px;
            font-weight: 700;
            color: #1a1a1a;
            margin: 0 0 16px 0;
          }

          .message {
            font-size: 16px;
            color: #6b7280;
            line-height: 1.6;
            margin: 0 0 24px 0;
          }

          .scan-message {
            font-size: 15px;
            color: #9ca3af;
            margin: 0 0 32px 0;
            font-weight: 500;
          }

          .session-info {
            background: #f9fafb;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e5e7eb;
          }

          .session-label {
            font-size: 12px;
            color: #9ca3af;
            margin: 0 0 8px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
          }

          .session-id {
            font-size: 14px;
            font-family: 'Courier New', monospace;
            color: #374151;
            margin: 0;
            word-break: break-all;
            font-weight: 600;
          }
        `}</style>
      </div>
    </>
  );
}
