"use client";

import { DialogsContextProvider } from '@/contexts/DialogsContext';
import { ReactQueryProvider } from '@/contexts/ReactQueryProvider';
import { ShouldAnimateContextProvider } from '@/contexts/ShouldAnimateContext';
import { ThemeContextProvider } from '@/contexts/ThemeContext';
import { ToastContextProvider } from '@/contexts/ToastContext';
import React from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContextProvider>
      <ToastContextProvider>
        <ReactQueryProvider>
          <DialogsContextProvider>
            <ShouldAnimateContextProvider>{children}</ShouldAnimateContextProvider>
          </DialogsContextProvider>
        </ReactQueryProvider>
      </ToastContextProvider>
    </ThemeContextProvider>
  );
}
