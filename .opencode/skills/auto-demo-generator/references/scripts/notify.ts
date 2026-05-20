import { parseArgs } from "util";
import fs from "fs";
import path from "path";

// A simple script to send a Telegram message
// Usage: bun run .opencode/skills/auto-demo-generator/references/scripts/notify.ts --message "Hello world"

// Try to manually load .env from the root directory if not already loaded
const rootEnvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      // Remove quotes if present
      value = value.replace(/^['"](.*)['"]$/, "$1");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    message: {
      type: "string",
    },
  },
  strict: false,
  allowPositionals: true,
});

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.");
  process.exit(1);
}

if (!values.message) {
  console.error("Please provide a --message argument.");
  process.exit(1);
}

async function sendTelegramMessage(text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send Telegram message:", error);
      process.exit(1);
    }
    console.log("Telegram message sent successfully.");
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    process.exit(1);
  }
}

sendTelegramMessage(values.message);