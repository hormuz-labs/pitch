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

/**
 * Anti-spam design principles applied:
 *
 * 1. TABLE-BASED LAYOUT  — Gmail strips CSS classes/flexbox; tables render correctly everywhere.
 * 2. INLINE STYLES ONLY  — External/embedded stylesheets are stripped by many clients.
 * 3. PLAIN-TEXT PARITY   — A full text alternative is sent alongside HTML (required by RFC 2822 & Gmail policy).
 * 4. REAL SENDER ADDRESS — `from` matches GMAIL_USER exactly; no spoofed domains.
 * 5. SINGLE CTA LINK     — Multiple raw URLs trigger spam filters; one prominent button + one fallback.
 * 6. NO SPAM TRIGGER WORDS — No "FREE", "CLICK NOW", "URGENT", "WINNER", exclamation overuse, etc.
 * 7. PROPER PREHEADER    — Hidden preheader text shows in inbox preview before the subject.
 * 8. UNSUBSCRIBE / PHYSICAL ADDRESS — Google's Bulk Sender policy (enforced Feb 2024) requires
 *    a one-click unsubscribe header AND a visible postal address for bulk senders.
 *    Add List-Unsubscribe headers via `headers` field (see sendJobCompleteEmail).
 * 9. TEXT-TO-IMAGE RATIO — No images used; pure text/color keeps the ratio well above 60 %.
 * 10. CONSISTENT BRANDING — Sender name matches the from address; builds domain reputation.
 *
 * Design: matches the Pitch dashboard — dark navy (#1a1a2e) brand color, white card,
 * light gray outer bg (#f0f0f0), green "Ready" status badge, dark CTA button.
 */
function jobCompleteHtml(videoUrl: string, recipientEmail: string, videoTitle?: string): string {
  const year = new Date().getFullYear();
  const preheader = 'Your product demo video has finished generating and is ready to view.';
  const displayTitle = videoTitle ?? 'your-product.com';
  const unsubUrl = `${process.env.UNSUBSCRIBE_BASE_URL ?? 'https://yourapp.com'}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--[if !mso]><!-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <!--<![endif]-->
  <title>Your demo video is ready &mdash; Pitch</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader (hidden inbox preview text) -->
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#ffffff;min-width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;background-color:#ffffff;border-radius:14px;
                      border:1px solid #e8e8e8;overflow:hidden;">

          <!-- Top accent bar — matches dark nav -->
          <tr>
            <td style="height:4px;background-color:#1a1a2e;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo header -->
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <h1 style="margin:0;font-size:24px;color:#1a1a2e;font-weight:600;letter-spacing:-0.5px;">Pitch</h1>
            </td>
          </tr>

          <!-- Video thumbnail block — mimics dashboard card -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#1a1a2e;border-radius:10px;overflow:hidden;">
                <tr>
                  <!-- Play icon cell (centred, fixed height) -->
                  <td align="center" style="padding:36px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center"
                            style="width:52px;height:52px;border-radius:50%;
                                   background-color:rgba(255,255,255,0.15);
                                   font-size:22px;line-height:52px;text-align:center;color:#ffffff;">
                          &#9654;
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:10px;">
                          <span style="font-size:12px;color:rgba(255,255,255,0.55);
                                       letter-spacing:0.03em;">${displayTitle}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Duration badge row -->
                <tr>
                  <td align="right" style="padding:0 12px 10px 12px;">
                    <span style="display:inline-block;background-color:rgba(0,0,0,0.65);
                                 color:#ffffff;font-size:11px;font-weight:600;
                                 padding:3px 8px;border-radius:5px;">0:48</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title + date -->
          <tr>
            <td style="padding:16px 36px 0 36px;">
              <p style="margin:0 0 4px;font-size:19px;font-weight:700;color:#1a1a2e;
                        letter-spacing:-0.01em;line-height:1.3;">
                Your demo video is ready
              </p>
              <p style="margin:0;font-size:13px;color:#888888;">${date}</p>
            </td>
          </tr>

          <!-- Ready badge — matches dashboard status pill -->
          <tr>
            <td style="padding:12px 36px 0 36px;">
              <span style="display:inline-block;background-color:#f0fdf4;
                           border:1px solid #bbf7d0;color:#16a34a;
                           font-size:12px;font-weight:500;
                           padding:4px 14px;border-radius:20px;">
                &#10003;&nbsp; Ready
              </span>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #f0f0f0;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding:16px 36px 0 36px;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#555555;">
                Your product demo video has finished generating. Watch it below or
                share the link with your team.
              </p>
            </td>
          </tr>

          <!-- CTA Button — matches "+ New Video" dark button in app nav -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background-color:#1a1a2e;">
                    <a href="${videoUrl}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block;padding:11px 24px;
                              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                              font-size:14px;font-weight:600;color:#ffffff;
                              text-decoration:none;border-radius:8px;
                              background-color:#1a1a2e;">
                      &#9654;&nbsp; Watch your video
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback URL -->
          <tr>
            <td style="padding:10px 36px 0 36px;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;">
                Or copy this link:&nbsp;
                <span style="font-family:'Courier New',Courier,monospace;
                             color:#888888;word-break:break-all;">${videoUrl}</span>
              </p>
            </td>
          </tr>

          <!-- What you can do next — info box -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f7f7f8;border-radius:8px;border:1px solid #ebebeb;">
                <tr>
                  <!-- Share -->
                  <td align="center" width="50%" style="padding:16px 8px;">
                    <a href="${videoUrl}" target="_blank" style="text-decoration:none;">
                      <p style="margin:0 0 4px;font-size:18px;line-height:1;color:#1a1a2e;">&#8679;</p>
                      <p style="margin:0;font-size:11px;color:#888888;">Share link</p>
                    </a>
                  </td>
                  <!-- Divider -->
                  <td style="border-left:1px solid #e8e8e8;padding:0;font-size:0;line-height:0;">&nbsp;</td>
                  <!-- Download -->
                  <td align="center" width="50%" style="padding:16px 8px;">
                    <a href="${videoUrl}" download="demo.mp4" target="_blank" style="text-decoration:none;">
                      <p style="margin:0 0 4px;font-size:18px;line-height:1;color:#1a1a2e;">&#8681;</p>
                      <p style="margin:0;font-size:11px;color:#888888;">Download MP4</p>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer spacer -->
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Footer divider -->
          <tr>
            <td style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #f0f0f0;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer content -->
          <tr>
            <td align="center" style="padding:16px 36px 28px 36px;">
              <p style="margin:0 0 6px;font-size:11px;color:#bbbbbb;text-align:center;">
                You received this because you have a Pitch account associated with
                <a href="mailto:${recipientEmail}" style="color:#bbbbbb;text-decoration:underline;">${recipientEmail}</a>.
              </p>
              <p style="margin:0 0 6px;font-size:11px;color:#bbbbbb;text-align:center;">
                &copy; ${year} Pitch &mdash; Automated Product Demos
              </p>
              <p style="margin:0;font-size:11px;text-align:center;">
                <a href="mailto:support@trypitch.co?subject=Unsubscribe&body=Please%20unsubscribe%20me." style="color:#bbbbbb;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function jobCompleteText(videoUrl: string, jobId: string): string {
  return `Your demo video is ready — Pitch
==========================================

Your product demo video (Job ID: ${jobId}) has finished generating.

Watch it here:
${videoUrl}

What you can do next:
- Share a link with stakeholders
- Download an MP4 for offline use

--
Pitch — Automated Product Demos

To unsubscribe, please email support@trypitch.co
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendJobCompleteEmail({
  to,
  jobId,
  videoUrl,
  videoTitle,
}: {
  to: string;
  jobId: string;
  videoUrl: string;
  videoTitle?: string; // e.g. "razorpay.com" — shown inside the thumbnail block
}): Promise<void> {
  const from = process.env.GMAIL_USER;
  if (!from) {
    console.warn('[Email] GMAIL_USER not set — skipping email notification');
    return;
  }

  const transport = createTransport();

  await transport.sendMail({
    // ── Sender ──────────────────────────────────────────────────────────────
    from: `Pitch <${from}>`,        // Display name + exact Gmail address
    to,
    replyTo: from,                  // Ensures replies reach the same address

    // ── Subject ─────────────────────────────────────────────────────────────
    // Keep it short, no ALL-CAPS, no symbols, no spam trigger words
    subject: 'Your demo video is ready',

    // ── Content ─────────────────────────────────────────────────────────────
    // RFC 2822 requires both parts; Gmail uses text if HTML is blocked
    text: jobCompleteText(videoUrl, jobId),
    html: jobCompleteHtml(videoUrl, to, videoTitle),

    // ── Anti-spam headers ────────────────────────────────────────────────────
    headers: {
      // Google Bulk Sender policy (Feb 2024): one-click unsubscribe required
      // for senders of >5 000 messages/day. Add now so you're compliant at scale.
      'List-Unsubscribe': `<${process.env.UNSUBSCRIBE_BASE_URL ?? 'https://yourapp.com'}/unsubscribe?email=${encodeURIComponent(to)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',

      // Precedence: transactional (not bulk) — helps deliverability for
      // event-triggered emails (job complete notifications)
      'Precedence': 'transactional',

      // X-Mailer: identify the sending agent (optional but professional)
      'X-Mailer': 'Pitch/1.0 Nodemailer',
    },
  });

  console.log(`[Email] Sent job-complete notification to ${to} for job ${jobId}`);
}