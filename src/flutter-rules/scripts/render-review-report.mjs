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

function list(values, className = 'bullets') {
  return `<ul class="${className}">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function searchIndex(finding) {
  return [
    finding.id,
    finding.title,
    finding.impact,
    finding.remediation,
    finding.verification,
    finding.basis.reference,
    finding.basis.rationale,
    ...finding.affectedModules,
    ...finding.affectedFiles,
    ...finding.relevantChanges,
    ...finding.evidence.map((item) => `${item.file} ${item.explanation}`),
  ].join(' ').toLowerCase();
}

function formatExcerptWithGutters(excerpt, lineStart) {
  if (!excerpt) return '';
  const lines = excerpt.split('\n');
  const startNum = Number.isInteger(lineStart) && lineStart > 0 ? lineStart : 1;
  const rows = lines.map((line, idx) => {
    const lineNum = startNum + idx;
    return `<div class="code-line"><span class="line-no">${lineNum}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
  }).join('');
  return `<div class="code-frame"><div class="code-lines">${rows}</div></div>`;
}

function findingCard(finding) {
  const evidence = finding.evidence.map((item) => {
    const lines = item.lineEnd && item.lineEnd !== item.lineStart ? `${item.lineStart}–${item.lineEnd}` : item.lineStart;
    const excerpt = 'excerpt' in item && item.excerpt ? formatExcerptWithGutters(item.excerpt, item.lineStart) : '';
    return `<div class="evidence-box">
      <div class="evidence-header">
        <svg class="file-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6H9.75A1.75 1.75 0 0 1 8 4.25V1.5H3.75Zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06ZM2 1.75C2 .784 2.784 0 3.75 0h5.586a1.75 1.75 0 0 1 1.237.513l3.414 3.414c.328.328.513.773.513 1.237v9.086A1.75 1.75 0 0 1 12.75 16h-9A1.75 1.75 0 0 1 2 14.25V1.75Z"/></svg>
        <code class="evidence-file">${escapeHtml(item.file)}</code>
        <span class="evidence-lines">L${escapeHtml(lines)}</span>
      </div>
      <div class="evidence-content">
        <p class="evidence-desc">${escapeHtml(item.explanation)}</p>
        ${excerpt}
      </div>
    </div>`;
  }).join('');

  return `<details class="finding-card severity-${finding.severity}" id="${escapeHtml(finding.id)}" data-finding data-severity="${finding.severity}" data-risk="${finding.riskTier}" data-effort="${finding.effort}" data-status="${finding.status}" data-haystack="${escapeHtml(searchIndex(finding))}">
    <summary class="finding-summary">
      <div class="finding-badge-rail">
        <span class="severity-badge ${finding.severity}">${escapeHtml(finding.severity)}</span>
      </div>
      <div class="finding-header-main">
        <div class="finding-meta-bar">
          <span class="finding-key">${escapeHtml(finding.id)}</span>
          <span class="meta-dot">·</span>
          <span class="meta-tag"><b>Risk</b> ${escapeHtml(finding.riskTier)}</span>
          <span class="meta-dot">·</span>
          <span class="meta-tag"><b>Effort</b> ${escapeHtml(finding.effort)}</span>
          <span class="meta-dot">·</span>
          <span class="meta-tag">${escapeHtml(finding.confidence)} confidence</span>
          <span class="meta-dot">·</span>
          <span class="meta-tag">${escapeHtml(finding.provenance.replaceAll('-', ' '))}</span>
        </div>
        <h3 class="finding-title-text">${escapeHtml(finding.title)}</h3>
      </div>
      <div class="finding-expand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </summary>
    <div class="finding-expanded-content">
      <div class="finding-impact-callout">
        <div class="impact-callout-row">
          <div class="callout-label">Impact & Consequences</div>
          <button type="button" class="copy-fix-btn" data-copy-fix="${escapeHtml(`Fix ${finding.id}: ${finding.remediation}`)}">
            <svg class="icon-copy" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
            <svg class="icon-copied" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
            <span data-copy-label>Copy fix instruction</span>
          </button>
        </div>
        <p>${escapeHtml(finding.impact)}</p>
      </div>
      <div class="finding-two-col">
        <div class="finding-primary-col">
          <div class="finding-block">
            <h4 class="block-title">Evidence & Code</h4>
            ${evidence}
          </div>
          <div class="action-card remediation-card">
            <div class="action-card-header">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0ZM8 11.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/></svg>
              <span>Recommended Remediation</span>
            </div>
            <p>${escapeHtml(finding.remediation)}</p>
          </div>
          <div class="action-card verification-card">
            <div class="action-card-header">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
              <span>Verification Steps</span>
            </div>
            <p>${escapeHtml(finding.verification)}</p>
          </div>
        </div>
        <aside class="finding-sidebar-col">
          <div class="sidebar-section">
            <h4 class="sidebar-title">Affected Modules</h4>
            ${list(finding.affectedModules, 'tag-list')}
          </div>
          <div class="sidebar-section">
            <h4 class="sidebar-title">Affected Files</h4>
            ${list(finding.affectedFiles, 'file-tree-list')}
          </div>
          <div class="sidebar-section">
            <h4 class="sidebar-title">Relevant Changes</h4>
            ${list(finding.relevantChanges, 'change-list')}
          </div>
          <div class="sidebar-section">
            <h4 class="sidebar-title">Rule & Basis</h4>
            <div class="basis-box">
              <span class="basis-type-badge">${escapeHtml(finding.basis.type.replaceAll('-', ' '))}</span>
              <div class="basis-ref">${escapeHtml(finding.basis.reference)}</div>
              <p class="basis-desc">${escapeHtml(finding.basis.rationale)}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </details>`;
}

function sectionCards(items, render, emptyText, columns = 'cols-2') {
  return items.length ? `<div class="grid ${columns}">${items.map(render).join('')}</div>` : `<p class="empty">${escapeHtml(emptyText)}</p>`;
}

function optionList(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

function section(id, title, description, body, count) {
  return `<section class="section" id="${id}" aria-labelledby="${id}-title">
    <div class="section-head">
      <h2 id="${id}-title">${escapeHtml(title)}</h2>
      ${count === undefined ? '' : `<span class="count-pill">${count}</span>`}
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    </div>
    ${body}
  </section>`;
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

  const changes = sectionCards(report.changes, (change) => `<article class="change-card-item">
    <div class="change-badge ${change.kind}">${escapeHtml(change.kind)}</div>
    <h3 class="change-summary">${escapeHtml(change.summary)}</h3>
    <div class="change-details-grid">
      <div><span class="meta-label">Modules</span>${list(change.modules, 'tag-list')}</div>
      <div><span class="meta-label">Files</span>${list(change.files, 'file-tree-list')}</div>
    </div>
  </article>`, 'No direct or affected changes were recorded.');

  const validations = report.validations.length ? `<div class="table-container"><table>
    <thead><tr><th>Check Name</th><th>Status</th><th>Command</th><th>Outcome</th></tr></thead>
    <tbody>${report.validations.map((validation) => `<tr>
      <td class="check-name-cell"><strong>${escapeHtml(validation.name)}</strong></td>
      <td><span class="status-indicator status-${validation.status}">${escapeHtml(validation.status.replaceAll('-', ' '))}</span></td>
      <td>${'command' in validation ? `<code class="command-tag">${escapeHtml(validation.command)}</code>` : '<span class="muted-dash">—</span>'}</td>
      <td class="outcome-cell">${escapeHtml(validation.summary)}${validation.details ? `<div class="outcome-details">${escapeHtml(validation.details)}</div>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : '<p class="notice">No validation commands were recorded. This must not be interpreted as a pass.</p>';

  const passedChecks = sectionCards(report.passedChecks, (check) => `<article class="pass-card"><div class="pass-icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg></div><div><h3>${escapeHtml(check.title)}</h3><p>${escapeHtml(check.evidence)}</p></div></article>`, 'No passed checks were recorded.');
  const preExisting = sectionCards(report.preExistingIssues, (issue) => `<article class="context-card"><div class="context-badge-line"><span class="severity-badge-sm ${issue.severity}">${escapeHtml(issue.severity)}</span></div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.summary)}</p><div class="context-files-block"><span class="meta-label">Files</span>${list(issue.files, 'file-tree-list')}</div></article>`, 'No affected pre-existing issues were recorded.');
  const unverified = sectionCards(report.unverifiedAreas, (area) => `<article class="context-card"><h3>${escapeHtml(area.title)}</h3><p>${escapeHtml(area.reason)}</p>${area.files.length ? `<div class="context-files-block"><span class="meta-label">Files</span>${list(area.files, 'file-tree-list')}</div>` : '<p class="context-empty-note">No specific files identified.</p>'}</article>`, 'No unverified areas were recorded.');
  const limitations = report.metadata.limitations.length
    ? `<div class="limitations-card">${list(report.metadata.limitations, 'bullet-list')}</div>`
    : '<p class="empty">No review limitations were recorded.</p>';
  const confirmedEmpty = report.findings.length
    ? '<p class="empty">No confirmed findings were recorded. Review items that need verification before deciding release readiness.</p>'
    : '<p class="empty">No findings were recorded. Review validation and unverified areas before interpreting this as release readiness.</p>';

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">
  <title>${escapeHtml(report.metadata.feature)} · Flutter Rules Review</title>
  <style>${normalizedCss}</style>
</head>
<body>
  <div class="topbar">
    <div class="shell topbar-inner">
      <div class="brand">
        <div class="brand-badge">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 0 0-1.5 0v6.69L4.78 5.97a.75.75 0 0 0-1.06 1.06l3.75 3.75ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"/></svg>
        </div>
        <span class="brand-title">Flutter Rules</span>
        <span class="brand-divider">/</span>
        <span class="brand-sub">Feature Review</span>
      </div>
      <nav class="jump-nav" aria-label="Report sections">
        <a href="#summary">Summary</a>
        <a href="#scope">Scope</a>
        <a href="#change-impact">Changes</a>
        <a href="#findings">Findings</a>
        <a href="#validation">Validation</a>
        <a href="#context">Context</a>
      </nav>
      <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Switch to dark theme">
        <svg class="icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <span data-theme-label>Theme</span>
      </button>
    </div>
  </div>

  <header class="shell hero-header">
    <div class="header-badge-row">
      <span class="status-kicker">Automated Code Review Report</span>
    </div>
    <h1 class="hero-title">${escapeHtml(report.metadata.feature)}</h1>
    <p class="hero-rationale">${escapeHtml(report.summary.rationale)}</p>
  </header>

  <main class="shell">
    ${section('summary', 'Executive Summary', 'Computed breakdown of review findings and release recommendation.', `<div class="verdict-banner ${report.summary.releaseRecommendation}">
      <div class="verdict-main">
        <div class="verdict-pretitle">Release Status</div>
        <div class="verdict-title">${escapeHtml(report.summary.releaseRecommendation.replaceAll('-', ' '))}</div>
        <p class="verdict-sub">${confirmed.length} confirmed issue${confirmed.length === 1 ? '' : 's'} · ${needsVerification.length} requiring verification</p>
      </div>
      <div class="metrics-grid">
        ${SEVERITIES.map((severity) => `<div class="metric-card ${severity}"><div class="metric-num">${counts[severity]}</div><div class="metric-label">${severity}</div></div>`).join('')}
        <div class="metric-card scope-metric"><div class="metric-num">${report.metadata.scope.length}</div><div class="metric-label">Files Checked</div></div>
        <div class="metric-card test-metric"><div class="metric-num">${report.validations.filter((v) => v.status === 'passed').length}/${report.validations.length}</div><div class="metric-label">Checks Passed</div></div>
      </div>
    </div>`)}

    ${section('scope', 'Review Scope', 'Directly changed files and their immediate dependency radius.', `<div class="scope-card"><div class="scope-header">Target Files (${report.metadata.scope.length})</div>${list(report.metadata.scope, 'file-tree-list')}</div>`, report.metadata.scope.length)}

    ${section('change-impact', 'Change Impact', 'Surface area and architectural layer modifications.', changes, report.changes.length)}

    ${section('findings', 'Findings', 'Review, analyze evidence, and determine follow-up actions.', `${report.findings.length ? `<div class="filters-panel" role="search" aria-label="Filter findings">
        <div class="search-wrap">
          <svg viewBox="0 0 16 16" fill="currentColor" class="search-icon"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
          <input type="search" data-filter="search" placeholder="Search findings by title, file, module, or code...">
        </div>
        <div class="filter-controls">
          <select data-filter="severity"><option value="">Severity: All</option>${optionList(SEVERITIES)}</select>
          <select data-filter="risk"><option value="">Risk: All</option>${optionList(RISKS)}</select>
          <select data-filter="effort"><option value="">Effort: All</option>${optionList(EFFORTS)}</select>
          <select data-filter="status"><option value="">Status: All</option>${optionList(FINDING_STATUSES)}</select>
        </div>
        <div class="toolbar-actions">
          <button type="button" class="toolbar-btn" data-expand-all>Expand all</button>
          <button type="button" class="toolbar-btn" data-collapse-all>Collapse all</button>
        </div>
      </div>` : ''}
      ${confirmed.length ? `<div data-finding-group class="findings-group-wrapper"><div class="group-title-bar">Confirmed Issues <span class="group-count">(${confirmed.length})</span></div>${confirmed.map(findingCard).join('')}</div>` : confirmedEmpty}
      ${needsVerification.length ? `<div data-finding-group class="findings-group-wrapper"><div class="group-title-bar">Needs Verification <span class="group-count">(${needsVerification.length})</span></div>${needsVerification.map(findingCard).join('')}</div>` : ''}
      <p class="empty" data-no-filter-results hidden>No findings match the selected filters.</p>`, report.findings.length)}

    ${section('validation', 'Automated Validation', 'Results from analysis and project test suites.', validations, report.validations.length)}

    <div id="context" class="context-group">
      ${section('passed-checks', 'Passed Checks', 'Areas verified with zero detected defects.', passedChecks, report.passedChecks.length)}
      ${section('pre-existing', 'Pre-existing Issues', 'Existing codebase defects identified in the vicinity.', preExisting, report.preExistingIssues.length)}
      ${section('unverified', 'Unverified Areas', 'Surfaces not exercised due to environment or tooling constraints.', unverified, report.unverifiedAreas.length)}
      ${section('limitations', 'Review Limitations', null, limitations, report.metadata.limitations.length)}
    </div>

    ${section('classification', 'Classification Reference', 'Standard definitions for risk and effort tiers.', `<div class="guide-grid">
      <div class="guide-tile"><div class="guide-title">Severity</div><p>Impact severity: <b>Critical</b> (blocker/data-loss), <b>High</b> (major flaw), <b>Medium</b> (partial issue), <b>Low</b> (minor/polish).</p></div>
      <div class="guide-tile"><div class="guide-title">Risk Tier</div><p>Release urgency: <b>R1</b> (Must fix now), <b>R2</b> (Fix before merge), <b>R3</b> (Next cycle), <b>R4</b> (Backlog/Optional).</p></div>
      <div class="guide-tile"><div class="guide-title">Confidence</div><p>Confidence score: <b>High</b> (definitive proof), <b>Medium</b> (probable issue), <b>Low</b> (heuristic/speculative).</p></div>
      <div class="guide-tile"><div class="guide-title">Effort</div><p>Estimated remediation scope: <b>XS</b> (&lt;10m), <b>S</b> (&lt;1h), <b>M</b> (1-4h), <b>L</b> (1-2d), <b>XL</b> (multi-day refactor).</p></div>
    </div>`)}
  </main>

  <footer class="shell report-footer">
    <div class="footer-note">This is a display-only audit report. Changes are not applied automatically. Direct the agent in chat with specific fix instructions.</div>
  </footer>
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
