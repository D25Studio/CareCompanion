import { type ContactRequestStatus, UNAVAILABLE_REASONS } from '@care/shared';

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(year, month - 1, day),
  );
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  return formatDateTime(iso);
}

export function statusLabel(status: ContactRequestStatus, reasonKey?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Waiting for you';
    case 'accepted':
      return 'Accepted, join the call';
    case 'connected':
      return 'On the call';
    case 'ended':
      return 'Call finished';
    case 'declined':
      return reasonKey && reasonKey in UNAVAILABLE_REASONS
        ? `Declined: ${UNAVAILABLE_REASONS[reasonKey as keyof typeof UNAVAILABLE_REASONS].label}`
        : 'Declined';
    case 'expired':
      return 'No answer in time';
  }
}
