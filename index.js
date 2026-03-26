require("dotenv").config({ override: true });
const { execFile } = require("child_process");
const path = require("path");
const ZaloBot = require("node-zalo-bot");
const Anthropic = require("@anthropic-ai/sdk");
const { chat, ensureJira } = require("./claude-chat");
const { state, addMessage } = require("./bot-state");
const { startDashboard } = require("./dashboard/server");
const { initScheduler } = require("./scheduler");

const bot = new ZaloBot(process.env.ZALO_BOT_TOKEN, {
  polling: { interval: 500, params: { timeout: 30 } },
});
const fs = require("fs");
let MY_CHAT_ID = process.env.MY_CHAT_ID;
const MAX_MSG_LEN = 2000;

function saveChatId(chatId) {
  MY_CHAT_ID = String(chatId);
  process.env.MY_CHAT_ID = MY_CHAT_ID;
  state.zalo.chatId = MY_CHAT_ID;
  const envPath = path.join(__dirname, ".env");
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const idx = lines.findIndex((l) => l.startsWith("MY_CHAT_ID="));
  if (idx >= 0) lines[idx] = `MY_CHAT_ID=${MY_CHAT_ID}`;
  else lines.push(`MY_CHAT_ID=${MY_CHAT_ID}`);
  fs.writeFileSync(envPath, lines.join("\n"));
  console.log(`[onboard] Chat ID saved: ${MY_CHAT_ID}`);
}

console.log("Bot starting...");

// Start dashboard and scheduler
startDashboard(3100).catch((e) => console.error("[dashboard] Failed:", e.message));
initScheduler();

bot
  .getMe()
  .then((me) => {
    console.log("Connected as:", JSON.stringify(me));
    state.bot.running = true;
    state.bot.name = me.display_name || me.account_name || "";
    state.zalo.connected = true;
    state.zalo.chatId = MY_CHAT_ID || "";
    state.integrations.tomtom.keySet = !!process.env.TOMTOM_API_KEY;
    ensureJira().catch(() => {});
  })
  .catch((err) => console.error("getMe failed:", err.message));

function isOwner(msg) {
  return String(msg.chat.id) === String(MY_CHAT_ID);
}

function truncate(text) {
  if (text.length <= MAX_MSG_LEN) return text;
  return text.slice(0, MAX_MSG_LEN - 20) + "\n\n... (da cat bot)";
}

function sendAndLog(chatId, text) {
  addMessage("out", text, "Bot");
  bot.sendMessage(chatId, text);
}

function handleTraffic(chatId, direction) {
  sendAndLog(chatId, "Đang kiểm tra giao thông...");
  execFile("node", [path.join(__dirname, "traffic-check-inline.js"), direction], {
    timeout: 15_000,
    env: process.env,
  }, (err, stdout) => {
    if (err) return sendAndLog(chatId, "Lỗi: " + err.message);
    sendAndLog(chatId, stdout.trim());
  });
}

function handleWord(chatId) {
  sendAndLog(chatId, "\u0110ang t\u00ecm t\u1eeb v\u1ef1ng...");

  // Read word config
  let categories = ["Business", "Technology", "Daily Life"];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "word-config.json"), "utf8"));
    const enabled = cfg.categories.filter((c) => c.enabled).map((c) => c.name);
    if (enabled.length > 0) categories = enabled;
  } catch {}

  const category = categories[Math.floor(Math.random() * categories.length)];
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: `You are an English vocabulary tutor. Given a category, pick one interesting, uncommon but useful English word and respond in EXACTLY this format (no extra text):

📖 WORD /pronunciation/

🇬🇧 English definition
🇻🇳 Vietnamese meaning

💡 Context: When/where to use this word

📝 Example 1: Sample sentence
📝 Example 2: Sample sentence

Pick words that are B2-C1 level, practical, and memorable. Not basic words.`,
    messages: [{ role: "user", content: `Category: ${category}` }],
  }).then((response) => {
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    sendAndLog(chatId, text);
  }).catch((err) => {
    console.error("Word error:", err.message);
    sendAndLog(chatId, "Loi: " + err.message);
  });
}

function handleChat(chatId, text) {
  sendAndLog(chatId, "Đang xử lý...");

  const progressMsgs = ["Đang tìm kiếm thông tin...", "Chờ mình chút nha...", "Sắp xong rồi..."];
  let step = 0;
  const timer = setInterval(() => {
    if (step < progressMsgs.length) sendAndLog(chatId, progressMsgs[step++]);
  }, 8_000);

  chat(text)
    .then((response) => {
      clearInterval(timer);
      sendAndLog(chatId, truncate(response));
    })
    .catch((err) => {
      clearInterval(timer);
      console.error("Chat error:", err.message);
      sendAndLog(chatId, "Lỗi: " + err.message);
    });
}

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  console.log(`[${chatId}] ${msg.from?.display_name}: ${text}`);

  state.zalo.lastPoll = new Date().toISOString();

  // Auto-capture chat ID on first message (onboarding)
  if (!MY_CHAT_ID) {
    saveChatId(chatId);
    const name = msg.from?.display_name || "ban";
    sendAndLog(chatId, [
      `Xin ch\u00e0o ${name}! M\u00ecnh l\u00e0 Tom The Lizard \ud83e\udd8e`,
      "",
      `Chat ID c\u1ee7a b\u1ea1n \u0111\u00e3 \u0111\u01b0\u1ee3c l\u01b0u t\u1ef1 \u0111\u1ed9ng.`,
      "T\u1eeb gi\u1edd m\u00ecnh s\u1ebd ch\u1ec9 ph\u1ea3n h\u1ed3i tin nh\u1eafn t\u1eeb b\u1ea1n.",
      "",
      "G\u1eedi /start \u0111\u1ec3 xem danh s\u00e1ch l\u1ec7nh.",
    ].join("\n"));
    return;
  }

  if (!isOwner(msg)) return;
  if (!text) return;

  addMessage("in", text, msg.from?.display_name || "Brian");

  if (/^\/start/.test(text)) {
    const name = msg.from?.display_name || "Brian";
    sendAndLog(chatId, [
      `Ch\u00e0o ${name}! Tom s\u1eb5n s\u00e0ng \ud83e\udd8e`,
      "",
      "L\u1ec7nh nhanh:",
      "/ping - ki\u1ec3m tra k\u1ebft n\u1ed1i",
      "/work - giao th\u00f4ng \u0111i l\u00e0m",
      "/home - giao th\u00f4ng v\u1ec1 nh\u00e0",
      "/word - h\u1ecdc t\u1eeb v\u1ef1ng ti\u1ebfng Anh",
      "",
      "Ho\u1eb7c g\u1eedi b\u1ea5t k\u1ef3 c\u00e2u h\u1ecfi n\u00e0o, bao g\u1ed3m Jira queries.",
    ].join("\n"));
    return;
  }

  if (/^\/ping/.test(text)) {
    sendAndLog(chatId, `Pong! ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);
    return;
  }

  if (/^\/work/.test(text)) {
    handleTraffic(chatId, "work");
    return;
  }

  if (/^\/home/.test(text)) {
    handleTraffic(chatId, "home");
    return;
  }

  if (/^\/word/.test(text)) {
    handleWord(chatId);
    return;
  }

  handleChat(chatId, text);
});

bot.on("error", (err) => {
  console.error("Bot error:", err.message);
});
