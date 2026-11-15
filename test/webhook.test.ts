import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhook/route';

const SECRET_BYTES = Buffer.from('super-secret-signing-key-0123456789');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function signedRequest(body: unknown, secret = SECRET_BYTES): Request {
  const payload = JSON.stringify(body);
  const id = 'msg_test';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return new Request('http://localhost/api/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
  });
}

const receivedEvent = (overrides: Record<string, unknown> = {}) => ({
  type: 'email.received',
  created_at: '2026-11-15T10:00:00.000Z',
  data: {
    email_id: 'em_123',
    created_at: '2026-11-15T10:00:00.000Z',
    from: 'Jane Doe <jane@example.com>',
    to: ['hello@acme.dev'],
    cc: [],
    bcc: [],
    received_for: ['hello@acme.dev'],
    message_id: '<abc@example.com>',
    subject: 'Hi there',
    attachments: [{ id: 'att_1' }],
    ...overrides,
  },
});

let sent: any[] = [];
let sentHeaders: Headers[] = [];

beforeEach(() => {
  sent = [];
  sentHeaders = [];
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('FORWARD_TO', 'me@gmail.com');
  vi.stubEnv('FORWARD_FROM', 'fwd@acme.dev');
  vi.stubEnv('INBOXES', 'hello@acme.dev');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/emails/receiving/em_123/attachments')) {
        return json({
          object: 'list',
          has_more: false,
          data: [
            {
              id: 'att_1',
              filename: 'logo.png',
              size: 10,
              content_type: 'image/png',
              content_disposition: 'inline',
              content_id: '<logo>',
              download_url: 'https://files.example/att_1',
              expires_at: '2026-11-15T11:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/emails/receiving/em_123')) {
        return json({
          object: 'email',
          id: 'em_123',
          to: ['hello@acme.dev'],
          from: 'Jane Doe <jane@example.com>',
          created_at: '2026-11-15T10:00:00.000Z',
          subject: 'Hi there',
          bcc: null,
          cc: null,
          reply_to: null,
          received_for: ['hello@acme.dev'],
          html: '<p>Hello <img src="cid:logo"></p>',
          text: 'Hello',
          headers: {},
          message_id: '<abc@example.com>',
          attachments: [{ id: 'att_1' }],
        });
      }
      if (url.endsWith('/emails') && init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        sentHeaders.push(new Headers(init.headers));
        return json({ id: 'sent_1' });
      }
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/webhook', () => {
  it('rejects bad signatures', async () => {
    const res = await POST(signedRequest(receivedEvent(), Buffer.from('wrong')));
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('forwards a matching email with body, attachments and reply-to', async () => {
    const res = await POST(signedRequest(receivedEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'forwarded', id: 'sent_1' });

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.from).toBe('"Jane Doe via Forwarder" <fwd@acme.dev>');
    expect(email.to).toEqual(['me@gmail.com']);
    expect(email.reply_to).toEqual(['Jane Doe <jane@example.com>']);
    expect(email.subject).toBe('Hi there');
    expect(email.html).toContain('Forwarded message');
    expect(email.html).toContain('cid:logo');
    expect(email.text).toContain('Hello');
    expect(email.attachments).toEqual([
      expect.objectContaining({
        path: 'https://files.example/att_1',
        filename: 'logo.png',
        content_id: 'logo',
      }),
    ]);
    expect(sentHeaders[0].get('idempotency-key')).toBe('forward/em_123');
  });

  it('sends from the FORWARD_FROM address on the inbox domain', async () => {
    vi.stubEnv('FORWARD_FROM', 'fwd@other.dev, fwd@acme.dev');
    await POST(signedRequest(receivedEvent()));
    expect(sent[0].from).toBe('"Jane Doe via Forwarder" <fwd@acme.dev>');
  });

  it('skips emails to inboxes that are not configured', async () => {
    const res = await POST(
      signedRequest(receivedEvent({ to: ['sales@acme.dev'], received_for: ['sales@acme.dev'] })),
    );
    expect(await res.json()).toMatchObject({ status: 'skipped' });
    expect(sent).toHaveLength(0);
  });

  it('skips its own forwards to avoid loops', async () => {
    const res = await POST(signedRequest(receivedEvent({ from: 'fwd@acme.dev' })));
    expect(await res.json()).toMatchObject({ status: 'skipped' });
    expect(sent).toHaveLength(0);
  });

  it('ignores other event types', async () => {
    const res = await POST(signedRequest({ type: 'email.sent', created_at: '', data: {} }));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
  });
});
