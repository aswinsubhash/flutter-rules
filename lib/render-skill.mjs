import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDirectory, readText, writeText } from './fs-utils.mjs';

const PLATFORM_FIELDS = {
  codex: [],
  claude: ['disable-model-invocation: true'],
  cursor: ['disable-model-invocation: true', 'triggers: ["user"]'],
  devin: ['disable-model-invocation: true', 'triggers: ["user"]'],
};

function parseFrontmatter(content) {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const source = content.slice(bom.length);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '---') throw new Error('SKILL.md frontmatter is missing its opening delimiter.');
  const closing = lines.indexOf('---', 1);
  if (closing < 0) throw new Error('SKILL.md frontmatter is missing its closing delimiter.');
  return { bom, closing, lines, newline };
}

function fieldName(field) {
  return field.slice(0, field.indexOf(':'));
}

function serializeFrontmatter({ bom, lines, newline }) {
  return `${bom}${lines.join(newline)}`;
}

export function setFrontmatterFields(content, fields) {
  const parsed = parseFrontmatter(content);
  for (const field of fields) {
    const prefix = `${fieldName(field)}:`;
    const existing = parsed.lines.findIndex((line, index) =>
      index > 0 && index < parsed.closing && line.startsWith(prefix),
    );
    if (existing >= 0) {
      parsed.lines[existing] = field;
      continue;
    }
    const metadata = parsed.lines.findIndex((line, index) =>
      index > 0 && index < parsed.closing && line === 'metadata:',
    );
    parsed.lines.splice(metadata >= 0 ? metadata : parsed.closing, 0, field);
    parsed.closing += 1;
  }
  return serializeFrontmatter(parsed);
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

function copyFilter(source, platform) {
  const root = resolve(source);
  return (path) => {
    const child = relative(root, path);
    if (!child) return true;
    const parts = child.split(sep);
    if (parts.includes('.DS_Store')) return false;
    if (child === 'SKILL.md' || parts[0] === 'references') return true;
    return platform === 'codex' && (child === 'agents' || child === join('agents', 'openai.yaml'));
  };
}

export function renderSkill({ source, destination, platform, dryRun = false, now = new Date() }) {
  const fields = PLATFORM_FIELDS[platform];
  if (!fields) throw new Error(`Unsupported platform: ${platform}`);
  const content = setFrontmatterFields(readText(join(source, 'SKILL.md')), fields);
  if (dryRun) return installDirectory({ source, destination, dryRun, now });

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'flutter-rules-render-'));
  const rendered = join(temporaryRoot, 'flutter-rules');
  try {
    installDirectory({ source, destination: rendered, filter: copyFilter(source, platform) });
    writeText(join(rendered, 'SKILL.md'), content);
    return installDirectory({ source: rendered, destination, now });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [source, platform, destination] = process.argv.slice(2);
  renderSkill({ source, destination, platform });
}
