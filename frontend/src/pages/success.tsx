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
  }, []);

  const handleNewSession = () => {
    router.push('/');
  };

  return (
    <>
      <Head>
        <title>Thank You! - Case Bot App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="success-container">
        {/* Background with editor preview */}
        <div className="editor-preview">
          <header className="preview-header">
            <div className="header-left">
              <img src="/icons/sweetrobo-logo.gif" alt="SweetRobo" className="header-logo" />
              <span className="header-title">Case Bot App</span>
            </div>
          </header>

          <div className="canvas-preview">
            <div className="phone-case">
              <div className="corner-marker top-left"></div>
              <div className="corner-marker top-right"></div>
              <div className="corner-marker bottom-left"></div>
              <div className="corner-marker bottom-right"></div>
            </div>
          </div>

          <div className="bottom-tools-preview">
            <div className="tool-icon">✨</div>
            <div className="tool-icon">↻</div>
            <div className="tool-icon">⬚</div>
            <div className="tool-icon">🗑</div>
          </div>

          <div className="submit-button-preview">Submit Image</div>
        </div>

        {/* Thank you modal */}
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-button" onClick={handleNewSession}>✕</button>

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
        </div>

        <style jsx>{`
          .success-container {
            position: relative;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          /* Background editor preview */
          .editor-preview {
            position: absolute;
            inset: 0;
            background: #ffffff;
            opacity: 0.3;
            filter: blur(2px);
          }

          .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }

          .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .header-logo {
            width: 32px;
            height: auto;
          }

          .header-title {
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
          }

          .canvas-preview {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
            height: 400px;
          }

          .phone-case {
            width: 200px;
            height: 320px;
            background: white;
            border-radius: 20px;
            position: relative;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }

          .corner-marker {
            position: absolute;
            width: 16px;
            height: 16px;
          }

          .corner-marker::before,
          .corner-marker::after {
            content: '';
            position: absolute;
            background: #00BCD4;
          }

          .corner-marker.top-left {
            top: 8px;
            left: 8px;
          }

          .corner-marker.top-left::before {
            width: 16px;
            height: 2px;
          }

          .corner-marker.top-left::after {
            width: 2px;
            height: 16px;
          }

          .corner-marker.top-right {
            top: 8px;
            right: 8px;
          }

          .corner-marker.top-right::before {
            width: 16px;
            height: 2px;
            right: 0;
          }

          .corner-marker.top-right::after {
            width: 2px;
            height: 16px;
            right: 0;
          }

          .corner-marker.bottom-left {
            bottom: 8px;
            left: 8px;
          }

          .corner-marker.bottom-left::before {
            width: 16px;
            height: 2px;
            bottom: 0;
          }

          .corner-marker.bottom-left::after {
            width: 2px;
            height: 16px;
            bottom: 0;
          }

          .corner-marker.bottom-right {
            bottom: 8px;
            right: 8px;
          }

          .corner-marker.bottom-right::before {
            width: 16px;
            height: 2px;
            bottom: 0;
            right: 0;
          }

          .corner-marker.bottom-right::after {
            width: 2px;
            height: 16px;
            bottom: 0;
            right: 0;
          }

          .bottom-tools-preview {
            display: flex;
            justify-content: center;
            gap: 24px;
            padding: 16px;
            background: white;
          }

          .tool-icon {
            width: 36px;
            height: 36px;
            background: #f3f4f6;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          }

          .submit-button-preview {
            margin: 0 20px 20px;
            padding: 14px;
            background: #d946ef;
            color: white;
            text-align: center;
            border-radius: 10px;
            font-weight: 600;
          }

          /* Modal overlay */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }

          /* Modal content */
          .modal-content {
            background: white;
            border-radius: 16px;
            padding: 32px 24px 24px;
            width: 100%;
            max-width: 320px;
            text-align: center;
            position: relative;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .close-button {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 20px;
            color: #9ca3af;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
          }

          .close-button:hover {
            background: #f3f4f6;
            color: #6b7280;
          }

          /* Checkmark animation */
          .checkmark-circle {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
          }

          .checkmark {
            width: 72px;
            height: 72px;
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
            font-size: 24px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 12px 0;
          }

          .message {
            font-size: 14px;
            color: #6b7280;
            line-height: 1.5;
            margin: 0 0 20px 0;
          }

          .scan-message {
            font-size: 13px;
            color: #9ca3af;
            margin: 0 0 20px 0;
          }

          .session-info {
            background: #f9fafb;
            border-radius: 8px;
            padding: 12px;
          }

          .session-label {
            font-size: 11px;
            color: #9ca3af;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .session-id {
            font-size: 13px;
            font-family: 'Courier New', monospace;
            color: #6b7280;
            margin: 0;
            word-break: break-all;
          }
        `}</style>
      </div>
    </>
  );
}