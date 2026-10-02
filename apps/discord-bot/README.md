# Pitch Discord bot

The Pitch bot lets a linked member start a video from Discord with:

```text
/video type:<auto|product demo|launch film|generated footage> prompt:<describe the video>
```

Pitch creates a normal studio project, posts a progress link in the channel,
and posts the finished project's short public Pitch share URL (`/d/<slug>`) to
that same channel. It never posts the underlying S3 output URL. The project
also appears in the member's Pitch chat history.

## Recommended server channels

Create one member-facing channel named **`#create-videos`**. This is the best
place for every `/video` request because the bot currently returns progress
and completion messages to the channel where the command was used.

Suggested layout:

| Channel | Purpose |
| --- | --- |
| `#create-videos` | Members run `/video`; the bot posts progress and results here. |
| `#showcase` | Members manually share their best completed videos. The bot does not cross-post here automatically. |
| `#resources` | Prompt examples, brand links, and guidelines. |
| `#logs` | Private operational/moderation logs only. Do not use it for member requests. |

For the server shown in the setup screenshot, rename
`#automated-product-walkthrough` to `#create-videos` if it is not already in
use. A general name is better because the bot makes more than walkthroughs.

Give the bot access to `#create-videos` with only:

- View Channel
- Send Messages
- Use Application Commands / Use Slash Commands
- Send Messages in Threads, if members may run commands in threads

Use Discord's channel permission overrides if `/video` should work only in
`#create-videos`. The bot does not need Administrator, message-content access,
member-list access, voice permissions, or access to private staff channels.

## What members can create directly from Discord

Discord v1 asks members to choose one of four intent hints before entering the
prompt. These guide the one Studio agent; they are not stored project flows.

| Type | Behavior |
| --- | --- |
| Auto | Pitch reads the request and chooses the appropriate video tools. |
| Product demo | Prioritizes a clear product walkthrough and product experience. |
| Launch film | Prioritizes cinematic positioning, story, and visual impact. |
| Generated footage | Prioritizes AI-generated footage and visuals. |

It can directly start these jobs:

| Outcome | Good prompt example |
| --- | --- |
| Cinematic launch film | `/video prompt: Create a 30-second cinematic launch film for https://example.com, music only, focused on collaborative editing.` |
| Product walkthrough film | `/video prompt: Make a 30-second product walkthrough for https://example.com showing upload, edit, and export.` |
| Short teaser | `/video prompt: Make a 15-second teaser for https://example.com announcing our public launch. Music only.` |
| Feature announcement | `/video prompt: Create a 20-second feature announcement for https://example.com about automatic captions.` |
| Kinetic typography video | `/video prompt: Make a 15-second kinetic-typography video saying "From idea to launch in minutes" in our website's brand style.` |
| Live product demo | `/video prompt: Record a narrated 60-second demo of https://app.example.com showing how to create and publish a project.` |
| Generated footage or B-roll | `/video prompt: Generate a 10-second cinematic establishing shot of a glass object on a dark studio desk, no text or logos.` |

Specific prompts finish more reliably. Include the desired kind, URL or
subject, approximate length, important features, and whether narration is
wanted. If the studio needs a creative decision, the progress link opens the
Pitch project where the member can answer and continue; the bot keeps polling
for the result.

### Jobs that still require the Pitch web app

The current slash command has no attachment input. Use Pitch on the web for:

- editing an uploaded screen recording;
- turning uploaded PDFs or images into a narrated slideshow;
- creating PDF slide decks;
- using private assets that are not already in the project;
- signing into a private product before recording it;
- detailed revisions after the first Discord request.

These can be added to Discord later by introducing attachment options and
uploading them through Pitch's canonical asset/project API.

## Account linking

Every Discord member must first link the same Discord account to their Pitch
account:

1. Sign in to Pitch.
2. Open **Settings → Connections → Discord**.
3. Select **Connect** and approve Discord OAuth.
4. Return to `#create-videos` and run `/video`.

An unlinked member receives a direct link to Settings → Connections. The bot
never creates a Clerk/Pitch user automatically.

## Community welcome reward

Connecting Discord and joining the Pitch server earns **1,500 regular Pitch
credits, once**. Existing members are eligible too. Connect Discord in Pitch
under **Settings → Connections**. With the `guilds.join` OAuth scope, Pitch
attempts to join the server on your behalf; otherwise, use the server invite.
Accept any server rules, then return to Pitch: credits are awarded automatically.
The Connections screen checks every five seconds while visible, for up to
15 minutes, and checks again on focus during that window. The New Project page
also checks when opened or refocused.

The API reads the linked identity directly from Clerk, verifies membership in
`DISCORD_GUILD_ID` using Discord's Get Guild Member endpoint, and atomically
writes a `DiscordRewardClaim` receipt and a `promo` credit transaction. The
grant uses the normal `product` credit channel: it is available in the app,
API, or bot and has no daily reset. There is no per-video or daily grant.

The campaign has unique constraints on both the Pitch user ID and Discord user
ID. Repeated claims, leaving/rejoining, and unlinking/relinking cannot grant
again. Receipts retain both IDs, the server, amount, claim time, and ledger ID
independently of the current account link. Historical daily sponsorship stays
in its old ledger channel and is not converted into regular credits.

`/video` spends the member's **regular Pitch credits**, just like creating on
the website. Video costs vary with the work; the welcome grant is a credit
amount, not a guarantee of a particular number of finished videos.

Configure the bot's model with:

```env
DISCORD_STUDIO_MODEL="google/gemini-3.8-flash"
```

`DISCORD_STUDIO_MODEL` is required and uses the same `provider/model` format as
`STUDIO_MODEL`. The API rejects bot creation if this model is missing or
malformed. The welcome reward itself does not require a generation model or
the bot process to be running.

### Tracking claims

Credits appear as **Discord community welcome reward** in the existing credit
ledger. `DiscordRewardClaim` is the campaign audit trail. For example:

```sql
SELECT "userId", "discordUserId", "guildId", "credits", "claimedAt", "creditTransactionId"
FROM "DiscordRewardClaim"
WHERE "campaignId" = 'discord-welcome-v1'
ORDER BY "claimedAt" DESC;
```

### Rollout

1. Deploy the `20260912120000_discord_welcome_reward` migration.
2. Give the **API** both `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`. The bot must
   be installed in that server; no privileged member-list intent is required.
3. Deploy/restart the API, web app, and bot together so offer text and billing
   agree. The old `DISCORD_DAILY_VIDEO_LIMIT` and `DISCORD_FREE_VIDEO_CREDITS`
   environment variables are no longer used.

API endpoints (Pitch sign-in required): `GET /credits/discord` verifies
membership, grants an eligible reward, and returns claim state;
`POST /credits/discord/claim` also supports an explicit claim. The client does
not supply the Discord ID, server ID, or credit amount. The campaign remains
`discord-welcome-v1`: the increased amount applies to new claims, without
re-awarding or topping up existing claims.

## Discord Developer Portal setup

### Installation

For the current server bot:

1. Enable **Guild Install**.
2. Disable **User Install** unless direct-message/user-installed commands are
   intentionally added later.
3. Use the Discord Provided Install Link.
4. Under Guild Install, select `applications.commands` and `bot`.
5. Select the four channel permissions listed above.
6. Copy the install link and add the bot to the server.

### Bot settings

- Public Bot: enable for public installation; disable during private testing.
- Requires OAuth2 Code Grant: disabled.
- Presence Intent: disabled.
- Server Members Intent: disabled.
- Message Content Intent: disabled.

The bot uses only the Discord `Guilds` gateway intent. Slash-command input is
delivered as an interaction, so privileged message-content intent is not
needed.

## Environment

Set these values in the root `.env`:

```env
# Discord Developer Portal → General Information → Application ID
DISCORD_APPLICATION_ID="123456789012345678"

# Discord Developer Portal → Bot → Reset Token
DISCORD_BOT_TOKEN="replace_with_the_secret_bot_token"

# Generate this yourself with: openssl rand -hex 32
# The API and bot must receive the exact same value.
DISCORD_SERVICE_TOKEN="replace_with_a_long_random_service_secret"

# Required community server. Enable Discord Developer Mode, right-click the
# server, and select Copy Server ID. This is not a discord.gg invite URL.
DISCORD_GUILD_ID="123456789012345678"

DISCORD_STUDIO_MODEL="google/gemini-3.8-flash"
```

Never commit or share `DISCORD_BOT_TOKEN` or `DISCORD_SERVICE_TOKEN`. Reset the
Discord bot token immediately if it is exposed.

The bot has no database credentials. It resolves linked users and creates or
reads projects through the authenticated `/internal/discord` API. Project
creation still goes through Pitch's canonical project service, so workspace,
status, billing, chat history, and output behavior remain consistent.

## Run it

The API must be running and the Discord identity and welcome reward migrations
must be deployed.

Docker:

```bash
make discord
docker compose -p pitch logs -f discord-bot
```

Local development:

```bash
bun run dev:discord
```

At startup the service registers `/video`. When `DISCORD_GUILD_ID` is set it
registers in that test server immediately; without it, the bot registers a
global command, which can take longer to appear.

Expected startup log:

```text
[discord-bot] logged in as Pitch#1234
```

## Member flow

```text
member runs /video in #create-videos
  → bot acknowledges the command
  → Pitch resolves the linked Discord ID
  → Pitch checks the member's regular credit balance
  → Pitch creates a source:discord studio project
  → bot posts the Pitch progress link
  → bot polls the API's derived project status
  → bot posts the finished video URL in #create-videos
```

## Troubleshooting

### `/video` does not appear

- Confirm the install has both `bot` and `applications.commands` scopes.
- Confirm `DISCORD_APPLICATION_ID` is the Application ID, not the Public Key.
- During development, set `DISCORD_GUILD_ID` to the numeric Server ID and
  restart the bot.

### The bot is offline

- Check `DISCORD_BOT_TOKEN`.
- Inspect `docker compose -p pitch logs discord-bot`.
- Restart after changing `.env`: `make discord`.

### “Link your Discord account”

- Sign in to Pitch and reconnect from Settings → Connections.
- Ensure the Discord account used in Pitch is the same account running the
  slash command.

### The bot cannot post the result

- Confirm View Channel and Send Messages in `#create-videos`.
- For a thread, also grant Send Messages in Threads.

### Not enough credits

Claim the one-time community reward in Settings → Discord if eligible, or buy
credits in Pitch. `/video` uses the same balance as the website.

### Membership could not be verified

Confirm that the API has the correct bot token and community server ID, and
that the bot is installed in that server. The member must join using the
linked Discord account and complete server rules screening. Discord outages
and rate limits never grant credits; the member can retry.
