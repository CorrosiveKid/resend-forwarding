export const dynamic = 'force-dynamic';

const REQUIRED = ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'FORWARD_TO', 'FORWARD_FROM'];

export default function Home() {
  // Only report whether each variable is set; never render values.
  const checks = REQUIRED.map((key) => ({ key, ok: Boolean(process.env[key]?.trim()) }));
  const ready = checks.every((c) => c.ok);

  return (
    <main>
      <h1>Resend Forwarding</h1>
      <p>{ready ? '✅ The forwarder is configured.' : '⚠️ Some settings are missing.'}</p>
      <ul>
        {checks.map((c) => (
          <li key={c.key}>
            {c.ok ? '✅' : '❌'} <code>{c.key}</code>
          </li>
        ))}
        <li>
          {process.env.INBOXES?.trim() ? '✅' : '➖'} <code>INBOXES</code>{' '}
          {process.env.INBOXES?.trim() ? '' : '(not set: forwarding every received email)'}
        </li>
      </ul>
      <p>
        Point a Resend webhook for the <code>email.received</code> event at{' '}
        <code>/api/webhook</code> on this deployment.
      </p>
      <p>
        <a href="https://github.com/CorrosiveKid/resend-forwarding">Setup guide on GitHub</a>
      </p>
    </main>
  );
}
