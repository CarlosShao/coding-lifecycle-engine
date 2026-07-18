#!/usr/bin/env node
// index.js — stdio MCP server for AI Coding Lifecycle
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fail } from './tools/util.js';

import projectTools from './tools/project.js';
import dagTools from './tools/dag.js';
import executionTools from './tools/execution.js';
import incrementTools from './tools/increment.js';
import conventionsTools from './tools/conventions.js';
import memoryTools from './tools/memory.js';
import bugTools from './tools/bug.js';
import approvalTools from './tools/approval.js';
import parallelTools from './tools/parallel.js';
import costTools from './tools/cost.js';
import nfrTools from './tools/nfr.js';
import miscTools from './tools/misc.js';

const ALL = [
  ...projectTools,
  ...dagTools,
  ...executionTools,
  ...incrementTools,
  ...conventionsTools,
  ...memoryTools,
  ...bugTools,
  ...approvalTools,
  ...parallelTools,
  ...costTools,
  ...nfrTools,
  ...miscTools,
];

const byName = new Map(ALL.map((t) => [t.name, t]));

const server = new Server(
  { name: 'ai-coding-lifecycle', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const tool = byName.get(name);
  if (!tool) return fail(`unknown tool: ${name}`);
  try {
    return await tool.handler(args || {});
  } catch (e) {
    return fail(e.message || String(e));
  }
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  // stderr only (stdout is the MCP protocol channel)
  process.stderr.write(`[ai-coding-lifecycle] started with ${ALL.length} tools\n`);
});

process.on('uncaughtException', (e) => {
  process.stderr.write(`[ai-coding-lifecycle] uncaught: ${e.message}\n`);
});
