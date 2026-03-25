'use client';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: Readonly<PageHeaderProps>) {
  return (
    <header className="mb-8 pt-2">
      <h1
        className="text-[#00DC00] font-bold text-2xl sm:text-3xl tracking-wide"
        style={{
          fontFamily: "'Glass TTY VT220', monospace",
          textShadow: '0 0 10px rgba(0, 220, 0, 0.3)',
          lineHeight: '1.2',
          minHeight: '42px',
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[#767676] text-sm sm:text-base mt-2">
          {subtitle}
        </p>
      )}
    </header>
  );
}
