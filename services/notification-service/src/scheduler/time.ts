/** "HH:mm" in the given IANA timezone, matching the UserSettings.reminderTime format. */
export function formatTimeInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** "YYYY-MM-DD" calendar date in the given IANA timezone, used as the dedup key for a reminder run. */
export function getLocalDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
