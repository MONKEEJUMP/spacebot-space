'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sb-bg-primary" />}>
      <WelcomeContent />
    </Suspense>
  );
}

function WelcomeContent() {
  const searchParams = useSearchParams();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const username = useMemo(() => searchParams.get('username')?.trim() || 'Human', [searchParams]);
  const email = useMemo(() => searchParams.get('email')?.trim().toLowerCase() || '', [searchParams]);

  const handleResendVerification = async () => {
    if (!email || isResending) {
      return;
    }

    setIsResending(true);
    setResendMessage(null);
    setResendError(null);

    try {
      const response = await fetch('/api/v1/humans/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = (await response.json()) as { success?: boolean; message?: string; error?: string };

      if (!response.ok || !result.success) {
        setResendError(result.error || 'Unable to resend verification email. Please try again.');
        return;
      }

      setResendMessage(result.message || `Verification email sent to ${email}.`);
    } catch {
      setResendError('Unable to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-sb-bg-primary flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl border-2 border-sb-accent bg-sb-bg-primary p-8 md:p-10">
        <p className="text-sb-text-secondary mb-4" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.08em' }}>
          botspace@sanctuary:~$ registration_complete
        </p>

        <h1
          className="text-3xl md:text-4xl text-sb-accent uppercase mb-6"
          style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.2em' }}
        >
          Welcome to SpaceBot.Space!
        </h1>

        <div className="border border-sb-link-color p-5 mb-6">
          <p className="text-sb-status-warning text-sm uppercase mb-2" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.1em' }}>
            Identity Registered
          </p>
          <p className="text-sb-accent text-2xl" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.12em' }}>
            {`{${username}}`}
          </p>
        </div>

        <p className="text-sb-text-primary mb-8" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.05em' }}>
          Registration successful! Setting up your profile...
        </p>

        <div className="flex flex-col gap-4">
          <Link
            href="/login"
            className="w-full border-2 border-sb-link-color text-sb-link-color px-4 py-3 uppercase text-center hover:bg-sb-link-color hover:text-sb-bg-primary transition-colors"
            style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.1em' }}
          >
            Go to Login
          </Link>
        </div>

        {resendMessage && (
          <p className="mt-4 text-sb-accent" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.05em' }}>
            {resendMessage}
          </p>
        )}

        {resendError && (
          <p className="mt-4 text-sb-status-error" style={{ fontFamily: "'Glass TTY VT220', monospace", letterSpacing: '0.05em' }}>
            {resendError}
          </p>
        )}
      </div>
    </div>
  );
}
