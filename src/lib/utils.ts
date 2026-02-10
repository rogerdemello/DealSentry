import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// IST (Indian Standard Time) timezone
const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Format a date in IST timezone
 */
export function formatIST(date: Date | string, formatStr: string): string {
  return formatInTimeZone(date, IST_TIMEZONE, formatStr);
}

/**
 * Format distance to now in IST
 */
export function formatDistanceToNowIST(date: Date | string, options?: { addSuffix?: boolean }): string {
  // For relative time, we don't need timezone conversion as it's just calculating the difference
  return formatDistanceToNow(date, options);
}

/**
 * Convert date to IST string (for display)
 */
export function toISTString(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
