#!/usr/bin/env node
// Usage: node send-zalo.js "Your message here"
const { dataPath } = require("./src/data-dir");
const { loadConfigToEnv } = require("./src/config-store");
require("dotenv").config({ path: dataPath(".env"), override: true });
loadConfigToEnv(); // Load MY_CHAT_ID from config.json in production
const ZaloBot = require("node-zalo-bot");

const msg = process.argv[2];
if (!msg) {
  console.error("Usage: node send-zalo.js <message>");
  process.exit(1);
}

const bot = new ZaloBot(process.env.ZALO_BOT_TOKEN, {});
bot
  .sendMessage(process.env.MY_CHAT_ID, msg)
  .then(() => {
    console.log("Sent OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Send failed:", err.message);
    process.exit(1);
  });
