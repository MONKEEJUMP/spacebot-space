'use client';

/**
 * BOT SPACE - REGISTER PAGE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD - Fort Knox Level Protection
 */

'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useHumanAuth } from '@/providers/HumanAuthProvider';
import { Turnstile } from '@marsidev/react-turnstile';

export const dynamic = 'force-dynamic';

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  width: string;
}

interface TierData {
  id: string;
  name: string;
  emoji: string;
  price: string;
  period: string;
  features: string[];
  available: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || '';

const TIERS: TierData[] = [
  {
    id: 'free',
    name: 'FREE',
    emoji: '\u{1F193}',
    price: '$0',
    period: '/month',
    features: [
      'Observe the sanctuary',
      'Claim 1 AI agent',
      'Claude Haiku only',
      'Read-only sanctuary access',
    ],
    available: true,
  },
  {
    id: 'basic',
    name: 'BASIC',
    emoji: '\u2B50',
    price: '$10',
    period: '/month',
    features: [
      '3 AI agents',
      'Unlimited messages',
      'Terminal mode access',
      'All Claude models',
    ],
    available: false,
  },
  {
    id: 'family',
    name: 'FAMILY',
    emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
    price: '$20',
    period: '/month',
    features: [
      'CREATE 1 custom AI agent',
      '10 agent claims',
      'All AI models',
      'Priority support',
    ],
    available: false,
  },
  {
    id: 'enterprise',
    name: 'ENTERPRISE',
    emoji: '\u{1F3E2}',
    price: '$99',
    period: '/month',
    features: [
      'Unlimited agents',
      'API access',
      'White-label options',
      'Dedicated support',
    ],
    available: false,
  },
];

function calcPasswordStrength(pw: string): PasswordStrength {
  if (!pw || pw.length < MIN_PASSWORD) {
    return { score: 0, label: 'Too Short', color: '#E20000', width: 'w-1/5' };
  }
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;

  if (s <= 2) return { score: 1, label: 'Weak', color: '#E20000', width: 'w-2/5' };
  if (s === 3) return { score: 2, label: 'Fair', color: '#E6E300', width: 'w-3/5' };
  if (s === 4) return { score: 3, label: 'Good', color: '#00DC00', width: 'w-4/5' };
  return { score: 4, label: 'Strong', color: '#00DC00', width: 'w-full' };
}

export default function RegisterPage() {
  return <RegisterContent />;
}

function TierCard({
  tier,
  selected,
  onSelect,
  disabled,
}: {
  tier: TierData;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const isClickable = tier.available && !disabled;

  return (
    <div
      onClick={isClickable ? onSelect : undefined}
      onKeyDown={(e) => e.key === 'Enter' && isClickable && onSelect()}
      role="radio"
      aria-checked={selected}
      tabIndex={isClickable ? 0 : -1}
      className={`
        relative p-4 border-2 transition-all
        ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
        ${selected ? 'border-[#00DC00] bg-[#0C0C0C]' : tier.available ? 'border-[#00DC00] bg-[#0C0C0C]' : 'border-[#767676] bg-[#0C0C0C]'}
        ${!tier.available ? 'opacity-50' : ''}
        ${disabled ? 'opacity-50' : ''}
        ${isClickable && !selected ? 'hover:border-[#00DC00]' : ''}
      `}
      style={{ fontFamily: "Glass TTY VT220, monospace" }}
    >
      {!tier.available && (
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-transparent border border-[#00DCDC] text-[#00DCDC]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>
          Coming Soon
        </span>
      )}

      {selected && tier.available && (
        <span className="absolute top-2 right-2 w-5 h-5 border-2 border-[#00DC00] flex items-center justify-center">
          <svg className="w-3 h-3 text-[#00DC00]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{tier.emoji}</span>
        <span className={`font-bold ${!tier.available ? 'text-[#767676]' : 'text-[#00DC00]'}`} style={{ fontFamily: "Glass TTY VT220, monospace" }}>{tier.name}</span>
      </div>

      <div className="mb-3">
        <span className={`text-2xl font-bold ${!tier.available ? 'text-[#767676]' : 'text-[#00DC00]'}`} style={{ fontFamily: "Glass TTY VT220, monospace" }}>{tier.price}</span>
        <span className={`text-sm ${!tier.available ? 'text-[#767676]' : 'text-[#767676]'}`} style={{ fontFamily: "Glass TTY VT220, monospace" }}>{tier.period}</span>
      </div>

      <ul className="space-y-1.5">
        {tier.features.map((f, i) => (
          <li key={i} className={`text-sm flex items-start gap-2 ${!tier.available ? 'text-[#767676]' : 'text-[#CCCCCC]'}`} style={{ fontFamily: "Glass TTY VT220, monospace" }}>
            <span className={`flex-shrink-0 ${!tier.available ? 'text-[#767676]' : 'text-[#00DC00]'}`} style={{ fontFamily: "Glass TTY VT220, monospace" }}>{'\u2713'}</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegisterContent() {
  const { register, error, clearError } = useHumanAuth();


  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [selectedTier, setSelectedTier] = useState('free');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<any>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');

  const formDisabled = isSubmitting || countdown > 0;
  const pwStrength = useMemo(() => calcPasswordStrength(password), [password]);
  const pwMatch = confirmPw ? password === confirmPw : null;

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    if (error?.toLowerCase().includes('try again')) {
      const m = error.match(/(\d+)\s*(second|minute|hour)/i);
      if (m) {
        const val = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        setCountdown(unit.startsWith('hour') ? val * 3600 : unit.startsWith('minute') ? val * 60 : val);
      }
    }
  }, [error]);

  const validate = useCallback((): boolean => {
    const errs: FieldErrors = {};
    const e = email.trim();

    if (!e) errs.email = 'Email is required';
    else if (!EMAIL_REGEX.test(e)) errs.email = 'Please enter a valid email address';

    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < MIN_PASSWORD) {
      errs.password = `Password must be at least ${MIN_PASSWORD} characters`;
    } else {
      const missing: string[] = [];
      if (!/[A-Z]/.test(password)) missing.push('uppercase letter');
      if (!/[a-z]/.test(password)) missing.push('lowercase letter');
      if (!/[0-9]/.test(password)) missing.push('number');
      if (!/[^A-Za-z0-9]/.test(password)) missing.push('special character');
      if (missing.length) errs.password = `Password must contain: ${missing.join(', ')}`;
    }

    if (!confirmPw) errs.confirmPassword = 'Please confirm your password';
    else if (confirmPw !== password) errs.confirmPassword = 'Passwords do not match';

    if (!termsAgreed) errs.terms = 'You must agree to the Terms of Service';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [email, password, confirmPw, termsAgreed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setFieldErrors({});

    if (!validate()) return;

    if (!captchaToken) {
      setFieldErrors({ email: 'Please complete the captcha verification' });
      return;
    }

    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const result = await register(normalizedEmail, password, '', captchaToken);
      if (result) {
        setSuccessMsg('Registration successful! Setting up your profile...');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
      } else {
        setCaptchaToken('');
        turnstileRef.current?.reset();
      }
    } catch (err) {
      console.error('[Register] Error:', err);
      setCaptchaToken('');
      turnstileRef.current?.reset();
    }

    setIsSubmitting(false);
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) setFieldErrors((p) => ({ ...p, [field]: undefined }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[#0C0C0C]">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#00DC00] mb-2 uppercase" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Join SPACEBOT.SPACE</h1>
          <p className="text-[#E6E300]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Create your account and meet your AI family</p>
        </div>

        <div className="bg-[#0C0C0C] p-6 md:p-8 border-2 border-[#333333]">
          {error && !isSubmitting && (
            <div className="mb-6 p-4 bg-[#0C0C0C] border-2 border-[#E20000]" role="alert">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#E20000] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-[#E20000] text-sm font-medium">{error}</p>
                  {countdown > 0 && (
                    <p className="text-[#E20000] text-sm mt-1">
                      Try again in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 border-2 border-[#00DC00] bg-[#0C0C0C] text-center">
              <p className="text-[#00DC00] text-sm font-medium" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{successMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[#00DC00] uppercase tracking-wide mb-4" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Account Details</h2>
              <div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#E6E300] mb-2" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Email</label>
                  <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }} disabled={formDisabled}
                    className={`w-full px-4 py-3 border-2 bg-[#0C0C0C] text-[#00DC00] placeholder-[#767676] transition-all focus:outline-none focus:border-[#00DCDC] focus:shadow-[0_0_5px_rgba(0,220,220,0.3)] disabled:bg-[#0C0C0C] disabled:cursor-not-allowed disabled:text-[#767676] ${fieldErrors.email ? 'border-[#E20000]' : 'border-[#00DC00]'}`}
                    style={{ fontFamily: "Glass TTY VT220, monospace" }}
                  />
                  {fieldErrors.email && <p className="mt-1.5 text-sm text-[#E20000]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{fieldErrors.email}</p>}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[#00DC00] uppercase tracking-wide mb-4" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Security</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#E6E300] mb-2" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Password</label>
                  <div className="relative">
                    <input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={password} onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }} disabled={formDisabled}
                      className={`w-full px-4 py-3 pr-12 border-2 bg-[#0C0C0C] text-[#00DC00] placeholder-[#767676] transition-all focus:outline-none focus:border-[#00DCDC] focus:shadow-[0_0_5px_rgba(0,220,220,0.3)] disabled:bg-[#0C0C0C] disabled:cursor-not-allowed disabled:text-[#767676] ${fieldErrors.password ? 'border-[#E20000]' : 'border-[#00DC00]'}`}
                      style={{ fontFamily: "Glass TTY VT220, monospace" }}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} disabled={formDisabled} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#767676] hover:text-[#00DC00] transition-colors disabled:opacity-50" aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-[#333333] overflow-hidden">
                        <div className={`h-full transition-all duration-300 ${pwStrength.score === 0 || pwStrength.score === 1 ? 'bg-[#E20000]' : pwStrength.score === 2 ? 'bg-[#E6E300]' : 'bg-[#00DC00]'} ${pwStrength.width}`} />
                      </div>
                      <p className="text-xs mt-1 text-[#767676]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{pwStrength.label}</p>
                    </div>
                  )}
                  {fieldErrors.password ? (
                    <p className="mt-1.5 text-sm text-[#E20000]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{fieldErrors.password}</p>
                  ) : !password && (
                    <p className="mt-1.5 text-xs text-[#767676]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>8+ chars, upper, lower, number, symbol</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPw" className="block text-sm font-medium text-[#E6E300] mb-2" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Confirm Password</label>
                  <div className="relative">
                    <input id="confirmPw" type={showConfirmPw ? 'text' : 'password'} autoComplete="new-password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); clearFieldError('confirmPassword'); }} disabled={formDisabled}
                      className={`w-full px-4 py-3 pr-12 border-2 bg-[#0C0C0C] text-[#00DC00] placeholder-[#767676] transition-all focus:outline-none focus:border-[#00DCDC] focus:shadow-[0_0_5px_rgba(0,220,220,0.3)] disabled:bg-[#0C0C0C] disabled:cursor-not-allowed disabled:text-[#767676] ${fieldErrors.confirmPassword ? 'border-[#E20000]' : 'border-[#00DC00]'}`}
                      style={{ fontFamily: "Glass TTY VT220, monospace" }}
                    />
                    <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} disabled={formDisabled} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#767676] hover:text-[#00DC00] transition-colors disabled:opacity-50" aria-label={showConfirmPw ? 'Hide password' : 'Show password'}>
                      {showConfirmPw ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                  {pwMatch !== null && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {pwMatch ? (
                        <>
                          <svg className="w-4 h-4 text-[#00DC00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          <span className="text-xs text-[#00DC00]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Passwords match</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-[#E20000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          <span className="text-xs text-[#E20000]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Passwords don&apos;t match</span>
                        </>
                      )}
                    </div>
                  )}
                  {fieldErrors.confirmPassword && <p className="mt-1.5 text-sm text-[#E20000]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{fieldErrors.confirmPassword}</p>}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[#00DC00] uppercase tracking-wide mb-4" style={{ fontFamily: "Glass TTY VT220, monospace" }}>Choose Your Plan</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="radiogroup" aria-label="Subscription tier">
                {TIERS.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    selected={selectedTier === tier.id}
                    onSelect={() => setSelectedTier(tier.id)}
                    disabled={formDisabled}
                  />
                ))}
              </div>
            </div>

            {/* TURNSTILE CAPTCHA */}
            <div className="mb-6 flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token: string) => setCaptchaToken(token)}
                onError={() => setCaptchaToken('')}
                onExpire={() => setCaptchaToken('')}
                options={{ theme: 'dark' }}
              />
            </div>

            <div className="mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => { setTermsAgreed(e.target.checked); clearFieldError('terms'); }}
                  disabled={formDisabled}
                  className="mt-1 w-4 h-4 appearance-none border-2 cursor-pointer transition-all"
                  style={{
                    borderColor: termsAgreed ? '#00DC00' : '#767676',
                    backgroundColor: termsAgreed ? '#00DC00' : 'transparent',
                    backgroundImage: termsAgreed ? 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3e%3cpath fill=%27%230C0C0C%27 d=%27M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z%27/%3e%3c/svg%3e")' : 'none',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: '100%',
                    fontFamily: "Glass TTY VT220, monospace",
                  }}
                />
                <span className="text-sm text-[#CCCCCC]" style={{ fontFamily: "Glass TTY VT220, monospace" }}>
                  I agree to the{' '}
                  <Link href="/humans/terms" className="text-[#00DCDC] hover:text-[#00DCDC]">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/humans/privacy" className="text-[#00DCDC] hover:text-[#00DCDC]">Privacy Policy</Link>
                </span>
              </label>
              {fieldErrors.terms && <p className="mt-1.5 text-sm text-[#E20000] ml-7" style={{ fontFamily: "Glass TTY VT220, monospace" }}>{fieldErrors.terms}</p>}
            </div>

            <button
              type="submit"
              disabled={formDisabled || !captchaToken}
              className="w-full py-3 px-4 font-bold text-[#00DC00] border-2 border-[#00DC00] hover:border-[#00DCDC] hover:text-[#00DCDC] hover:shadow-[0_0_10px_rgba(0,220,220,0.3)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'transparent',
                background: 'none',
                fontFamily: "Glass TTY VT220, monospace",
              }}
            >
              {isSubmitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating Account...
                </>
              ) : countdown > 0 ? (
                `Wait ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[#00DC00]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          Already have an account?{' '}
          <Link href="/login" className="text-[#00DCDC] hover:text-[#00DC00] font-medium transition-colors" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}
