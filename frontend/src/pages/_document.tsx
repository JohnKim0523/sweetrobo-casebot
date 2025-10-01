// Custom document for Next.js
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&family=Lato:wght@400;700&family=Montserrat:wght@400;700&family=Playfair+Display:wght@400;700&family=Merriweather:wght@400;700&family=Pacifico&family=Dancing+Script:wght@400;700&family=Lobster&family=Bebas+Neue&family=Oswald:wght@400;700&family=Raleway:wght@400;700&family=Poppins:wght@400;700&family=Indie+Flower&family=Permanent+Marker&family=Satisfy&family=Great+Vibes&family=Caveat:wght@400;700&family=Shadows+Into+Light&family=Architects+Daughter&display=swap" rel="stylesheet" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
