import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import './globals.css';
const siteOrigin =
  (env as unknown as { SITE_URL?: string }).SITE_URL || 'http://localhost:3000';
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'Postseason Hits Pool',
  description: 'MLB playoff draft and postseason hit standings.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Postseason Hits Pool',
    description: 'AL, NL and wildcard picks. Combined postseason hits.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1730,
        height: 909,
        alt: 'Postseason Hits Pool — AL · NL · Wildcard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postseason Hits Pool',
    description: 'AL, NL and wildcard picks. Combined postseason hits.',
    images: ['/og.png'],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
