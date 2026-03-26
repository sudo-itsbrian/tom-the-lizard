# CLAUDE.md

Project context for Claude Code when working on Tom The Lizard.

## Project Overview

Tom The Lizard is a Zalo chatbot with an Express dashboard. Single Node.js process runs both the bot (polling) and dashboard (port 3100).

## Architecture

- `index.js` -- entry point, Zalo bot polling, command routing (/work, /home, /word, /ping, /start, catch-all chat)
- `claude-chat.js` -- multi-turn Claude API with Jira tool use via mcp-atlassian
- `jira-client.js` -- MCP stdio client connecting to mcp-atlassian (Jira + Confluence)
- `bot-state.js` -- shared singleton state (messages ring buffer, config, integrations status)
- `scheduler.js` -- cron-based task runner, persists to tasks.json
- `script-generator.js` -- Claude API generates Node.js scripts from natural language descriptions
- `traffic-check.js` -- scheduled traffic report (home to work)
- `traffic-check-inline.js` -- inline traffic for /work and /home (stdout, no Zalo send)
- `send-zalo.js` -- standalone message sender (used by scheduled scripts)
- `dashboard/server.js` -- Express API routes + static file serving
- `dashboard/public/` -- SPA (index.html, style.css, app.js, tom-avatar.png)

## Key Patterns

### Bot Commands
Commands are matched with regex in `index.js` message handler:
```js
if (/^\/work/.test(text)) { handleTraffic(chatId, "work"); return; }
```

### Claude Chat with Tools
`claude-chat.js` runs a loop (max 8 turns) calling Claude with Jira tools. When Claude returns `tool_use`, the tool is executed via mcp-atlassian and results fed back.

### Script Generation
`script-generator.js` calls Claude to generate a Node.js script from a description. System prompt includes available env vars, Zalo send pattern, and places context from `places.json`. Scripts are validated with `node --check`.

### Dashboard API
All config is read/written via REST endpoints in `dashboard/server.js`:
- `GET/POST /api/config` -- chat settings
- `GET/POST/DELETE /api/secrets/:key` -- write-only credentials
- `GET/PUT /api/places/:slot` -- home/work locations
- `GET/POST /api/word-config` -- vocabulary categories
- `GET/POST/PUT/DELETE /api/tasks` -- scheduled tasks
- `GET /api/events` -- SSE stream for live updates

### Config Files
- `.env` -- secrets (dotenv)
- `places.json` -- home, work, custom locations with coords
- `tasks.json` -- scheduled task definitions
- `word-config.json` -- vocabulary categories

## Commands

```bash
npm start          # Start bot + dashboard
node index.js      # Same as above
```

## Important Notes

- Bot uses `node-zalo-bot` polling (not webhook)
- Zalo has 2000 char message limit
- `MY_CHAT_ID` is auto-captured on first message (onboarding)
- Dashboard uses SSE for live message/status updates
- Theme toggle (light/dark) persists to localStorage
- All Vietnamese text uses Unicode escapes in JS source for reliability
- Places are searched via TomTom + Nominatim (OSM) fallback
- Generated scripts saved to `scripts/task-{id}.js`
