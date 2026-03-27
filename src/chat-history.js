// Persistent chat history with sliding window for multi-turn conversations.
// Stores last N message pairs per chat ID in data/chat-history.json.
const fs = require("fs");
const { dataPath } = require("./data-dir");

const HISTORY_FILE = dataPath("chat-history.json");
const MAX_PAIRS = 10; // keep last 10 user+assistant exchanges
const MAX_AGE_MS = 30 * 60 * 1000; // 30 min session timeout

function load() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// Get conversation history for a chat ID as Claude messages array.
// Returns [] if no history or session expired.
function getHistory(chatId) {
  const data = load();
  const session = data[String(chatId)];
  if (!session || !session.messages || session.messages.length === 0) return [];

  // Check session timeout
  const lastTs = session.updatedAt || 0;
  if (Date.now() - lastTs > MAX_AGE_MS) {
    clearHistory(chatId);
    return [];
  }

  return session.messages;
}

// Append a user message and assistant response to the history.
// Trims to MAX_PAIRS exchanges (each exchange = 1 user + 1 assistant message).
function addExchange(chatId, userMessage, assistantResponse) {
  const data = load();
  const key = String(chatId);
  if (!data[key]) data[key] = { messages: [], updatedAt: Date.now() };

  data[key].messages.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantResponse }
  );

  // Trim: keep last MAX_PAIRS * 2 messages (pairs of user + assistant)
  const maxMessages = MAX_PAIRS * 2;
  if (data[key].messages.length > maxMessages) {
    data[key].messages = data[key].messages.slice(-maxMessages);
  }

  data[key].updatedAt = Date.now();
  save(data);
}

// Clear history for a chat ID (e.g. on /start or session reset).
function clearHistory(chatId) {
  const data = load();
  delete data[String(chatId)];
  save(data);
}

module.exports = { getHistory, addExchange, clearHistory };
