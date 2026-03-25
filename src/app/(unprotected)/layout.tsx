export const dynamic = "force-dynamic";

import SiteThemeProvider from '@/providers/SiteThemeProvider';
import React from "react";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SiteThemeProvider>
      <div className="flex min-h-screen w-full justify-center" style={{ backgroundColor: 'var(--sb-bg-primary)', color: 'var(--sb-text-primary)' }}>
        <div className="w-full">
          {children}
        </div>
      </div>
    </SiteThemeProvider>
  );
}
