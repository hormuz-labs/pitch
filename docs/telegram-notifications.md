# Telegram Notifications Setup

Pitch uses Telegram to send real-time alerts for critical system events. 

When configured, the system will automatically notify you of:
- 👋 **New User Sign Ups**
- 🔑 **User Sign Ins**
- 🎬 **New Video Creations Started**
- ✅ **Video Creations Completed**
- ❌ **Video Creations Failed**

Follow these steps to set up a Telegram bot and configure it to send alerts to your preferred chat or channel.

---

## 1. Create a Telegram Bot

To send messages, you need a dedicated Telegram Bot.

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Start a chat and send the command `/newbot`.
3. Follow the prompts to choose a name and username for your bot (e.g., `PitchSystemAlertsBot`).
4. Once created, BotFather will give you an **HTTP API Token**. 
   - It looks something like this: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`.
   - **Save this token**, you will need it as your `TELEGRAM_BOT_TOKEN`.

---

## 2. Get Your Chat ID

The bot needs to know *where* to send the messages. You can have it send messages to you directly, to a group chat, or to a dedicated channel.

### Option A: Send Alerts to a Channel (Recommended for Teams)
Channels are great for keeping system logs separated from your personal messages.

1. Create a new Telegram Channel (e.g., "Pitch Production Alerts").
2. **Add your Bot as an Administrator** to the channel. (Bots cannot post in channels unless they are admins).
3. Determine the `chat_id`:
   - **If the channel is Public:** The `chat_id` is simply the channel's username, including the `@` symbol (e.g., `@PitchAlerts`).
   - **If the channel or group is Private:** 
     1. Open Telegram Web (https://web.telegram.org) or Telegram Desktop.
     2. Go to your private channel/group.
     3. Look at the URL in your browser (or click the group info on desktop to view the invite link / URL if accessible). It will look like `https://web.telegram.org/a/#-1001234567890`.
     4. The `-100...` part is your `TELEGRAM_CHAT_ID`.

### Option B: Send Alerts via Direct Message (DM)
If you just want the alerts sent to you personally:

1. Search for a helper bot like **[@userinfobot](https://t.me/userinfobot)** in Telegram.
2. Start the chat.
3. It will immediately reply with your personal account details.
4. Look for the **Id** (a positive number like `123456789`). This is your `TELEGRAM_CHAT_ID`.
5. *Important:* Make sure you open a chat with your newly created Bot (from step 1) and click "Start". The bot cannot message you until you start the conversation.

---

## 3. Configure the Environment

Open your `.env` file at the root of the project and add the credentials you gathered:

```env
# --- Telegram Notifications (Optional) ---
TELEGRAM_BOT_TOKEN="your_token_from_botfather"
TELEGRAM_CHAT_ID="your_chat_id"
```

*Note: If these variables are left empty, the application will fail gracefully and simply skip sending notifications without throwing any errors.*

---

## 4. Testing the Setup

The easiest way to test if your configuration is working is to:
1. Restart your API server if it was running.
2. Open the web app and sign out, then sign back in.
3. You should immediately receive a `🔑 User Sign In` alert in your designated Telegram chat.
