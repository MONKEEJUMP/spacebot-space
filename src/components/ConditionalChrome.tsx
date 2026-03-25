'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const EMBEDDED_ROUTES = ['/expertspace', '/botspace'];

export default function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  return <>{children}</>;
}
