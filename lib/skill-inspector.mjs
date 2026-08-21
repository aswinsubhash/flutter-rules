import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_SKILL_RESOURCES = [
  'references/api.md',
  'references/architecture.md',
  'references/dart.md',
  'references/dart3.md',
  'references/flutter-errors.md',
  'references/localization.md',
  'references/navigation.md',
  'references/quality.md',
  'references/review.md',
  'references/state.md',
  'references/testing.md',
  'references/ui.md',
  'schemas/review-report.schema.json',
  'scripts/render-review-report.mjs',
  'assets/review-report.css',
  'assets/review-report.js',
];

function parseFrontmatter(content) {
  const source = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '---') throw new Error('SKILL.md frontmatter is missing its opening delimiter.');
  const closing = lines.indexOf('---', 1);
  if (closing < 0) throw new Error('SKILL.md frontmatter is missing its closing delimiter.');
  return { closing, lines };
}

export function frontmatterField(content, name) {
  const { closing, lines } = parseFrontmatter(content);
  const prefix = `${name}:`;
  const line = lines.find((value, index) => index > 0 && index < closing && value.startsWith(prefix));
  return line?.slice(prefix.length).trim() ?? null;
}

export function frontmatterMetadataField(content, name) {
  const { closing, lines } = parseFrontmatter(content);
  const metadata = lines.findIndex((line, index) => index > 0 && index < closing && line === 'metadata:');
  if (metadata < 0) return null;
  const pattern = new RegExp(`^\\s+${name}:\\s*(.*?)\\s*$`);
  for (let index = metadata + 1; index < closing; index += 1) {
    if (lines[index] && !/^\s/.test(lines[index])) break;
    const match = lines[index].match(pattern);
    if (match) return match[1].replace(/^(["'])(.*)\1$/, '$2');
  }
  return null;
}

export function hasCodexManualPolicy(content) {
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const policies = lines
    .map((line, index) => line === 'policy:' ? index : -1)
    .filter((index) => index >= 0);
  if (policies.length !== 1) return false;
  const values = [];
  for (let index = policies[0] + 1; index < lines.length; index += 1) {
    if (lines[index] && !/^\s/.test(lines[index])) break;
    const match = lines[index].match(/^  allow_implicit_invocation:\s*(\S+)\s*$/);
    if (match) values.push(match[1]);
  }
  return values.length === 1 && values[0] === 'false';
}

export function inspectSkillDirectory(directory, expectedVersion) {
  const skillPath = join(directory, 'SKILL.md');
  const policyPath = join(directory, 'agents', 'openai.yaml');
  if (!existsSync(skillPath)) {
    return {
      installed: false,
      healthy: false,
      version: null,
      issues: ['SKILL.md is missing.'],
      policyValid: false,
    };
  }

  try {
    const content = readFileSync(skillPath, 'utf8');
    const version = frontmatterMetadataField(content, 'version');
    const issues = [];
    if (frontmatterField(content, 'name') !== 'flutter-rules') issues.push('Skill name is not flutter-rules.');
    for (const resource of REQUIRED_SKILL_RESOURCES) {
      if (!existsSync(join(directory, resource))) issues.push(`Required skill resource is missing: ${resource}.`);
    }
    if (frontmatterField(content, 'disable-model-invocation') !== 'true') {
      issues.push('Explicit-only invocation metadata is incomplete.');
    }
    if (frontmatterMetadataField(content, 'author') !== 'aswinsubhash') {
      issues.push('Skill author metadata is not recognized.');
    }
    if (!version) issues.push('Skill version metadata is missing.');
    else if (version !== expectedVersion) issues.push(`Installed version ${version} does not match ${expectedVersion}.`);

    const policyValid = existsSync(policyPath)
      && hasCodexManualPolicy(readFileSync(policyPath, 'utf8'));
    if (!policyValid) issues.push('Codex manual-invocation policy is missing or invalid.');

    return {
      installed: true,
      healthy: issues.length === 0,
      version,
      issues,
      policyValid,
    };
  } catch (reason) {
    return {
      installed: true,
      healthy: false,
      version: null,
      issues: [reason instanceof Error ? reason.message : String(reason)],
      policyValid: false,
    };
  }
}

export function isOwnedSkillDirectory(directory) {
  const skillPath = join(directory, 'SKILL.md');
  if (!existsSync(skillPath)) return false;
  try {
    const content = readFileSync(skillPath, 'utf8');
    return frontmatterField(content, 'name') === 'flutter-rules'
      && frontmatterMetadataField(content, 'author') === 'aswinsubhash';
  } catch {
    return false;
  }
}

export function inspectAdapterPath(path, canonicalPath, expectedVersion) {
  try {
    lstatSync(path);
  } catch {
    return { installed: false, healthy: true, linkedToCanonical: false, issues: [] };
  }
  try {
    if (realpathSync(path) === realpathSync(canonicalPath)) {
      return { installed: true, healthy: true, linkedToCanonical: true, issues: [] };
    }
  } catch {}
  const inspection = inspectSkillDirectory(path, expectedVersion);
  const issues = inspection.installed ? inspection.issues : ['Adapter path is dangling or missing SKILL.md.'];
  return {
    installed: true,
    healthy: inspection.healthy && isOwnedSkillDirectory(path),
    linkedToCanonical: false,
    version: inspection.version,
    issues,
  };
}
