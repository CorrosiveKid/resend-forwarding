import { Resend } from 'resend';
import { ConfigError, loadConfig } from '@/lib/config';
import { forwardEmail } from '@/lib/forward';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[resend-forwarding] ${err.message}`);
      return Response.json({ error: 'Forwarder is not configured' }, { status: 500 });
    }
    throw err;
  }

  const resend = new Resend(config.resendApiKey);
  const payload = await request.text();

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: config.webhookSecret,
    });
  } catch {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  if (event.type !== 'email.received') {
    return Response.json({ status: 'ignored', type: event.type });
  }

  try {
    const result = await forwardEmail(resend, config, event.data);
    console.log(`[resend-forwarding] ${event.data.email_id}: ${JSON.stringify(result)}`);
    return Response.json(result);
  } catch (err) {
    console.error(`[resend-forwarding] ${event.data.email_id}:`, err);
    // A non-2xx response makes Resend retry the delivery later.
    return Response.json({ error: 'Failed to forward email' }, { status: 500 });
  }
}
