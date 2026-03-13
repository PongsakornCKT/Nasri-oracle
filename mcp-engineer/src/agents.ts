/**
 * Agent loader — reads agency-agents/engineering/*.md and parses frontmatter
 */

import fs from 'fs';
import path from 'path';

export interface EngineerAgent {
  slug: string;         // e.g. "engineering-ai-engineer"
  name: string;         // e.g. "AI Engineer"
  description: string;
  emoji: string;
  color: string;
  vibe: string;
  body: string;         // full markdown body (after frontmatter)
  filePath: string;
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
  }
  return { meta, body: match[2] };
}

export function loadAgents(agentsDir: string): EngineerAgent[] {
  if (!fs.existsSync(agentsDir)) {
    console.error(`[Engineer] agents dir not found: ${agentsDir}`);
    return [];
  }

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();
  const agents: EngineerAgent[] = [];

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);

    agents.push({
      slug: file.replace('.md', ''),
      name: meta.name || file.replace('.md', ''),
      description: meta.description || '',
      emoji: meta.emoji || '🔧',
      color: meta.color || 'blue',
      vibe: meta.vibe || '',
      body,
      filePath,
    });
  }

  console.error(`[Engineer] Loaded ${agents.length} agents from ${agentsDir}`);
  return agents;
}
