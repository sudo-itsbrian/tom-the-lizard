// MCP client for mcp-atlassian. Spawns the server as a child process,
// connects via stdio, and exposes tool calling.
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

let client = null;
let tools = [];

async function connect() {
  if (client) return;

  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraToken) throw new Error("JIRA_API_TOKEN not set");

  const transport = new StdioClientTransport({
    command: "/opt/homebrew/bin/uvx",
    args: [
      "mcp-atlassian",
      "--jira-url", "https://vnggames.atlassian.net",
      "--jira-username", process.env.JIRA_EMAIL || "dungtva@vng.com.vn",
      "--jira-token", jiraToken,
      "--confluence-url", "https://vnggames.atlassian.net/wiki",
      "--confluence-username", process.env.JIRA_EMAIL || "dungtva@vng.com.vn",
      "--confluence-token", jiraToken,
    ],
  });

  client = new Client({ name: "lobster-bot", version: "1.0.0" });
  await client.connect(transport);

  const result = await client.listTools();
  tools = result.tools || [];
  console.log(`[atlassian-client] Connected, ${tools.length} tools available`);

  // Update shared state for dashboard
  try {
    const { state } = require("./bot-state");
    const jiraTools = tools.filter((t) => t.name.startsWith("jira_"));
    const confTools = tools.filter((t) => t.name.startsWith("confluence_"));
    state.integrations.jira.connected = jiraTools.length > 0;
    state.integrations.jira.tools = jiraTools.length;
    state.integrations.confluence.connected = confTools.length > 0;
    state.integrations.confluence.tools = confTools.length;
  } catch {};
}

function getTools() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    input_schema: t.inputSchema,
  }));
}

async function callTool(name, args) {
  if (!client) await connect();
  const result = await client.callTool({ name, arguments: args });
  return result.content
    .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
    .join("\n");
}

module.exports = { connect, getTools, callTool };
