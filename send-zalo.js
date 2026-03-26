#!/usr/bin/env node
// Usage: node send-zalo.js "Your message here"
require("dotenv").config();
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
