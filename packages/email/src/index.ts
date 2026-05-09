import nodemailer from 'nodemailer';

// ─── Clerk: fetch user email ──────────────────────────────────────────────────

/**
 * Fetches the primary email address for a Clerk userId.
 * Uses the Clerk Backend API — requires CLERK_SECRET_KEY in env.
 */
export async function getClerkUserEmail(userId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.warn('[Email] CLERK_SECRET_KEY not set — cannot fetch user email');
    return null;
  }

  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    console.warn(`[Email] Clerk API returned ${res.status} for user ${userId}`);
    return null;
  }

  const user = (await res.json()) as {
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
  };

  const primary = user.email_addresses.find(
    (e) => e.id === user.primary_email_address_id
  );

  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}

// ─── Gmail SMTP transport ─────────────────────────────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (not your real password)
    },
  });
}

// ─── Email templates ──────────────────────────────────────────────────────────

function jobCompleteHtml(videoUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your demo video is ready</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px; }
    .card { background: #fff; border-radius: 12px; max-width: 520px; margin: 0 auto; padding: 40px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h1 { font-size: 22px; color: #111; margin: 0 0 8px; }
    p  { color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    .btn { display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Your demo video is ready 🎬</h1>
    <p>Great news — your product demo video has finished generating and is ready to view.</p>
    <a href="${videoUrl}" class="btn">Watch your video</a>
    <p style="margin-top:24px; font-size:13px; color:#888;">
      Or copy this link:<br/>
      <a href="${videoUrl}" style="color:#555;">${videoUrl}</a>
    </p>
  </div>
  <div class="footer">Pitch &mdash; Automated Product Demos</div>
</body>
</html>
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendJobCompleteEmail({
  to,
  jobId,
  videoUrl,
}: {
  to: string;
  jobId: string;
  videoUrl: string;
}): Promise<void> {
  const from = process.env.GMAIL_USER;
  if (!from) {
    console.warn('[Email] GMAIL_USER not set — skipping email notification');
    return;
  }

  const transport = createTransport();

  await transport.sendMail({
    from: `Pitch <${from}>`,
    to,
    subject: 'Your demo video is ready',
    text: `Your product demo video for job ${jobId} has finished generating.\n\nWatch it here: ${videoUrl}`,
    html: jobCompleteHtml(videoUrl),
  });

  console.log(`[Email] Sent job-complete notification to ${to} for job ${jobId}`);
}
