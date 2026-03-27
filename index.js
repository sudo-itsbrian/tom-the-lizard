const fs = require("fs");
const path = require("path");
const { dataPath } = require("./src/data-dir");
const { IS_PRODUCTION, loadConfigToEnv } = require("./src/config-store");

if (!IS_PRODUCTION) {
  // Local mode: use .env file
  const envPath = dataPath(".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, [
      "ZALO_BOT_TOKEN=",
      "ANTHROPIC_API_KEY=",
      "MY_CHAT_ID=",
      "TOMTOM_API_KEY=",
      "JIRA_API_TOKEN=",
      "JIRA_EMAIL=",
      ""
    ].join("\n"));
    console.log("[init] Created data/.env -- fill in credentials via dashboard or edit directly.");
  }
  require("dotenv").config({ path: envPath, override: true });
}

// Load non-secret config from config.json (both modes)
loadConfigToEnv();

const ZaloBot = require("node-zalo-bot");
const Anthropic = require("@anthropic-ai/sdk");
const { chat, ensureJira } = require("./src/claude-chat");
const { state, addMessage } = require("./src/bot-state");
const { startDashboard } = require("./dashboard/server");
const { initScheduler } = require("./src/scheduler");
const { getTraffic } = require("./src/traffic");

const bot = new ZaloBot(process.env.ZALO_BOT_TOKEN, {
  polling: { interval: 500, params: { timeout: 30 } },
});
let MY_CHAT_ID = process.env.MY_CHAT_ID;
const MAX_MSG_LEN = 2000;

function saveChatId(chatId) {
  MY_CHAT_ID = String(chatId);
  process.env.MY_CHAT_ID = MY_CHAT_ID;
  state.zalo.chatId = MY_CHAT_ID;
  if (IS_PRODUCTION) {
    // Production: persist to config.json (survives deploys)
    const { writeConfig } = require("./src/config-store");
    writeConfig({ MY_CHAT_ID });
  } else {
    // Local: persist to .env file
    const envFile = dataPath(".env");
    const lines = fs.readFileSync(envFile, "utf8").split("\n");
    const idx = lines.findIndex((l) => l.startsWith("MY_CHAT_ID="));
    if (idx >= 0) lines[idx] = `MY_CHAT_ID=${MY_CHAT_ID}`;
    else lines.push(`MY_CHAT_ID=${MY_CHAT_ID}`);
    fs.writeFileSync(envFile, lines.join("\n"));
  }
  console.log(`[onboard] Chat ID saved: ${MY_CHAT_ID}`);
}

console.log("Bot starting...");

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
  // Use process.env directly so dashboard changes take effect without restart
  const currentId = process.env.MY_CHAT_ID || MY_CHAT_ID;
  return String(msg.chat.id) === String(currentId);
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
  sendAndLog(chatId, "\u0110ang ki\u1ec3m tra giao th\u00f4ng...");
  getTraffic(direction)
    .then((msg) => sendAndLog(chatId, msg))
    .catch((err) => sendAndLog(chatId, "L\u1ed7i: " + err.message));
}

// Track recent words to avoid repeats (persisted to data/word-history.json)
const WORD_HISTORY_MAX = 50;
function loadWordHistory() {
  try { return JSON.parse(fs.readFileSync(dataPath("word-history.json"), "utf8")); }
  catch { return []; }
}
function saveWordHistory(history) {
  fs.writeFileSync(dataPath("word-history.json"), JSON.stringify(history));
}
function extractWord(text) {
  const m = text.match(/\ud83d\udcd6\s+(\w+)/);
  return m ? m[1].toUpperCase() : null;
}

function handleWord(chatId) {
  sendAndLog(chatId, "\u0110ang t\u00ecm t\u1eeb v\u1ef1ng...");

  let categories = ["Business", "Technology", "Daily Life"];
  try {
    const cfg = JSON.parse(fs.readFileSync(dataPath("word-config.json"), "utf8"));
    const enabled = cfg.categories.filter((c) => c.enabled).map((c) => c.name);
    if (enabled.length > 0) categories = enabled;
  } catch {}

  const category = categories[Math.floor(Math.random() * categories.length)];
  const history = loadWordHistory();
  const recentWords = history.slice(-WORD_HISTORY_MAX).join(", ");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    temperature: 1,
    system: `You are an English vocabulary tutor. Pick one interesting, uncommon but useful English word and respond in EXACTLY this format (no extra text):

\ud83d\udcd6 WORD /pronunciation/

\ud83c\uddec\ud83c\udde7 English definition
\ud83c\uddfb\ud83c\uddf3 Vietnamese meaning

\ud83d\udca1 Context: When/where to use this word

\ud83d\udcdd Example 1: Sample sentence
\ud83d\udcdd Example 2: Sample sentence

Pick words that are B2-C1 level, practical, and memorable. Not basic words.
You MUST pick a word that is NOT in this list of already-used words: [${recentWords}]`,
    messages: [{ role: "user", content: `Category: ${category}` }],
  }).then((response) => {
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const word = extractWord(text);
    if (word) {
      history.push(word);
      if (history.length > WORD_HISTORY_MAX) history.splice(0, history.length - WORD_HISTORY_MAX);
      saveWordHistory(history);
    }
    sendAndLog(chatId, text);
  }).catch((err) => {
    console.error("Word error:", err.message);
    sendAndLog(chatId, "Loi: " + err.message);
  });
}

function handleChat(chatId, text) {
  sendAndLog(chatId, "\u0110ang x\u1eed l\u00fd...");

  const progressMsgs = ["\u0110ang t\u00ecm ki\u1ebfm th\u00f4ng tin...", "Ch\u1edd m\u00ecnh ch\u00fat nha...", "S\u1eafp xong r\u1ed3i..."];
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
      sendAndLog(chatId, "L\u1ed7i: " + err.message);
    });
}

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  console.log(`[${chatId}] ${msg.from?.display_name}: ${text}`);

  state.zalo.lastPoll = new Date().toISOString();

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

  if (/^\/work/.test(text)) { handleTraffic(chatId, "work"); return; }
  if (/^\/home/.test(text)) { handleTraffic(chatId, "home"); return; }
  if (/^\/word/.test(text)) { handleWord(chatId); return; }

  handleChat(chatId, text);
});

bot.on("error", (err) => {
  console.error("Bot error:", err.message);
});
