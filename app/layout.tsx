import type { ReactNode } from 'react';

export const metadata = {
  title: 'Resend Forwarding',
  description: 'Forward emails received by Resend to your personal inbox.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 640,
          margin: '64px auto',
          padding: '0 24px',
          lineHeight: 1.5,
          color: '#111',
        }}
      >
        {children}
      </body>
    </html>
  );
}
