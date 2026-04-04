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

/**
 * Convert markdown formatting to HTML
 * Handles common markdown patterns like **bold**, *italic*, etc.
 */
export function markdownToHtml(text: string): string {
  if (!text) return '';
  
  let html = text;
  
  // Convert headers (must be at start of line)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Convert **bold** to <strong>bold</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic* to <em>italic</em> (but not ** that was already processed)
  html = html.replace(/\*(.+?)\*(?!\*)/g, '<em>$1</em>');
  
  // Convert __underline__ to <u>underline</u>
  html = html.replace(/__(.+?)__/g, '<u>$1</u>');
  
  // Convert bullet points
  html = html.replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>');
  
  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>');
  
  return html;
}
