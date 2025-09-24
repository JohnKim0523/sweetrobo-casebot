import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  
  // Remove any external overlays that get injected and prevent touch selection
  useEffect(() => {
    // Only apply selection prevention on editor page
    const isEditorPage = router.pathname === '/editor';
    const removeOverlays = () => {
      // Remove PostHog and other analytics overlays
      const selectors = [
        '[class*="posthog"]',
        '[id*="posthog"]',
        '[class*="ph-"]',
        '[data-posthog]',
        'div[style*="position: fixed"][style*="bottom"]',
        'div[style*="position: fixed"][style*="left"]',
        '[class*="analytics"]',
        '[class*="debug"]',
        '[class*="devtools"]'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
    };

    // No additional JavaScript needed - CSS handles selection prevention

    // Run immediately
    removeOverlays();
    
    // Run periodically to catch dynamically injected overlays
    const interval = setInterval(removeOverlays, 1000);
    
    // Also run on DOM changes
    const observer = new MutationObserver(removeOverlays);
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [router.pathname]);

  return <Component {...pageProps} />;
}