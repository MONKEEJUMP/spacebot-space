export const TIMEZONE = 'America/Chicago';

function toDate(date: Date | string): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

/** "April 1, 2026 at 10:30 PM CT" */
export function formatCentralTime(date: Date | string): string {
  const d = toDate(date);
  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateStr} at ${timeStr} CT`;
}

/** "Apr 1, 2026 CT" */
export function formatCentralTimeShort(date: Date | string): string {
  const d = toDate(date);
  const str = d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${str} CT`;
}

/** "April 1, 2026 at 10:30:45 PM CT" */
export function formatCentralTimestamp(date: Date | string): string {
  const d = toDate(date);
  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${dateStr} at ${timeStr} CT`;
}

/** "10:30 PM CT" — for chat message timestamps */
export function formatCentralTimeOnly(date: Date | string): string {
  const d = toDate(date);
  const str = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${str} CT`;
}

/** "22:30:45 CT" — for terminal HH:MM:SS display */
export function formatCentralHMS(date: Date | string): string {
  const d = toDate(date);
  const str = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${str} CT`;
}

/** "22:30:45.123 CT" — for terminal HH:MM:SS.mmm display */
export function formatCentralHMSms(date: Date | string): string {
  const d = toDate(date);
  const hms = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hms}.${ms} CT`;
}
