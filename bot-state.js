// Shared bot state -- singleton used by bot and dashboard.
const EventEmitter = require("events");

const MAX_MESSAGES = 200;
const startedAt = Date.now();

const state = {
  bot: { running: false, name: "", pid: process.pid },
  zalo: { connected: false, chatId: "", lastPoll: null },
  integrations: {
    jira: { enabled: true, connected: false, tools: 0 },
    confluence: { enabled: true, connected: false, tools: 0 },
    tomtom: { enabled: true, keySet: false },
  },
  config: {
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
    systemPrompt: "",
    maxMsgLen: 2000,
    progressMessages: true,
  },
  messages: [],
};

const events = new EventEmitter();
events.setMaxListeners(50);

function uptime() {
  const ms = Date.now() - startedAt;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function addMessage(direction, text, from) {
  const msg = {
    id: Date.now() + Math.random().toString(36).slice(2, 6),
    direction,
    text,
    from: from || (direction === "in" ? "Brian" : "Bot"),
    timestamp: new Date().toISOString(),
  };
  state.messages.push(msg);
  if (state.messages.length > MAX_MESSAGES) {
    state.messages.shift();
  }
  events.emit("message", msg);
  return msg;
}

function getStatus() {
  return {
    bot: { ...state.bot, uptime: uptime(), memory: Math.round(process.memoryUsage().rss / 1024 / 1024) },
    zalo: { ...state.zalo },
    integrations: { ...state.integrations },
  };
}

function getConfig() {
  return { ...state.config };
}

function setConfig(updates) {
  Object.assign(state.config, updates);
  events.emit("config", state.config);
}

function getMessages(limit = 50, offset = 0) {
  const sorted = [...state.messages].reverse();
  return {
    messages: sorted.slice(offset, offset + limit),
    total: state.messages.length,
  };
}

module.exports = { state, events, addMessage, getStatus, getConfig, setConfig, getMessages };
