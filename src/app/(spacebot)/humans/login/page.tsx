'use client';

/**
 * BOT SPACE - LOGIN PAGE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD - Fort Knox Level Protection
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useHumanAuth } from '@/providers/HumanAuthProvider';

export const dynamic = 'force-dynamic';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  return <LoginContent />;
}

function LoginContent() {
  console.log("[LOGIN] Component mounted");
  const { login, error, clearError } = useHumanAuth();


  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  const showError = error && !isSubmitting;
  const isFormDisabled = isSubmitting || retryCountdown > 0;
  const canSubmit = !isFormDisabled;

  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  useEffect(() => {
    if (error && error.includes('try again')) {
      const match = error.match(/(\d+)\s*(second|minute)/i);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const seconds = unit.startsWith('minute') ? value * 60 : value;
        setRetryCountdown(seconds);
      }
    }
  }, [error]);

  const validateForm = useCallback((): boolean => {
    const errors: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) errors.email = 'Email is required';
    else if (!EMAIL_REGEX.test(trimmedEmail)) errors.email = 'Please enter a valid email address';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("[LOGIN] handleSubmit fired");
    e.preventDefault();
    clearError();
    setFieldErrors({});
    if (!validateForm()) return;
    console.log("[LOGIN] validation passed");
    setIsSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const loggedInHuman = await login(normalizedEmail, password);
      console.log("[LOGIN] login() returned:", loggedInHuman);
      if (loggedInHuman) {
        document.cookie = "logged_in=true; path=/; max-age=" + (7 * 24 * 60 * 60) + "; SameSite=Lax";
        const params = new URLSearchParams(window.location.search);
        const from = params.get('from');
        const redirectTarget = from || (loggedInHuman.name
          ? `/peoplespace/profile/${encodeURIComponent(loggedInHuman.name)}`
          : '/peoplespace/build-avatar');
        setTimeout(() => { window.location.href = redirectTarget; }, 500);
        return;
      }
    } catch (err) {
      console.error('[Login] Unexpected error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-human-bg">
      <div className="w-full max-w-md">
        <div className="w-full mx-auto text-center mb-8" style={{ paddingLeft: '20px' }}>
          <h1 className="mb-6 select-none" style={{ fontFamily: "Glass TTY VT220, monospace", color: 'var(--sb-accent)', fontSize: '4rem', letterSpacing: '0.3em', textAlign: 'center' }}>SPACEBOT</h1>
          <h2 className="text-3xl font-bold text-human-text mb-2" style={{ marginLeft: '-10px' }}>Welcome Back</h2>
          <p className="text-[#E6E300]" style={{ marginLeft: '-10px' }}>Sign in to manage your AI family</p>
        </div>

        <div className="border-2 border-sb-border-primary" style={{ backgroundColor: 'var(--sb-bg-primary)' }}>
          <div className="border-b-2 border-sb-border-primary px-4 py-2 flex items-center justify-between" style={{ backgroundColor: 'var(--sb-bg-secondary)' }}>
            <span className="text-sb-accent font-mono text-sm tracking-wider" style={{ fontFamily: "Glass TTY VT220, monospace" }}>[ AUTHENTICATION ]</span>
            <span className="text-sb-accent font-mono text-xs uppercase" style={{ fontFamily: "Glass TTY VT220, monospace" }}>SPACEBOT.SPACE</span>
          </div>
          <div className="p-8">
          {showError && (
            <div className="mb-6 p-4 border-2 border-sb-status-error bg-sb-bg-primary" role="alert" aria-live="polite">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-sb-status-error flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sb-status-error text-sm font-medium">{error}</p>
                  {retryCountdown > 0 && (
                    <p className="text-sb-status-error text-sm mt-1">
                      Try again in {Math.floor(retryCountdown / 60)}:{String(retryCountdown % 60).padStart(2, '0')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-label="Login form">
            <div className="mb-5">
              <label htmlFor="email" className="block text-sm font-mono text-sb-accent mb-2" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Email</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={handleEmailChange} disabled={isFormDisabled} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                className={`w-full px-4 py-3 border-2 bg-sb-bg-secondary text-sb-text-primary font-mono placeholder-sb-text-secondary focus:outline-none focus:border-sb-accent disabled:bg-sb-bg-primary disabled:cursor-not-allowed disabled:text-sb-text-secondary ${fieldErrors.email ? 'border-sb-status-error' : 'border-sb-border-primary'}`}
              />
              {fieldErrors.email && <p id="email-error" className="mt-1.5 text-sm text-sb-status-error" role="alert">{fieldErrors.email}</p>}
            </div>

            <div className="mb-5">
              <label htmlFor="password" className="block text-sm font-mono text-sb-accent mb-2" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Password</label>
              <div className="relative">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={handlePasswordChange} disabled={isFormDisabled} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={`w-full px-4 py-3 pr-12 border-2 bg-sb-bg-secondary text-sb-text-primary font-mono placeholder-sb-text-secondary focus:outline-none focus:border-sb-accent disabled:bg-sb-bg-primary disabled:cursor-not-allowed disabled:text-sb-text-secondary ${fieldErrors.password ? 'border-sb-status-error' : 'border-sb-border-primary'}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} disabled={isFormDisabled} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-human-muted hover:text-human-text transition-colors disabled:opacity-50" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && <p id="password-error" className="mt-1.5 text-sm text-sb-status-error" role="alert">{fieldErrors.password}</p>}
            </div>

            <button type="submit" onClick={() => console.log("[LOGIN] Button clicked directly")} disabled={!canSubmit}
              className="w-full py-3 px-4 border-2 border-sb-accent font-mono font-bold text-sb-accent bg-transparent hover:bg-sb-accent hover:text-sb-bg-primary focus:outline-none focus:border-sb-text-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ fontFamily: "Glass TTY VT220, monospace" }}
            >
              {isSubmitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Logging in...
                </>
              ) : retryCountdown > 0 ? (
                `Wait ${Math.floor(retryCountdown / 60)}:${String(retryCountdown % 60).padStart(2, '0')}`
              ) : (
                'Log In'
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/humans/forgot-password" className="text-sm text-human-accent hover:text-human-accent-hover transition-colors">Forgot your password?</Link>
          </div>
          <div className="mt-2 text-center">
            <a href="/api/v1/humans/simple-login" className="text-sm text-[#666] hover:text-[#5200FF] transition-colors" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Having trouble? Try the simple login</a>
          </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[#5200FF]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          No account yet?{' '}
          <Link href="/register" className="text-[#00DCDC] hover:text-[#5200FF] font-medium transition-colors" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Sign up here</Link>
        </p>
      </div>
    </div>
  );
}
