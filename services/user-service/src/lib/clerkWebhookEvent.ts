interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

export interface ClerkUserEventData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export function getPrimaryEmail(data: ClerkUserEventData): string {
  const emails = data.email_addresses ?? [];
  const primary = emails.find((e) => e.id === data.primary_email_address_id) ?? emails[0];
  return primary?.email_address ?? '';
}

export function getFullName(data: ClerkUserEventData): string | null {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}
