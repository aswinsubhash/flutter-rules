#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const RISKS = ['R1', 'R2', 'R3', 'R4'];
const CONFIDENCES = ['high', 'medium', 'low'];
const EFFORTS = ['XS', 'S', 'M', 'L', 'XL'];
const FINDING_STATUSES = ['confirmed', 'needs-verification'];
const PROVENANCES = ['introduced', 'affected-pre-existing', 'unknown'];
const RECOMMENDATIONS = ['block', 'fix-before-merge', 'merge-with-follow-up', 'ready'];
const CHANGE_KINDS = ['added', 'modified', 'deleted', 'renamed', 'affected'];
const BASIS_TYPES = ['flutter-rule', 'requirement', 'correctness', 'security', 'testing'];
const VALIDATION_STATUSES = ['passed', 'failed', 'blocked', 'not-run'];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
];

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function objectAt(value, path, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${path}.${key}`, 'is required');
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, 'is not allowed');
  return value;
}

function stringAt(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(path, allowEmpty ? 'must be a string' : 'must be a non-empty string');
  }
  return value;
}

function enumAt(value, path, values) {
  if (!values.includes(value)) fail(path, `must be one of ${values.join(', ')}`);
  return value;
}

function arrayAt(value, path) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function stringListAt(value, path, { required = false } = {}) {
  const values = arrayAt(value, path).map((entry, index) => stringAt(entry, `${path}[${index}]`));
  if (required && values.length === 0) fail(path, 'must contain at least one item');
  if (new Set(values).size !== values.length) fail(path, 'must not contain duplicates');
  return values;
}

function projectPathAt(value, path) {
  stringAt(value, path);
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')) {
    fail(path, 'must use a project-relative POSIX path');
  }
  if (value.split('/').includes('..')) fail(path, 'must not contain path traversal');
  if (value === '.' || value.startsWith('./') || value.includes('//')) fail(path, 'must be normalized');
  return value;
}

function pathListAt(value, path, options) {
  const values = arrayAt(value, path).map((entry, index) => projectPathAt(entry, `${path}[${index}]`));
  if (options?.required && values.length === 0) fail(path, 'must contain at least one item');
  if (new Set(values).size !== values.length) fail(path, 'must not contain duplicates');
  return values;
}

function rejectSecrets(value, path = '$') {
  if (typeof value === 'string') {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) fail(path, 'appears to contain a secret; redact it before rendering');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecrets(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) rejectSecrets(entry, `${path}.${key}`);
  }
}

export function validateReviewReport(report) {
  objectAt(report, '$', [
    'schemaVersion',
    'metadata',
    'summary',
    'changes',
    'findings',
    'validations',
    'passedChecks',
    'preExistingIssues',
    'unverifiedAreas',
  ]);
  if (report.schemaVersion !== 1) fail('$.schemaVersion', 'must equal 1');

  const metadata = objectAt(report.metadata, '$.metadata', [
    'feature',
    'project',
    'generatedAt',
    'rulesVersion',
    'branch',
    'baseline',
    'target',
    'scope',
    'limitations',
  ]);
  for (const key of ['feature', 'project', 'rulesVersion', 'branch', 'baseline', 'target']) {
    stringAt(metadata[key], `$.metadata.${key}`);
  }
  stringAt(metadata.generatedAt, '$.metadata.generatedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(metadata.generatedAt)
    || Number.isNaN(Date.parse(metadata.generatedAt))) {
    fail('$.metadata.generatedAt', 'must be a valid UTC ISO 8601 timestamp');
  }
  pathListAt(metadata.scope, '$.metadata.scope', { required: true });
  stringListAt(metadata.limitations, '$.metadata.limitations');

  const summary = objectAt(report.summary, '$.summary', ['releaseRecommendation', 'rationale']);
  enumAt(summary.releaseRecommendation, '$.summary.releaseRecommendation', RECOMMENDATIONS);
  stringAt(summary.rationale, '$.summary.rationale');

  arrayAt(report.changes, '$.changes').forEach((change, index) => {
    const path = `$.changes[${index}]`;
    objectAt(change, path, ['kind', 'summary', 'modules', 'files']);
    enumAt(change.kind, `${path}.kind`, CHANGE_KINDS);
    stringAt(change.summary, `${path}.summary`);
    stringListAt(change.modules, `${path}.modules`, { required: true });
    pathListAt(change.files, `${path}.files`, { required: true });
  });

  const ids = new Set();
  arrayAt(report.findings, '$.findings').forEach((finding, index) => {
    const path = `$.findings[${index}]`;
    objectAt(finding, path, [
      'id',
      'title',
      'status',
      'provenance',
      'severity',
      'riskTier',
      'confidence',
      'effort',
      'affectedModules',
      'affectedFiles',
      'relevantChanges',
      'impact',
      'evidence',
      'basis',
      'remediation',
      'verification',
    ]);
    stringAt(finding.id, `${path}.id`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(finding.id)) fail(`${path}.id`, 'has an invalid format');
    if (ids.has(finding.id)) fail(`${path}.id`, `duplicates ${finding.id}`);
    ids.add(finding.id);
    stringAt(finding.title, `${path}.title`);
    enumAt(finding.status, `${path}.status`, FINDING_STATUSES);
    enumAt(finding.provenance, `${path}.provenance`, PROVENANCES);
    enumAt(finding.severity, `${path}.severity`, SEVERITIES);
    enumAt(finding.riskTier, `${path}.riskTier`, RISKS);
    enumAt(finding.confidence, `${path}.confidence`, CONFIDENCES);
    enumAt(finding.effort, `${path}.effort`, EFFORTS);
    stringListAt(finding.affectedModules, `${path}.affectedModules`, { required: true });
    pathListAt(finding.affectedFiles, `${path}.affectedFiles`, { required: true });
    stringListAt(finding.relevantChanges, `${path}.relevantChanges`, { required: true });
    stringAt(finding.impact, `${path}.impact`);
    const evidence = arrayAt(finding.evidence, `${path}.evidence`);
    if (evidence.length === 0) fail(`${path}.evidence`, 'must contain at least one item');
    evidence.forEach((entry, evidenceIndex) => {
      const evidencePath = `${path}.evidence[${evidenceIndex}]`;
      objectAt(entry, evidencePath, ['file', 'lineStart', 'explanation'], ['lineEnd', 'excerpt']);
      projectPathAt(entry.file, `${evidencePath}.file`);
      if (!Number.isInteger(entry.lineStart) || entry.lineStart < 1) fail(`${evidencePath}.lineStart`, 'must be a positive integer');
      if ('lineEnd' in entry && (!Number.isInteger(entry.lineEnd) || entry.lineEnd < entry.lineStart)) {
        fail(`${evidencePath}.lineEnd`, 'must be an integer greater than or equal to lineStart');
      }
      if ('excerpt' in entry) stringAt(entry.excerpt, `${evidencePath}.excerpt`, { allowEmpty: true });
      stringAt(entry.explanation, `${evidencePath}.explanation`);
    });
    const basis = objectAt(finding.basis, `${path}.basis`, ['type', 'reference', 'rationale']);
    enumAt(basis.type, `${path}.basis.type`, BASIS_TYPES);
    stringAt(basis.reference, `${path}.basis.reference`);
    stringAt(basis.rationale, `${path}.basis.rationale`);
    stringAt(finding.remediation, `${path}.remediation`);
    stringAt(finding.verification, `${path}.verification`);
  });

  arrayAt(report.validations, '$.validations').forEach((validation, index) => {
    const path = `$.validations[${index}]`;
    objectAt(validation, path, ['name', 'status', 'summary'], ['command', 'details']);
    stringAt(validation.name, `${path}.name`);
    enumAt(validation.status, `${path}.status`, VALIDATION_STATUSES);
    stringAt(validation.summary, `${path}.summary`);
    if ('command' in validation) stringAt(validation.command, `${path}.command`, { allowEmpty: true });
    if ('details' in validation) stringAt(validation.details, `${path}.details`, { allowEmpty: true });
  });

  arrayAt(report.passedChecks, '$.passedChecks').forEach((check, index) => {
    const path = `$.passedChecks[${index}]`;
    objectAt(check, path, ['title', 'evidence']);
    stringAt(check.title, `${path}.title`);
    stringAt(check.evidence, `${path}.evidence`);
  });

  arrayAt(report.preExistingIssues, '$.preExistingIssues').forEach((issue, index) => {
    const path = `$.preExistingIssues[${index}]`;
    objectAt(issue, path, ['title', 'severity', 'summary', 'files']);
    stringAt(issue.title, `${path}.title`);
    enumAt(issue.severity, `${path}.severity`, SEVERITIES);
    stringAt(issue.summary, `${path}.summary`);
    pathListAt(issue.files, `${path}.files`, { required: true });
  });

  arrayAt(report.unverifiedAreas, '$.unverifiedAreas').forEach((area, index) => {
    const path = `$.unverifiedAreas[${index}]`;
    objectAt(area, path, ['title', 'reason', 'files']);
    stringAt(area.title, `${path}.title`);
    stringAt(area.reason, `${path}.reason`);
    pathListAt(area.files, `${path}.files`);
  });

  rejectSecrets(report);
  return report;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function list(values, className = '') {
  return `<ul${className ? ` class="${className}"` : ''}>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function badge(label, className = '') {
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function findingCard(finding) {
  const evidence = finding.evidence.map((item) => {
    const lines = item.lineEnd && item.lineEnd !== item.lineStart ? `${item.lineStart}-${item.lineEnd}` : item.lineStart;
    const excerpt = 'excerpt' in item ? `<pre><code>${escapeHtml(item.excerpt)}</code></pre>` : '';
    return `<div class="evidence"><strong><code>${escapeHtml(item.file)}:${escapeHtml(lines)}</code></strong><p>${escapeHtml(item.explanation)}</p>${excerpt}</div>`;
  }).join('');
  return `<article class="finding-card severity-${finding.severity}" data-finding data-severity="${finding.severity}" data-risk="${finding.riskTier}" data-effort="${finding.effort}" data-status="${finding.status}">
    <div class="finding-header">
      <div class="finding-id">${escapeHtml(finding.id)}</div>
      <h3>${escapeHtml(finding.title)}</h3>
      <div class="badges">
        ${badge(finding.severity, `severity-${finding.severity}`)}
        ${badge(finding.riskTier, `risk-${finding.riskTier}`)}
        ${badge(`effort ${finding.effort}`)}
        ${badge(`${finding.confidence} confidence`)}
        ${badge(finding.provenance)}
      </div>
    </div>
    <div class="finding-body">
      <div class="detail-block"><span class="label">Impact</span><p>${escapeHtml(finding.impact)}</p></div>
      <div class="detail-block"><span class="label">Affected modules</span>${list(finding.affectedModules)}</div>
      <div class="detail-block"><span class="label">Affected files</span>${list(finding.affectedFiles, 'path-list')}</div>
      <div class="detail-block"><span class="label">Relevant changes</span>${list(finding.relevantChanges)}</div>
      <div class="detail-block"><span class="label">Evidence</span>${evidence}</div>
      <div class="detail-block"><span class="label">Basis</span><p><strong>${escapeHtml(finding.basis.type)}:</strong> ${escapeHtml(finding.basis.reference)}</p><p>${escapeHtml(finding.basis.rationale)}</p></div>
      <div class="detail-block"><span class="label">Recommended remediation</span><p>${escapeHtml(finding.remediation)}</p></div>
      <div class="detail-block"><span class="label">Verification</span><p>${escapeHtml(finding.verification)}</p></div>
    </div>
  </article>`;
}

function sectionCards(items, render, emptyText) {
  return items.length ? `<div class="context-grid">${items.map(render).join('')}</div>` : `<p class="empty">${escapeHtml(emptyText)}</p>`;
}

function optionList(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

export function renderReviewReport(report, {
  css = readFileSync(join(SKILL_ROOT, 'assets', 'review-report.css'), 'utf8'),
  javascript = readFileSync(join(SKILL_ROOT, 'assets', 'review-report.js'), 'utf8'),
} = {}) {
  validateReviewReport(report);
  const normalizedCss = css.replace(/\r\n?/g, '\n');
  const normalizedJavaScript = javascript.replace(/\r\n?/g, '\n');
  if (/<\/style/i.test(normalizedCss)) throw new Error('Report CSS must not contain a closing style tag.');
  if (/<\/script/i.test(normalizedJavaScript)) throw new Error('Report JavaScript must not contain a closing script tag.');

  const counts = Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    report.findings.filter((finding) => finding.severity === severity).length,
  ]));
  const severityRank = new Map(SEVERITIES.map((severity, index) => [severity, index]));
  const riskRank = new Map(RISKS.map((risk, index) => [risk, index]));
  const findings = [...report.findings].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'confirmed' ? -1 : 1;
    return riskRank.get(left.riskTier) - riskRank.get(right.riskTier)
      || severityRank.get(left.severity) - severityRank.get(right.severity)
      || left.id.localeCompare(right.id);
  });
  const confirmed = findings.filter((finding) => finding.status === 'confirmed');
  const needsVerification = findings.filter((finding) => finding.status === 'needs-verification');
  const styleHash = createHash('sha256').update(normalizedCss).digest('base64');
  const scriptHash = createHash('sha256').update(normalizedJavaScript).digest('base64');

  const changes = sectionCards(report.changes, (change) => `<article class="change-card">
    <div class="badges">${badge(change.kind)}</div>
    <h3>${escapeHtml(change.summary)}</h3>
    <span class="label">Modules</span>${list(change.modules)}
    <span class="label">Files</span>${list(change.files, 'path-list')}
  </article>`, 'No direct or affected changes were recorded.');

  const validations = report.validations.length ? `<div class="validation-table-wrap"><table class="validation-table">
    <thead><tr><th>Check</th><th>Status</th><th>Command</th><th>Result</th></tr></thead>
    <tbody>${report.validations.map((validation) => `<tr>
      <td><strong>${escapeHtml(validation.name)}</strong></td>
      <td class="status-${validation.status}">${escapeHtml(validation.status)}</td>
      <td>${'command' in validation ? `<code>${escapeHtml(validation.command)}</code>` : '—'}</td>
      <td>${escapeHtml(validation.summary)}${validation.details ? `<p class="muted">${escapeHtml(validation.details)}</p>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : '<p class="notice">No validation commands were recorded. This must not be interpreted as a pass.</p>';

  const passedChecks = sectionCards(report.passedChecks, (check) => `<article class="context-card"><h3>${escapeHtml(check.title)}</h3><p>${escapeHtml(check.evidence)}</p></article>`, 'No passed checks were recorded.');
  const preExisting = sectionCards(report.preExistingIssues, (issue) => `<article class="context-card"><div class="badges">${badge(issue.severity, `severity-${issue.severity}`)}</div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.summary)}</p>${list(issue.files, 'path-list')}</article>`, 'No affected pre-existing issues were recorded.');
  const unverified = sectionCards(report.unverifiedAreas, (area) => `<article class="context-card"><h3>${escapeHtml(area.title)}</h3><p>${escapeHtml(area.reason)}</p>${area.files.length ? list(area.files, 'path-list') : '<p class="muted">No specific files identified.</p>'}</article>`, 'No unverified areas were recorded.');
  const limitations = report.metadata.limitations.length ? list(report.metadata.limitations) : '<p class="empty">No review limitations were recorded.</p>';
  const confirmedEmpty = report.findings.length
    ? '<p class="empty">No confirmed findings were recorded. Review items that need verification before deciding release readiness.</p>'
    : '<p class="empty">No findings were recorded. Review validation and unverified areas before interpreting this as release readiness.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">
  <title>${escapeHtml(report.metadata.feature)} · Flutter Rules review</title>
  <style>${normalizedCss}</style>
</head>
<body>
  <header>
    <div class="eyebrow">Flutter Rules · Implemented feature review</div>
    <h1>${escapeHtml(report.metadata.feature)}</h1>
    <p class="subtitle">${escapeHtml(report.summary.rationale)}</p>
  </header>
  <main>
    <section class="section" aria-labelledby="review-metadata">
      <h2 id="review-metadata">Review metadata</h2>
      <div class="meta-grid">
        ${[
          ['Project', report.metadata.project],
          ['Generated', report.metadata.generatedAt],
          ['Rules version', report.metadata.rulesVersion],
          ['Branch', report.metadata.branch],
          ['Baseline', report.metadata.baseline],
          ['Target', report.metadata.target],
        ].map(([label, value]) => `<div class="meta-item"><span class="label">${label}</span><code>${escapeHtml(value)}</code></div>`).join('')}
      </div>
      <div class="detail-block"><span class="label">Scope</span>${list(report.metadata.scope, 'path-list')}</div>
    </section>

    <section class="section" aria-labelledby="executive-summary">
      <h2 id="executive-summary">Executive summary</h2>
      <div class="recommendation ${report.summary.releaseRecommendation}">
        <span class="label">Release recommendation</span>
        <strong>${escapeHtml(report.summary.releaseRecommendation.replaceAll('-', ' '))}</strong>
      </div>
      <div class="summary-grid">
        ${SEVERITIES.map((severity) => `<div class="summary-card"><span class="label">${severity}</span><span class="summary-value severity-${severity}">${counts[severity]}</span></div>`).join('')}
        <div class="summary-card"><span class="label">Needs verification</span><span class="summary-value">${needsVerification.length}</span></div>
      </div>
    </section>

    <section class="section" aria-labelledby="change-impact"><h2 id="change-impact">Change impact</h2>${changes}</section>

    <section class="section" aria-labelledby="findings">
      <h2 id="findings">Findings</h2>
      ${report.findings.length ? `<div class="filters" aria-label="Finding filters">
        <input type="search" data-filter="search" aria-label="Search findings" placeholder="Search findings, files, or modules">
        <select data-filter="severity" aria-label="Filter by severity"><option value="">All severities</option>${optionList(SEVERITIES)}</select>
        <select data-filter="risk" aria-label="Filter by risk tier"><option value="">All risk tiers</option>${optionList(RISKS)}</select>
        <select data-filter="effort" aria-label="Filter by effort"><option value="">All efforts</option>${optionList(EFFORTS)}</select>
        <select data-filter="status" aria-label="Filter by status"><option value="">All statuses</option>${optionList(FINDING_STATUSES)}</select>
      </div>` : ''}
      ${confirmed.length ? `<div class="finding-group"><h3>Confirmed</h3>${confirmed.map(findingCard).join('')}</div>` : confirmedEmpty}
      ${needsVerification.length ? `<div class="finding-group"><h3>Needs verification</h3>${needsVerification.map(findingCard).join('')}</div>` : ''}
      <p class="no-filter-results empty" data-no-filter-results hidden>No findings match the selected filters.</p>
    </section>

    <section class="section" aria-labelledby="validation"><h2 id="validation">Validation</h2>${validations}</section>
    <section class="section" aria-labelledby="passed-checks"><h2 id="passed-checks">Passed checks</h2>${passedChecks}</section>
    <section class="section" aria-labelledby="pre-existing"><h2 id="pre-existing">Affected pre-existing issues</h2>${preExisting}</section>
    <section class="section" aria-labelledby="unverified"><h2 id="unverified">Unverified areas</h2>${unverified}</section>
    <section class="section" aria-labelledby="limitations"><h2 id="limitations">Limitations</h2>${limitations}</section>

    <section class="section" aria-labelledby="classification">
      <h2 id="classification">Classification guide</h2>
      <div class="legend-grid">
        <div class="legend-card"><span class="label">Severity</span><p>Impact if the issue occurs: critical, high, medium, or low.</p></div>
        <div class="legend-card"><span class="label">Risk tier</span><p>Release urgency: R1 blocker through R4 optional follow-up.</p></div>
        <div class="legend-card"><span class="label">Confidence</span><p>Strength of evidence: high, medium, or low.</p></div>
        <div class="legend-card"><span class="label">Effort</span><p>Relative remediation scope: XS through XL, not a time estimate.</p></div>
      </div>
    </section>
  </main>
  <footer>Display-only report. Choose follow-up changes in chat; no remediation was performed by this review.</footer>
  <script>${normalizedJavaScript}</script>
</body>
</html>`;
}

export function browserCommand(htmlPath, platform = process.platform, env = process.env) {
  const url = pathToFileURL(resolve(htmlPath)).href;
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') {
    return { command: env.ComSpec || env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] };
  }
  return { command: 'xdg-open', args: [url] };
}

export function openReport(htmlPath, { platform = process.platform, env = process.env, spawnImpl = spawn } = {}) {
  const launch = browserCommand(htmlPath, platform, env);
  return new Promise((resolveLaunch) => {
    let child;
    try {
      child = spawnImpl(launch.command, launch.args, { detached: true, stdio: 'ignore' });
    } catch (reason) {
      resolveLaunch({ opened: false, error: reason });
      return;
    }
    child.once('error', (error) => resolveLaunch({ opened: false, error }));
    child.once('spawn', () => {
      child.unref();
      resolveLaunch({ opened: true, error: null });
    });
  });
}

function parseArgs(argv) {
  let input = null;
  let output = null;
  let shouldOpen = true;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--no-open') shouldOpen = false;
    else if (value === '--output') {
      output = argv[index + 1];
      if (!output) throw new Error('--output requires a path.');
      index += 1;
    } else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else if (input) throw new Error(`Unexpected argument: ${value}`);
    else input = value;
  }
  if (!input) throw new Error('Usage: render-review-report.mjs <review.json> [--output <review.html>] [--no-open]');
  return { input: resolve(input), output: output ? resolve(output) : resolve(dirname(input), 'review.html'), shouldOpen };
}

export async function run(argv, { log = console.log, error = console.error, open = openReport } = {}) {
  const options = parseArgs(argv);
  const report = JSON.parse(readFileSync(options.input, 'utf8'));
  const html = renderReviewReport(report);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, html, 'utf8');
  log(`Review report: ${options.output}`);
  if (options.shouldOpen) {
    const result = await open(options.output);
    if (!result.opened) error(`Could not open the review report automatically: ${result.error?.message || 'unknown error'}`);
  }
  return options.output;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  run(process.argv.slice(2)).catch((reason) => {
    console.error(reason instanceof Error ? reason.message : String(reason));
    process.exitCode = 1;
  });
}
