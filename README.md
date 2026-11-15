# Resend Forwarding

Forward emails received by [Resend](https://resend.com) to your personal inbox (Gmail, Outlook, iCloud, anything).

Give your domain a real inbox like `hello@yourdomain.com` without paying for a mailbox. Resend receives the email, this small app forwards it to you, and replying goes straight back to the original sender.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCorrosiveKid%2Fresend-forwarding&env=RESEND_API_KEY,RESEND_WEBHOOK_SECRET,FORWARD_TO,FORWARD_FROM&envDescription=Resend%20API%20key%2C%20webhook%20signing%20secret%2C%20your%20personal%20address%20and%20a%20sender%20on%20your%20verified%20domain.&envLink=https%3A%2F%2Fgithub.com%2FCorrosiveKid%2Fresend-forwarding%23environment-variables&project-name=resend-forwarding&repository-name=resend-forwarding)

## Features

- Forwards HTML and plain-text bodies, attachments and inline images
- **Reply-To** is set to the original sender, so hitting reply just works
- Shows who it's from: `Jane Doe via Forwarder <forwarder@yourdomain.com>`
- Choose which addresses get forwarded (exact or wildcard, like `*@yourdomain.com`)
- Forward to one or several personal addresses
- Verifies Resend webhook signatures and ignores everything unsigned
- Safe against webhook retries (idempotent sends) and forwarding loops
- No database. One serverless function. Fits comfortably in Vercel's free tier.

## How it works

```
sender ──▶ hello@yourdomain.com ──▶ Resend (receiving)
                                       │  webhook: email.received
                                       ▼
                         this app on Vercel  /api/webhook
                                       │  fetch body + attachments, send
                                       ▼
                              you@gmail.com  (Reply-To: sender)
```

## Setup

You need a [Resend](https://resend.com) account with a domain you control.

### 1. Set up receiving in Resend

1. Add your domain under [Domains](https://resend.com/domains) and verify it for **sending**. Forwarded emails are sent from this domain.
2. Enable **receiving** for the domain and add the MX record Resend shows you to your DNS. See [Resend's receiving docs](https://resend.com/docs/dashboard/receiving/introduction).
   - Using a subdomain like `mail.yourdomain.com` for receiving avoids clashing with any mail provider you already use on the root domain.
3. Create an [API key](https://resend.com/api-keys) with **Full access**. Sending-only keys can't read received emails.

### 2. Deploy to Vercel

Click the **Deploy with Vercel** button above. Vercel copies this repo into your GitHub account and asks for these values:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | The full-access API key from step 1 |
| `RESEND_WEBHOOK_SECRET` | Enter `pending` for now. You'll get the real value in step 3. |
| `FORWARD_TO` | Your personal email, e.g. `you@gmail.com` |
| `FORWARD_FROM` | A sender on your verified domain, e.g. `forwarder@yourdomain.com` |

When the deploy finishes, note your URL, e.g. `https://resend-forwarding-abc.vercel.app`. Opening it shows which settings are configured.

### 3. Create the webhook

1. In Resend, go to [Webhooks](https://resend.com/webhooks) → **Add webhook**.
2. Endpoint URL: `https://<your-deployment>.vercel.app/api/webhook`
3. Events: select **`email.received`**.
4. Create it, then copy the **signing secret** (starts with `whsec_`).

### 4. Add the signing secret and redeploy

1. In Vercel, open your project → **Settings → Environment Variables**.
2. Set `RESEND_WEBHOOK_SECRET` to the `whsec_...` value.
3. Optional: set `INBOXES` to limit which addresses get forwarded (see below).
4. Go to **Deployments**, open the menu on the latest deployment and choose **Redeploy**. Environment variable changes only apply to new deployments.

### 5. Test it

Send an email to an address on your receiving domain. It should land in your personal inbox within a few seconds. If it doesn't, see [Troubleshooting](#troubleshooting).

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | Resend API key with **Full access**. |
| `RESEND_WEBHOOK_SECRET` | Yes | Signing secret of your Resend webhook (`whsec_...`). |
| `FORWARD_TO` | Yes | Where to forward. Comma-separate for several: `you@gmail.com, partner@gmail.com`. |
| `FORWARD_FROM` | Yes | Sender address for forwarded emails. Must be on a domain verified in Resend. |
| `INBOXES` | No | Which receiving addresses to forward, comma-separated. Supports wildcards: `hello@yourdomain.com, *@side-project.dev`. Leave unset to forward **everything** Resend receives. |
| `FORWARD_HEADER` | No | Set to `false` to leave out the "Forwarded message" block (From/Date/Subject/To) at the top of each email. Default `true`. |

See [`.env.example`](.env.example) for a template.

## Run locally

```bash
git clone https://github.com/CorrosiveKid/resend-forwarding.git
cd resend-forwarding
npm install
cp .env.example .env.local   # then fill in your values
npm run dev
```

To receive real webhooks locally, expose port 3000 with a tunnel such as [ngrok](https://ngrok.com) or `cloudflared` and point a Resend webhook at `https://<tunnel>/api/webhook`.

```bash
npm test           # unit + webhook tests
npm run typecheck
npm run build
```

## Troubleshooting

- **Nothing arrives.** In Resend, open the webhook and check the delivery attempts. Then check your Vercel project's **Logs**. Every email is logged as `forwarded` or `skipped` with a reason.
- **`401 Invalid webhook signature`.** `RESEND_WEBHOOK_SECRET` doesn't match the webhook, or you didn't redeploy after changing it.
- **`500 Forwarder is not configured`.** A required environment variable is missing. Open your deployment's home page to see which.
- **`skipped: no configured inbox matched`.** The recipient isn't in `INBOXES`. Add it, or a wildcard, and redeploy.
- **Resend says the `from` domain isn't verified.** `FORWARD_FROM` must use a domain verified for sending in Resend.
- **Forwards land in spam.** Make sure SPF and DKIM for your sending domain are verified in Resend, and consider adding a DMARC record. Marking a forwarded email as "not spam" once usually trains your provider.

## Security notes

- Every request to `/api/webhook` is checked against your webhook signing secret. Unsigned or tampered requests are rejected.
- The home page shows only whether each variable is set, never its value.
- Your API key has full access to your Resend account. Keep it in Vercel's environment variables, never in the repo.

## Limitations

- Resend's attachment size limits apply to forwarded emails (40 MB per email after encoding).
- Forwarded emails are re-sent from your domain, so the original DKIM signature isn't preserved. That's how forwarding has to work to pass SPF/DMARC at your inbox provider.
- Each forwarded email counts toward your Resend sending quota.

## License

[MIT](LICENSE)
