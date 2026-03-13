/**
 * MCP Engineer — Engineering Room Server
 *
 * Exposes 22 engineering specialist agents as MCP tools.
 * Each *.md in agency-agents/engineering/ = 1 agent.
 *
 * Tools:
 *   eng_list        — List all available engineering agents
 *   eng_get         — Get full agent profile by slug
 *   eng_search      — Search agents by skill/keyword
 *   eng_dispatch    — Dispatch a task to a specific agent (returns agent context + prompt)
 *   eng_team        — Assemble a team of agents for a complex task
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { loadAgents, type EngineerAgent } from './agents.ts';

class EngineerMCPServer {
  private server: Server;
  private agents: EngineerAgent[];

  constructor() {
    const repoRoot = process.env.ORACLE_REPO_ROOT || process.cwd();
    const agentsDir = path.join(repoRoot, 'agency-agents', 'engineering');

    this.agents = loadAgents(agentsDir);

    this.server = new Server(
      { name: 'mcp-engineer', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error('[Engineer MCP Error]', error);
    process.on('SIGINT', () => process.exit(0));
  }

  private setupHandlers(): void {
    // ================================================================
    // List available tools
    // ================================================================
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const agentSummary = this.agents
        .map(a => `  ${a.emoji} ${a.name} → ${a.slug}`)
        .join('\n');

      return {
        tools: [
          {
            name: '____ENGINEER_GUIDE',
            description: `ENGINEERING ROOM — ${this.agents.length} Specialist Agents\n\n` +
              `Available agents:\n${agentSummary}\n\n` +
              `Tools:\n` +
              `  eng_list()           → Browse all agents with descriptions\n` +
              `  eng_get(slug)        → Full agent profile & capabilities\n` +
              `  eng_search(query)    → Find agents by skill/keyword\n` +
              `  eng_dispatch(slug, task) → Get agent context for a task\n` +
              `  eng_team(task)       → Assemble recommended team for complex task`,
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'eng_list',
            description: 'List all engineering agents with name, emoji, description, and vibe',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['brief', 'detailed'],
                  description: 'Output format (default: brief)',
                },
              },
            },
          },
          {
            name: 'eng_get',
            description: 'Get full agent profile including capabilities, workflow, and communication style',
            inputSchema: {
              type: 'object',
              properties: {
                slug: {
                  type: 'string',
                  description: 'Agent slug (e.g. "engineering-backend-architect"). Use eng_list to see all slugs.',
                },
              },
              required: ['slug'],
            },
          },
          {
            name: 'eng_search',
            description: 'Search engineering agents by skill, technology, or keyword. Returns matching agents ranked by relevance.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (e.g. "database", "react", "security", "docker")',
                },
                limit: {
                  type: 'number',
                  description: 'Max results (default: 5)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'eng_dispatch',
            description: 'Dispatch a task to a specific engineering agent. Returns the agent\'s full system prompt + task context, ready for execution.',
            inputSchema: {
              type: 'object',
              properties: {
                slug: {
                  type: 'string',
                  description: 'Agent slug to dispatch to',
                },
                task: {
                  type: 'string',
                  description: 'Task description for the agent',
                },
                context: {
                  type: 'string',
                  description: 'Additional context (files, requirements, constraints)',
                },
              },
              required: ['slug', 'task'],
            },
          },
          {
            name: 'eng_team',
            description: 'Recommend a team of agents for a complex task. Analyzes the task and suggests which specialists to involve.',
            inputSchema: {
              type: 'object',
              properties: {
                task: {
                  type: 'string',
                  description: 'Complex task description that may need multiple specialists',
                },
                max_agents: {
                  type: 'number',
                  description: 'Maximum team size (default: 4)',
                },
              },
              required: ['task'],
            },
          },
        ],
      };
    });

    // ================================================================
    // Handle tool calls
    // ================================================================
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const args = request.params.arguments as Record<string, any>;

      try {
        switch (request.params.name) {
          case 'eng_list':
            return this.handleList(args);
          case 'eng_get':
            return this.handleGet(args);
          case 'eng_search':
            return this.handleSearch(args);
          case 'eng_dispatch':
            return this.handleDispatch(args);
          case 'eng_team':
            return this.handleTeam(args);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    });
  }

  // ================================================================
  // Tool handlers
  // ================================================================

  private handleList(args: Record<string, any>) {
    const format = args.format || 'brief';

    const list = this.agents.map(a => {
      if (format === 'detailed') {
        return {
          slug: a.slug,
          name: a.name,
          emoji: a.emoji,
          description: a.description,
          vibe: a.vibe,
          color: a.color,
        };
      }
      return {
        slug: a.slug,
        name: `${a.emoji} ${a.name}`,
        vibe: a.vibe,
      };
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: list.length,
          agents: list,
        }, null, 2),
      }],
    };
  }

  private handleGet(args: Record<string, any>) {
    const { slug } = args;
    const agent = this.agents.find(a => a.slug === slug);

    if (!agent) {
      const suggestions = this.agents
        .filter(a => a.slug.includes(slug) || a.name.toLowerCase().includes(slug.toLowerCase()))
        .map(a => a.slug);

      throw new Error(
        `Agent "${slug}" not found.` +
        (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ' Use eng_list to see all agents.')
      );
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          slug: agent.slug,
          name: agent.name,
          emoji: agent.emoji,
          description: agent.description,
          vibe: agent.vibe,
          color: agent.color,
          profile: agent.body,
        }, null, 2),
      }],
    };
  }

  private handleSearch(args: Record<string, any>) {
    const { query, limit = 5 } = args;
    const q = query.toLowerCase();

    const scored = this.agents.map(a => {
      let score = 0;
      const searchText = `${a.name} ${a.description} ${a.vibe} ${a.body}`.toLowerCase();

      // Exact name match
      if (a.name.toLowerCase().includes(q)) score += 10;
      // Description match
      if (a.description.toLowerCase().includes(q)) score += 5;
      // Body match (count occurrences)
      const bodyMatches = (searchText.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(bodyMatches, 10);

      return { agent: a, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          results: scored.map(s => ({
            slug: s.agent.slug,
            name: `${s.agent.emoji} ${s.agent.name}`,
            description: s.agent.description,
            relevance: s.score,
          })),
          total: scored.length,
        }, null, 2),
      }],
    };
  }

  private handleDispatch(args: Record<string, any>) {
    const { slug, task, context } = args;
    const agent = this.agents.find(a => a.slug === slug);

    if (!agent) {
      throw new Error(`Agent "${slug}" not found. Use eng_list to see all agents.`);
    }

    const dispatch = {
      agent: {
        slug: agent.slug,
        name: agent.name,
        emoji: agent.emoji,
      },
      systemPrompt: agent.body,
      task,
      context: context || null,
      instruction: `You are ${agent.name}. ${agent.description}\n\n## Task\n${task}${context ? `\n\n## Context\n${context}` : ''}`,
    };

    console.error(`[Engineer] Dispatched to ${agent.emoji} ${agent.name}: ${task.substring(0, 80)}...`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(dispatch, null, 2),
      }],
    };
  }

  private handleTeam(args: Record<string, any>) {
    const { task, max_agents = 4 } = args;
    const q = task.toLowerCase();

    // Score each agent by relevance to the task
    const scored = this.agents.map(a => {
      let score = 0;
      const searchText = `${a.name} ${a.description} ${a.vibe} ${a.body}`.toLowerCase();

      const keywords = q.split(/\s+/).filter(w => w.length > 3);
      for (const kw of keywords) {
        const matches = (searchText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        score += matches;
      }

      // Boost for key roles
      if (q.includes('review') && a.slug.includes('code-reviewer')) score += 20;
      if (q.includes('security') && a.slug.includes('security')) score += 20;
      if (q.includes('database') && a.slug.includes('database')) score += 20;
      if (q.includes('frontend') && a.slug.includes('frontend')) score += 20;
      if (q.includes('backend') && a.slug.includes('backend')) score += 20;
      if (q.includes('deploy') && a.slug.includes('devops')) score += 20;
      if (q.includes('architect') && a.slug.includes('architect')) score += 20;

      return { agent: a, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max_agents);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task,
          team: scored.map((s, i) => ({
            role: i === 0 ? 'lead' : 'member',
            slug: s.agent.slug,
            name: `${s.agent.emoji} ${s.agent.name}`,
            vibe: s.agent.vibe,
            relevance: s.score,
          })),
          teamSize: scored.length,
          suggestion: scored.length > 0
            ? `Recommended team of ${scored.length} for this task. Lead: ${scored[0].agent.name}.`
            : 'No specific specialists matched. Consider using eng_search with different keywords.',
        }, null, 2),
      }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[Engineer] MCP Server running — ${this.agents.length} agents ready`);
  }
}

const server = new EngineerMCPServer();
server.run().catch(console.error);
