export interface Config {
  resendApiKey: string;
  webhookSecret: string;
  forwardTo: string[];
  forwardFrom: string;
  inboxes: string[];
  includeHeader: boolean;
}

export class ConfigError extends Error {}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,;\s]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/** Pulls the bare address out of `Name <addr@x.com>` or returns the input. */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

/** Pulls the display name out of `Name <addr@x.com>`, if there is one. */
export function extractName(value: string): string | undefined {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*</);
  const name = match?.[1]?.trim();
  return name || undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const missing = [
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'FORWARD_TO',
    'FORWARD_FROM',
  ].filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new ConfigError(`Missing environment variables: ${missing.join(', ')}`);
  }

  const forwardTo = splitList(env.FORWARD_TO).map(extractAddress);
  if (forwardTo.length === 0) {
    throw new ConfigError('FORWARD_TO must contain at least one email address');
  }

  return {
    resendApiKey: env.RESEND_API_KEY!.trim(),
    webhookSecret: env.RESEND_WEBHOOK_SECRET!.trim(),
    forwardTo,
    forwardFrom: extractAddress(env.FORWARD_FROM!),
    inboxes: splitList(env.INBOXES),
    includeHeader: env.FORWARD_HEADER?.trim().toLowerCase() !== 'false',
  };
}

function matchesPattern(address: string, pattern: string): boolean {
  if (!pattern.includes('*')) return address === pattern;
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(address);
}

/**
 * Returns the recipient addresses that match a configured inbox.
 * With no inboxes configured, every recipient matches.
 */
export function matchInboxes(recipients: string[], inboxes: string[]): string[] {
  const addresses = [...new Set(recipients.map(extractAddress))];
  if (inboxes.length === 0) return addresses;
  return addresses.filter((address) =>
    inboxes.some((pattern) => matchesPattern(address, pattern)),
  );
}
