export type InternalCallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BUSY'
  | 'NO_ANSWER'
  | 'FAILED'
  | 'CANCELED'
  | 'PROVIDER_REPORTED';

export type DurationSource = 'PROVIDER_REPORTED' | 'SERVER_CALCULATED' | 'UNKNOWN';

export const TERMINAL_CALL_STATUSES: ReadonlySet<InternalCallStatus> = new Set([
  'COMPLETED',
  'BUSY',
  'NO_ANSWER',
  'FAILED',
  'CANCELED',
]);

/**
 * Maps raw provider call status to a normalized internal VoiceNuvo lifecycle state.
 * Never throws on unrecognized status; safely falls back to PROVIDER_REPORTED.
 */
export function normalizeCallStatus(rawStatus?: string | null): InternalCallStatus {
  if (!rawStatus || typeof rawStatus !== 'string') {
    return 'QUEUED';
  }

  const clean = rawStatus.trim().toLowerCase().replace(/[_\s]+/g, '-');

  switch (clean) {
    case 'dispatched':
    case 'queued':
    case 'pending':
    case 'scheduled':
      return 'QUEUED';

    case 'ringing':
    case 'dialing':
      return 'RINGING';

    case 'in-progress':
    case 'active':
    case 'connected':
    case 'talking':
      return 'IN_PROGRESS';

    case 'completed':
    case 'success':
    case 'finished':
    case 'ended':
      return 'COMPLETED';

    case 'busy':
      return 'BUSY';

    case 'no-answer':
    case 'unanswered':
    case 'missed':
      return 'NO_ANSWER';

    case 'failed':
    case 'error':
    case 'rejected':
      return 'FAILED';

    case 'canceled':
    case 'cancelled':
      return 'CANCELED';

    default:
      return 'PROVIDER_REPORTED';
  }
}

/**
 * Validates whether a call state transition is valid.
 * Prevents stale webhook events from downgrading a terminal call.
 */
export function canTransitionCallStatus(
  currentStatus: InternalCallStatus,
  newStatus: InternalCallStatus
): boolean {
  if (currentStatus === newStatus) return true;

  // Once terminal, cannot transition back to non-terminal states
  if (TERMINAL_CALL_STATUSES.has(currentStatus)) {
    // Only allow transition from one terminal state to another if updating to a more specific outcome
    return false;
  }

  return true;
}

/**
 * Normalizes duration to integer seconds and records the authoritative source.
 */
export function normalizeCallDuration(options: {
  seconds?: number | string | null;
  displayDuration?: string | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
}): { durationSeconds: number; durationSource: DurationSource } {
  // 1. Authoritative numeric seconds from provider
  if (options.seconds !== undefined && options.seconds !== null) {
    const num = Number(options.seconds);
    if (!Number.isNaN(num) && num >= 0) {
      return {
        durationSeconds: Math.round(num),
        durationSource: 'PROVIDER_REPORTED',
      };
    }
  }

  // 2. Formatted string like "1:42" or "0:0"
  if (options.displayDuration && typeof options.displayDuration === 'string') {
    const parts = options.displayDuration.trim().split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        return {
          durationSeconds: Math.max(0, minutes * 60 + seconds),
          durationSource: 'PROVIDER_REPORTED',
        };
      }
    } else if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        return {
          durationSeconds: Math.max(0, hours * 3600 + minutes * 60 + seconds),
          durationSource: 'PROVIDER_REPORTED',
        };
      }
    }
  }

  // 3. Fallback server calculation from start and end timestamps
  if (options.startedAt && options.endedAt) {
    const start = new Date(options.startedAt).getTime();
    const end = new Date(options.endedAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return {
        durationSeconds: Math.round((end - start) / 1000),
        durationSource: 'SERVER_CALCULATED',
      };
    }
  }

  return {
    durationSeconds: 0,
    durationSource: 'UNKNOWN',
  };
}

/**
 * Format duration in seconds to mm:ss display
 */
export function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
