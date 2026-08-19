import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { installDirectory, readText, writeText } from './fs-utils.mjs';

function addFrontmatterField(content, field) {
  if (content.includes(`\n${field}\n`) || content.includes(`\n${field}`)) return content;
  const metadataIndex = content.indexOf('\nmetadata:');
  if (metadataIndex >= 0) {
    return `${content.slice(0, metadataIndex)}\n${field}${content.slice(metadataIndex)}`;
  }
  const closingIndex = content.indexOf('\n---', 3);
  if (closingIndex >= 0) {
    return `${content.slice(0, closingIndex)}\n${field}${content.slice(closingIndex)}`;
  }
  throw new Error('SKILL.md frontmatter is missing its closing delimiter.');
}

export function renderSkill({ source, destination, platform, dryRun = false, now = new Date() }) {
  if (dryRun) return { destination };

  const result = installDirectory({ source, destination, dryRun, now });
  if (platform !== 'codex') {
    const agentsDirectory = join(destination, 'agents');
    if (existsSync(agentsDirectory)) rmSync(agentsDirectory, { recursive: true, force: true });
  }

  if (platform === 'cursor') {
    const skillPath = join(destination, 'SKILL.md');
    writeText(skillPath, addFrontmatterField(readText(skillPath), 'disable-model-invocation: true'));
  }

  if (platform === 'devin') {
    const skillPath = join(destination, 'SKILL.md');
    writeText(skillPath, addFrontmatterField(readText(skillPath), 'triggers: ["user"]'));
  }

  return result;
}
