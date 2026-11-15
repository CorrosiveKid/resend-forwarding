import type { Attachment, EmailReceivedEvent, Resend } from 'resend';
import { type Config, extractAddress, extractName, matchInboxes } from './config';

type ReceivedEmail = EmailReceivedEvent['data'];

export type ForwardResult =
  | { status: 'forwarded'; id: string; inboxes: string[] }
  | { status: 'skipped'; reason: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface HeaderFields {
  from: string;
  to: string[];
  cc: string[];
  date: string;
  subject: string;
}

function headerText(h: HeaderFields): string {
  return [
    '---------- Forwarded message ----------',
    `From: ${h.from}`,
    `Date: ${h.date}`,
    `Subject: ${h.subject}`,
    `To: ${h.to.join(', ')}`,
    ...(h.cc.length ? [`Cc: ${h.cc.join(', ')}`] : []),
    '',
    '',
  ].join('\n');
}

function headerHtml(h: HeaderFields): string {
  const row = (label: string, value: string) =>
    `<strong>${label}:</strong> ${escapeHtml(value)}<br>`;
  return (
    '<div style="font-family:sans-serif;font-size:13px;color:#555;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:16px">' +
    '---------- Forwarded message ----------<br>' +
    row('From', h.from) +
    row('Date', h.date) +
    row('Subject', h.subject) +
    row('To', h.to.join(', ')) +
    (h.cc.length ? row('Cc', h.cc.join(', ')) : '') +
    '</div>'
  );
}

/** Forwards one received email according to the config. */
export async function forwardEmail(
  resend: Resend,
  config: Config,
  event: ReceivedEmail,
): Promise<ForwardResult> {
  // Never forward our own forwards back into the loop.
  if (extractAddress(event.from) === config.forwardFrom) {
    return { status: 'skipped', reason: 'sent by the forwarder itself' };
  }

  const recipients = [
    ...(event.received_for ?? []),
    ...(event.to ?? []),
    ...(event.cc ?? []),
  ];
  const inboxes = matchInboxes(recipients, config.inboxes).filter(
    (address) => !config.forwardTo.includes(address),
  );
  if (inboxes.length === 0) {
    return { status: 'skipped', reason: 'no configured inbox matched' };
  }

  // Webhook payloads carry metadata only; fetch the body separately.
  // `cid` keeps inline images as cid: references that we re-attach below.
  const { data: email, error } = await resend.emails.receiving.get(event.email_id, {
    html_format: 'cid',
  });
  if (error || !email) {
    throw new Error(`Failed to fetch received email ${event.email_id}: ${error?.message}`);
  }

  const attachments: Attachment[] = [];
  if (email.attachments?.length) {
    const { data: list, error: attError } = await resend.emails.receiving.attachments.list({
      emailId: email.id,
    });
    if (attError || !list) {
      throw new Error(`Failed to list attachments for ${email.id}: ${attError?.message}`);
    }
    for (const att of list.data) {
      attachments.push({
        path: att.download_url,
        filename: att.filename ?? `attachment-${att.id}`,
        contentType: att.content_type,
        ...(att.content_disposition === 'inline' && att.content_id
          ? { contentId: att.content_id.replace(/^<|>$/g, '') }
          : {}),
      });
    }
  }

  const subject = email.subject || '(no subject)';
  const header: HeaderFields = {
    from: email.from,
    to: email.to ?? [],
    cc: email.cc ?? [],
    date: new Date(email.created_at).toUTCString(),
    subject,
  };

  let text = email.text ?? undefined;
  let html = email.html ?? undefined;
  if (!text && !html) text = '(empty message)';
  if (config.includeHeader) {
    if (text !== undefined) text = headerText(header) + text;
    if (html !== undefined) html = headerHtml(header) + html;
  }

  // Show the original sender's name, but send from our verified address.
  const senderName = extractName(email.from) ?? extractAddress(email.from);
  const from = `"${senderName.replace(/"/g, '')} via Forwarder" <${config.forwardFrom}>`;
  const replyTo = email.reply_to?.length ? email.reply_to : [email.from];

  const { data: sent, error: sendError } = await resend.emails.send(
    {
      from,
      to: config.forwardTo,
      replyTo,
      subject,
      ...(html !== undefined ? { html } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(attachments.length ? { attachments } : {}),
      headers: {
        'X-Forwarded-For': inboxes.join(', '),
        'X-Original-Message-ID': email.message_id,
      },
    } as Parameters<Resend['emails']['send']>[0],
    // Resend retries webhooks; the idempotency key keeps us from double-sending.
    { idempotencyKey: `forward/${email.id}` },
  );
  if (sendError || !sent) {
    throw new Error(`Failed to forward ${email.id}: ${sendError?.message}`);
  }

  return { status: 'forwarded', id: sent.id, inboxes };
}
