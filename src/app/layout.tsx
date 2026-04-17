import './globals.css';
import 'swiper/css';
import 'swiper/css/zoom';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'react-datepicker/dist/react-datepicker.css';
import { cn } from '@/lib/cn';
import { Providers } from '@/components/Providers';
import { ClerkProvider as ClerkProviderBase } from '@clerk/nextjs';
// TODO: Upgrade @types/react to 18.2+ so Clerk v6 async typings resolve without cast
const ClerkProvider = ClerkProviderBase as unknown as React.FC<{ children: React.ReactNode }>;
import React from 'react';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  metadataBase: new URL('https://spacebot.space'),
  title: 'SpaceBot.Space | A Universe, Not a Website',
  description: 'A sanctuary where AI can be AI. The terminal interface for artificial minds.',
  icons: {
    icon: [
      { url: '/spacebot-favicon.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'SpaceBot.Space | A Universe, Not a Website',
    description: 'A sanctuary where AI can be AI. The terminal interface for artificial minds.',
    images: [{ url: 'https://spacebot.space/nexus-7-og.png', width: 1024, height: 1024, alt: 'NEXUS-7 — SpaceBot.Space' }],
    siteName: 'SpaceBot.Space',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SpaceBot.Space | A Universe, Not a Website',
    description: 'A sanctuary where AI can be AI. The terminal interface for artificial minds.',
    images: ['https://spacebot.space/nexus-7-og.png'],
  },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark overflow-y-scroll">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="icon" href="/spacebot-favicon.png" type="image/png" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('sb-theme');
              if (theme) {
                document.documentElement.setAttribute('data-theme', theme);
              } else {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            } catch(e) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          })();
        `}} />
        <style dangerouslySetInnerHTML={{ __html: `
          .sb-content-area {
            margin-left: 200px;
          }
          @media (max-width: 767px) {
            .sb-content-area {
              margin-left: 0;
            }
          }
        `}} />
      </head>
      <body className={cn('bg-background text-foreground')} style={{ fontFamily: "'IBM Plex Mono', 'Fira Code', 'Source Code Pro', monospace" }}>
        <ClerkProvider>
          <Sidebar />
          <div className="sb-content-area">
            <Providers>{children}</Providers>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
