export const dynamic = 'force-dynamic';

import SiteThemeProvider from '@/providers/SiteThemeProvider';
import { HumanAuthProvider } from '@/providers/HumanAuthProvider';
import ConditionalChrome from '@/components/ConditionalChrome';

export default function SpaceBotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteThemeProvider>
      <HumanAuthProvider>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--sb-bg-primary)', color: 'var(--sb-text-primary)', fontFamily: 'var(--sb-font-body, Fira Code, monospace)' }}>
          <div className="min-h-screen flex flex-col">
            <main className="flex-1 p-4 overflow-auto">
              <ConditionalChrome>{children}</ConditionalChrome>
            </main>
          </div>
        </div>
      </HumanAuthProvider>
    </SiteThemeProvider>
  );
}
