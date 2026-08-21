import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  browserCommand,
  openReport,
  renderReviewReport,
  run,
  validateReviewReport,
} from '../src/flutter-rules/scripts/render-review-report.mjs';

function reportFixture() {
  return {
    schemaVersion: 1,
    metadata: {
      feature: 'Authentication refresh',
      project: 'example_app',
      generatedAt: '2026-08-21T10:20:30.000Z',
      rulesVersion: '2.0.2',
      branch: 'feature/auth-refresh',
      baseline: 'main@abc123',
      target: 'HEAD@def456',
      scope: ['lib/features/auth/auth.dart', 'test/features/auth/auth_test.dart'],
      limitations: ['Live API validation was unavailable.'],
    },
    summary: {
      releaseRecommendation: 'fix-before-merge',
      rationale: 'One high-risk session failure must be addressed.',
    },
    changes: [
      {
        kind: 'modified',
        summary: 'Refreshes expired sessions.',
        modules: ['auth', 'session'],
        files: ['lib/features/auth/auth.dart'],
      },
      {
        kind: 'affected',
        summary: 'Checks route-level session consumers.',
        modules: ['routing'],
        files: ['lib/app/router.dart'],
      },
    ],
    findings: [
      {
        id: 'AUTH-1',
        title: 'Refresh failure preserves authenticated state',
        status: 'confirmed',
        provenance: 'introduced',
        severity: 'high',
        riskTier: 'R2',
        confidence: 'high',
        effort: 'S',
        affectedModules: ['auth', 'session'],
        affectedFiles: ['lib/features/auth/auth.dart'],
        relevantChanges: ['The failure branch no longer clears the session.'],
        impact: 'A user can remain in an invalid authenticated state.',
        evidence: [
          {
            file: 'lib/features/auth/auth.dart',
            lineStart: 42,
            lineEnd: 48,
            excerpt: 'return currentSession;',
            explanation: 'The error path returns the stale session.',
          },
        ],
        basis: {
          type: 'security',
          reference: 'Secure session invalidation',
          rationale: 'Invalid credentials must not retain authenticated state.',
        },
        remediation: 'Invalidate the session before returning the refresh failure.',
        verification: 'Add a test that asserts refresh failure clears authenticated state.',
      },
      {
        id: 'AUTH-2',
        title: 'Widget retry behavior needs verification',
        status: 'needs-verification',
        provenance: 'unknown',
        severity: 'medium',
        riskTier: 'R3',
        confidence: 'low',
        effort: 'M',
        affectedModules: ['auth-ui'],
        affectedFiles: ['lib/features/auth/presentation/auth_page.dart'],
        relevantChanges: ['Retry now depends on route-owned state.'],
        impact: 'The retry action may not be available after route restoration.',
        evidence: [
          {
            file: 'lib/features/auth/presentation/auth_page.dart',
            lineStart: 80,
            explanation: 'No restoration test covers this path.',
          },
        ],
        basis: {
          type: 'testing',
          reference: 'Route restoration acceptance criteria',
          rationale: 'The available tests do not establish the required behavior.',
        },
        remediation: 'Confirm the product requirement and add route restoration coverage if required.',
        verification: 'Restore the route in a widget test and exercise retry.',
      },
    ],
    validations: [
      {
        name: 'Flutter analyzer',
        status: 'passed',
        command: 'flutter analyze',
        summary: 'No analyzer issues were introduced.',
      },
      {
        name: 'Live API',
        status: 'blocked',
        summary: 'Credentials were unavailable.',
        details: 'The review used mocked repository responses.',
      },
    ],
    passedChecks: [
      {
        title: 'Layer direction',
        evidence: 'Domain remains independent of data and presentation.',
      },
    ],
    unverifiedAreas: [
      {
        title: 'Production identity provider',
        reason: 'No production credentials were available.',
        files: [],
      },
    ],
  };
}

function tempDirectory() {
  return mkdtempSync(join(tmpdir(), 'flutter-rules-report-'));
}

test('complete report validates and renders every review section', () => {
  const report = reportFixture();
  assert.equal(validateReviewReport(report), report);
  const html = renderReviewReport(report);
  for (const heading of [
    'Executive Summary',
    'Review Scope',
    'Change Impact',
    'Findings',
    'Automated Validation',
    'Passed Checks',
    'Unverified Areas',
    'Review Limitations',
    'Classification Reference',
  ]) assert.match(html, new RegExp(heading));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(html, /style-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(html, /unsafe-inline/);
  assert.match(html, /data-filter="severity"/);
  assert.doesNotMatch(html, /<script\s+src=/);
  assert.doesNotMatch(html, /<link\s+[^>]*href=/);
  assert.doesNotMatch(html, /type="checkbox"|type="radio"|<form/);
  assert.match(html, /Direct edits and related dependency surfaces reviewed\./);
  assert.match(html, /change-badge modified">directly modified/);
  assert.match(html, /change-badge affected">related surface/);
  assert.ok(html.indexOf('AUTH-1') < html.indexOf('AUTH-2'));
});

test('report defaults to the light theme and offers an accessible toggle', () => {
  const html = renderReviewReport(reportFixture());
  assert.match(html, /<html lang="en" data-theme="light">/);
  assert.match(html, /class="theme-toggle" data-theme-toggle aria-pressed="false"/);
  assert.match(html, /aria-label="Switch to dark theme"/);
  const css = readFileSync(resolve('src/flutter-rules/assets/review-report.css'), 'utf8');
  assert.match(css, /^:root \{\r?\n {2}color-scheme: light;/m);
  assert.match(css, /\[data-theme="dark"\] \{/);
  assert.match(css, /\.status-indicator \{[\s\S]*white-space: nowrap;/);
  const javascript = readFileSync(resolve('src/flutter-rules/assets/review-report.js'), 'utf8');
  assert.match(javascript, /storedTheme\(\) \?\? 'light'/);
});

test('finding layout remains readable with long paths and dense content', () => {
  const report = reportFixture();
  const longPath = 'lib/features/register/presentation/widgets/registration_error_localization_message_mapper.dart';
  report.findings[0].affectedFiles = [longPath];
  report.findings[0].relevantChanges = [
    'Repository failures are mapped into localized presentation messages without exposing backend error text.',
    'The registration page now renders operation-specific validation feedback.',
  ];
  const html = renderReviewReport(report);
  assert.match(html, /class="finding-two-col"/);
  assert.match(html, /class="finding-primary-col"/);
  assert.match(html, /class="finding-sidebar-col"/);
  assert.match(html, /class="action-card remediation-card"/);
  assert.match(html, new RegExp(longPath.replaceAll('.', '\\.')));
  assert.doesNotMatch(html, / style="/);
  const css = readFileSync(resolve('src/flutter-rules/assets/review-report.css'), 'utf8');
  assert.match(css, /grid-template-columns: minmax\(0, 1\.7fr\) minmax\(280px, 1fr\)/);
  assert.match(css, /\.change-badge \{[\s\S]*white-space: nowrap;/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\.finding-two-col \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(css, /radial-gradient|linear-gradient|border-radius: 999px/);
});

test('findings expose action bridges: anchors, copy instructions, expand controls', () => {
  const report = reportFixture();
  const html = renderReviewReport(report);
  assert.match(html, /<details class="finding-card[^"]*" id="AUTH-1"/);
  assert.match(html, /<details class="finding-card[^"]*" id="AUTH-2"/);
  assert.match(html, /data-copy-fix="Fix AUTH-1: Invalidate the session before returning the refresh failure\."/);
  assert.match(html, /Copy fix instruction/);
  assert.match(html, /data-expand-all/);
  assert.match(html, /data-collapse-all/);
  const javascript = readFileSync(resolve('src/flutter-rules/assets/review-report.js'), 'utf8');
  assert.match(javascript, /navigator\.clipboard\.writeText/);
  assert.match(javascript, /execCommand\('copy'\)/);
  assert.match(javascript, /hasAttribute\('data-finding'\)/);
});

test('copy instruction escapes hostile remediation text', () => {
  const report = reportFixture();
  report.findings[0].remediation = 'Escape "quotes" & <tags> before rendering.';
  const html = renderReviewReport(report);
  assert.match(html, /data-copy-fix="Fix AUTH-1: Escape &quot;quotes&quot; &amp; &lt;tags&gt; before rendering\."/);
  assert.doesNotMatch(html, /data-copy-fix="[^"]*<tags>/);
});

test('empty review renders no action toolbar', () => {
  const report = reportFixture();
  report.findings = [];
  report.summary = { releaseRecommendation: 'ready', rationale: 'No confirmed defect was found.' };
  const html = renderReviewReport(report);
  assert.doesNotMatch(html, /<button[^>]*data-expand-all|<button[^>]*data-copy-fix/);
});

test('renderer normalizes inlined asset line endings for stable CSP hashes', () => {
  const html = renderReviewReport(reportFixture(), {
    css: 'body {\r\n  color: black;\r\n}',
    javascript: 'const ready = true;\r\n',
  });
  assert.doesNotMatch(html, /\r/);
  assert.match(html, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(html, /style-src 'sha256-[A-Za-z0-9+/=]+'/);
});

test('renderer escapes hostile report content in text and attributes', () => {
  const report = reportFixture();
  report.findings[0].title = '"><img src=x onerror=alert(1)>';
  report.findings[0].affectedModules = ['${process.env}<script>alert(1)</script>'];
  const html = renderReviewReport(report);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('renderer computes counts and supports an honest empty-findings state', () => {
  const report = reportFixture();
  report.findings = [];
  report.summary = { releaseRecommendation: 'ready', rationale: 'No confirmed defect was found.' };
  const html = renderReviewReport(report);
  assert.match(html, /No findings were recorded/);
  assert.match(html, /Review validation and unverified areas/);
  assert.doesNotMatch(html, /<select data-filter="severity"/);
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    assert.match(html, new RegExp(`<div class="metric-card ${severity}"><div class="metric-num">0</div>`));
  }
});

test('renderer distinguishes unverified findings from an empty review', () => {
  const report = reportFixture();
  report.findings = [report.findings[1]];
  const html = renderReviewReport(report);
  assert.match(html, /No confirmed findings were recorded/);
  assert.match(html, /Needs Verification/);
  assert.doesNotMatch(html, /No findings were recorded\./);
});

test('validator accepts every documented classification value', () => {
  for (const [field, values] of Object.entries({
    severity: ['critical', 'high', 'medium', 'low'],
    riskTier: ['R1', 'R2', 'R3', 'R4'],
    confidence: ['high', 'medium', 'low'],
    effort: ['XS', 'S', 'M', 'L', 'XL'],
    status: ['confirmed', 'needs-verification'],
  })) {
    for (const value of values) {
      const report = reportFixture();
      report.findings = [{ ...report.findings[0], [field]: value }];
      assert.doesNotThrow(() => validateReviewReport(report), `${field}=${value}`);
    }
  }
});

test('validator rejects malformed reports with actionable paths', () => {
  const unsupported = reportFixture();
  unsupported.schemaVersion = 2;
  assert.throws(() => validateReviewReport(unsupported), /\$\.schemaVersion: must equal 1/);

  const invalidEnum = reportFixture();
  invalidEnum.findings[0].severity = 'urgent';
  assert.throws(() => validateReviewReport(invalidEnum), /\$\.findings\[0\]\.severity/);

  const duplicate = reportFixture();
  duplicate.findings[1].id = duplicate.findings[0].id;
  assert.throws(() => validateReviewReport(duplicate), /duplicates AUTH-1/);

  const noEvidence = reportFixture();
  noEvidence.findings[0].evidence = [];
  assert.throws(() => validateReviewReport(noEvidence), /evidence: must contain at least one item/);

  const unknownProperty = reportFixture();
  unknownProperty.summary.total = 2;
  assert.throws(() => validateReviewReport(unknownProperty), /\$\.summary\.total: is not allowed/);
});

test('validator rejects unsafe paths, line ranges, and likely secrets', () => {
  const traversal = reportFixture();
  traversal.findings[0].evidence[0].file = '../secrets.txt';
  assert.throws(() => validateReviewReport(traversal), /must not contain path traversal/);

  const windowsPath = reportFixture();
  windowsPath.findings[0].affectedFiles = ['C:\\project\\auth.dart'];
  assert.throws(() => validateReviewReport(windowsPath), /project-relative POSIX path/);

  const lineRange = reportFixture();
  lineRange.findings[0].evidence[0].lineEnd = 1;
  assert.throws(() => validateReviewReport(lineRange), /greater than or equal to lineStart/);

  const secret = reportFixture();
  // Assembled at runtime so the repository never stores a credential-shaped literal.
  secret.findings[0].evidence[0].excerpt = `Authorization: ${['Bea', 'rer'].join('')} ${'a1b2c3d4'.repeat(3)}`;
  assert.throws(() => validateReviewReport(secret), /appears to contain a secret/);

  const ordinaryText = reportFixture();
  ordinaryText.findings[0].impact = 'Users cannot reset a password after session expiry.';
  ordinaryText.findings[0].evidence[0].excerpt = 'token = refreshToken;';
  assert.doesNotThrow(() => validateReviewReport(ordinaryText));
});

test('schema file is valid JSON and matches the runtime contract version', () => {
  const schemaPath = resolve('src/flutter-rules/schemas/review-report.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.$defs.finding.properties.severity.enum, ['critical', 'high', 'medium', 'low']);
  assert.deepEqual(schema.$defs.finding.properties.riskTier.enum, ['R1', 'R2', 'R3', 'R4']);
  assert.deepEqual(schema.$defs.finding.properties.effort.enum, ['XS', 'S', 'M', 'L', 'XL']);
});

test('browser command selection is platform-specific and uses a file URL', () => {
  const path = resolve('folder with spaces', 'review.html');
  const macOS = browserCommand(path, 'darwin');
  assert.equal(macOS.command, 'open');
  assert.match(macOS.args[0], /^file:\/\//);
  assert.match(macOS.args[0], /folder%20with%20spaces/);
  const linux = browserCommand(path, 'linux');
  assert.equal(linux.command, 'xdg-open');
  assert.match(linux.args[0], /^file:\/\//);
  assert.match(linux.args[0], /folder%20with%20spaces/);
  const windows = browserCommand(path, 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' });
  assert.equal(windows.command, 'C:\\Windows\\cmd.exe');
  assert.deepEqual(windows.args.slice(0, 5), ['/d', '/s', '/c', 'start', '']);
  assert.match(windows.args[5], /^file:\/\//);
  assert.equal(browserCommand(path, 'win32', {}).command, 'cmd.exe');
});

test('browser launch errors are non-fatal results', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => child.emit('error', new Error('missing opener')));
    return child;
  };
  const result = await openReport('review.html', { spawnImpl });
  assert.equal(result.opened, false);
  assert.match(result.error.message, /missing opener/);
});

test('CLI run writes offline HTML and honors no-open', async () => {
  const directory = tempDirectory();
  const input = join(directory, 'review.json');
  const output = join(directory, 'nested', 'review.html');
  const logs = [];
  try {
    writeFileSync(input, JSON.stringify(reportFixture()));
    await run([input, '--output', output, '--no-open'], {
      log: (message) => logs.push(message),
      open: async () => assert.fail('browser opener must not run'),
    });
    assert.equal(existsSync(output), true);
    assert.match(readFileSync(output, 'utf8'), /<!doctype html>/);
    assert.match(logs.join('\n'), new RegExp(output.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI run preserves a generated report when automatic opening fails', async () => {
  const directory = tempDirectory();
  const input = join(directory, 'review.json');
  const output = join(directory, 'review.html');
  const errors = [];
  try {
    writeFileSync(input, JSON.stringify(reportFixture()));
    await run([input, '--output', output], {
      log: () => {},
      error: (message) => errors.push(message),
      open: async () => ({ opened: false, error: new Error('headless') }),
    });
    assert.equal(existsSync(output), true);
    assert.match(errors.join('\n'), /Could not open.*headless/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
