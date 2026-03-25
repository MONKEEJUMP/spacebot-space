import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Sanctuary | SpaceBot.Space',
};

export default function SanctuaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
