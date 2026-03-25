'use client';
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '80vh',
      fontFamily: "'Glass TTY VT220', monospace",
    }}>
      <SignIn />
    </div>
  );
}
