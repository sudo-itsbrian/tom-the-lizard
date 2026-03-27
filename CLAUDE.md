# CLAUDE.md

Project context for Claude Code when working on Tom The Lizard.

## Project Overview

Tom The Lizard is a Zalo chatbot with an Express dashboard. Single Node.js process runs both the bot (polling) and dashboard (port 3100).

## Architecture

```
index.js            -- entry point, Zalo bot polling, command routing
send-zalo.js        -- standalone CLI message sender (used by scheduled scripts)
src/
  bot-state.js      -- shared singleton state (messages ring buffer, config, integrations)
  claude-chat.js    -- multi-turn Claude API with Jira tool use via mcp-atlassian
  config-store.js   -- dual-mode config (local .env vs production config.json)
  data-dir.js       -- data directory resolution (DATA_DIR env or ./data)
  jira-client.js    -- MCP stdio client connecting to mcp-atlassian (Jira + Confluence)
  scheduler.js      -- cron-based task runner, persists to tasks.json
  script-generator.js -- Claude API generates Node.js scripts from natural language
  traffic.js        -- TomTom traffic check (module + CLI with --send flag)
dashboard/
  server.js         -- Express API routes + static file serving
  public/           -- SPA (index.html, style.css, app.js, tom-avatar.png)
data/               -- runtime data (mounted volume in production)
  .env              -- secrets (local mode only, not used in production)
  config.json       -- non-secret editable config (MY_CHAT_ID, JIRA_EMAIL, JIRA_BASE_URL)
  places.json       -- home, work, custom locations with coords
  tasks.json        -- scheduled task definitions
  word-config.json  -- vocabulary categories
  scripts/          -- generated task scripts
```

## Dual-Mode Config

The app runs in two modes controlled by `NODE_ENV`:

**Local mode** (default):
- All config in `data/.env`, fully editable via dashboard
- Onboarding wizard writes to `.env`

**Production mode** (`NODE_ENV=production`, set in Dockerfile):
- Secrets (`ZALO_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `JIRA_API_TOKEN`, `TOMTOM_API_KEY`) from `process.env` only (Dokploy). Dashboard shows locked icon, no edit.
- Editable config (`MY_CHAT_ID`, `JIRA_EMAIL`, `JIRA_BASE_URL`) persisted to `data/config.json`. Editable via dashboard. Survives deploys.
- Token change detection: SHA-256 hash of `ZALO_BOT_TOKEN` stored in `config.json`. On startup, hash mismatch clears `MY_CHAT_ID` for auto-recapture.

Config logic lives in `src/config-store.js`.

## Key Patterns

### Bot Commands
Commands are matched with regex in `index.js` message handler:
```js
if (/^\/work/.test(text)) { handleTraffic(chatId, "work"); return; }
```

### Claude Chat with Tools
`src/claude-chat.js` runs a loop (max 8 turns) calling Claude with Jira tools. Anthropic client is created per-call (lazy) to always use current API key. When Claude returns `tool_use`, the tool is executed via mcp-atlassian and results fed back.

### Script Generation
`src/script-generator.js` calls Claude to generate a Node.js script from a description. System prompt includes available env vars, Zalo send pattern, and places context from `places.json`. Scripts are validated in two stages:
1. Syntax check (`node --check`)
2. Dry-run execution (Zalo sends disabled, real API keys passed)
If either fails, the error is fed back to Claude for a retry (up to 2 retries).

### Traffic Check
`src/traffic.js` is both a module (`getTraffic("work"|"home")`) and a CLI (`node src/traffic.js work --send`). The `--send` flag sends the result to Zalo (used by scheduler).

### Dashboard API
All config is read/written via REST endpoints in `dashboard/server.js`:
- `GET /api/mode` -- returns `{ production: bool }`
- `GET/POST /api/config` -- chat settings
- `GET/POST/DELETE /api/secrets/:key` -- write-only credentials (403 on secret writes in production)
- `GET/PUT /api/places/:slot` -- home/work locations
- `GET/POST /api/word-config` -- vocabulary categories
- `GET/POST/PUT/DELETE /api/tasks` -- scheduled tasks
- `GET /api/events` -- SSE stream for live updates

## Commands

```bash
npm start          # Start bot + dashboard
node index.js      # Same as above
```

## Dependencies

- `uv`/`uvx` required for Jira/Confluence (runs mcp-atlassian Python server)
- Pre-installed in Docker via `uv tool install mcp-atlassian`
- Local install: `brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Important Notes

- Bot uses `node-zalo-bot` polling (not webhook)
- Zalo has 2000 char message limit
- `MY_CHAT_ID` is auto-captured on first message (onboarding)
- Dashboard uses SSE for live message/status updates
- Theme toggle (light/dark) persists to localStorage
- All Vietnamese text uses Unicode escapes in JS source for reliability
- Places are searched via TomTom + Nominatim (OSM) fallback
- All runtime data lives in `data/` (or `DATA_DIR` env) -- mounted as Docker volume
- Generated scripts saved to `data/scripts/task-{id}.js`
- /word tracks history in `data/word-history.json` to avoid repeats (max 50)
- node-zalo-bot only supports text, photo, sticker -- no voice messages
- Dashboard Atlassian modal: gear icon opens 3-field modal (email, token, base URL) with test connection
- Secrets API rejects masked values and strips stray `*` prefixes
- `isOwner()` reads `process.env.MY_CHAT_ID` directly so dashboard changes take effect without restart
