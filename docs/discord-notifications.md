# Discord Notifications Setup

Pitch uses Discord webhooks to send real-time alerts for critical system events.

When configured, the system will automatically notify you of:
- 👋 **New User Sign Ups**
- 🔑 **User Sign Ins**
- 🎬 **New Video Creations Started**
- ✅ **Video Creations Completed**
- ❌ **Video Creations Failed**
- 📄 **PDF Creations Started / Completed / Failed**

Follow these steps to set up a Discord webhook and configure it to send alerts to your preferred channel.

---

## 1. Create a Discord Webhook

1. Open Discord and go to your server.
2. Right-click the channel you want notifications sent to → **Edit Channel** (or open **Server Settings**).
3. Go to **Integrations** → **Webhooks**.
4. Click **New Webhook**, give it a name (e.g., "Pitch Alerts"), and choose the target channel.
5. Click **Copy Webhook URL**. It looks like: `https://discord.com/api/webhooks/123456789/abc123...`
6. **Save this URL**, you will need it as your `DISCORD_WEBHOOK_URL`.

---

## 2. Configure the Environment

Open your `.env` file at the root of the project and add the webhook URL:

```env
# --- Discord Notifications (Optional) ---
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

*Note: If this variable is left empty, the application will fail gracefully and simply skip sending notifications without throwing any errors.*

---

## 3. Testing the Setup

The easiest way to test if your configuration is working is to:
1. Restart your API server if it was running.
2. Open the web app and sign out, then sign back in.
3. You should immediately receive a `🔑 **User Sign In**` alert in your designated Discord channel.
