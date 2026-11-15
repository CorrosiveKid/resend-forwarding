import { describe, expect, it } from 'vitest';
import { ConfigError, extractAddress, extractName, loadConfig, matchInboxes } from '@/lib/config';

const base = {
  RESEND_API_KEY: 're_test',
  RESEND_WEBHOOK_SECRET: 'whsec_test',
  FORWARD_TO: 'me@gmail.com',
  FORWARD_FROM: 'Forwarder <fwd@acme.dev>',
};

describe('loadConfig', () => {
  it('parses required and optional values', () => {
    const config = loadConfig({
      ...base,
      FORWARD_TO: 'Me@Gmail.com, other@example.com',
      INBOXES: 'hello@acme.dev, *@side.dev',
    });
    expect(config.forwardTo).toEqual(['me@gmail.com', 'other@example.com']);
    expect(config.forwardFrom).toBe('fwd@acme.dev');
    expect(config.inboxes).toEqual(['hello@acme.dev', '*@side.dev']);
    expect(config.includeHeader).toBe(true);
  });

  it('reports missing variables', () => {
    expect(() => loadConfig({ RESEND_API_KEY: 're_x' })).toThrow(ConfigError);
  });

  it('can disable the header', () => {
    expect(loadConfig({ ...base, FORWARD_HEADER: 'false' }).includeHeader).toBe(false);
  });
});

describe('address helpers', () => {
  it('extracts address and name', () => {
    expect(extractAddress('"Jane Doe" <Jane@Example.com>')).toBe('jane@example.com');
    expect(extractAddress('jane@example.com')).toBe('jane@example.com');
    expect(extractName('"Jane Doe" <jane@example.com>')).toBe('Jane Doe');
    expect(extractName('jane@example.com')).toBeUndefined();
  });
});

describe('matchInboxes', () => {
  it('matches everything when no inboxes are configured', () => {
    expect(matchInboxes(['a@x.com', 'B@x.com'], [])).toEqual(['a@x.com', 'b@x.com']);
  });

  it('matches exact addresses and wildcards', () => {
    const inboxes = ['hello@acme.dev', '*@side.dev'];
    expect(matchInboxes(['Hello <hello@acme.dev>'], inboxes)).toEqual(['hello@acme.dev']);
    expect(matchInboxes(['anything@side.dev'], inboxes)).toEqual(['anything@side.dev']);
    expect(matchInboxes(['other@acme.dev', 'x@side.dev.evil.com'], inboxes)).toEqual([]);
  });
});
