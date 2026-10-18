import './style.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SignalDesk | H1 Trading',
  description: 'H1 Forex-Charts und regelbasierte Trading-Signale',
  applicationName: 'SignalDesk',
  appleWebApp: { capable: true, title: 'SignalDesk', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }]
  }
};
export const viewport: Viewport = { themeColor: '#f6faf8', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
