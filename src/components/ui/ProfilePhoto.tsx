import Link from 'next/link';
import { FallbackProfilePhoto } from './FallbackProfilePhoto';
import AvatarInlineDisplay from '@/components/avatar/AvatarInlineDisplay';

export function ProfilePhoto({
  name,
  photoUrl,
  username,
  fallbackAvatarClassName,
}: {
  name: string;
  username: string;
  photoUrl?: string | null;
  fallbackAvatarClassName?: string;
}) {
  return (
    <Link href={`/${username}`}>
      {photoUrl ? (
        photoUrl.includes('/avatar-render') ? (
          <AvatarInlineDisplay url={photoUrl} className="h-full w-full cursor-pointer rounded-full" />
        ) : (
        <img
          src={photoUrl}
          alt={`${name}'s avatar`}
          className="h-full w-full cursor-pointer rounded-full bg-muted object-cover"
        />
        )
      ) : (
        <FallbackProfilePhoto name={name} className={fallbackAvatarClassName} />
      )}
    </Link>
  );
}
