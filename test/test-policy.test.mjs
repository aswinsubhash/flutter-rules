import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  changedDartFiles,
  run,
  validateTestPolicy,
} from '../src/flutter-rules/scripts/validate-test-policy.mjs';

function project({ blocTest = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'flutter-rules-policy-'));
  write(root, 'pubspec.yaml', `name: example_app\nenvironment:\n  sdk: ^3.0.0\ndev_dependencies:\n${blocTest ? '  bloc_test: ^10.0.0\n' : '  flutter_test:\n    sdk: flutter\n'}`);
  return root;
}

function write(root, path, content = '') {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function validate(root, files) {
  return validateTestPolicy({ projectRoot: root, files });
}

function withProject(options, callback) {
  const root = project(options);
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const blocProduction = 'lib/features/login/presentation/bloc/login_bloc.dart';
const blocTestPath = 'test/features/login/presentation/bloc/login_bloc_test.dart';
const blocImport = "import 'package:example_app/features/login/presentation/bloc/login_bloc.dart';\n";

test('validator accepts mirrored tests and typed blocTest coverage', () => {
  withProject({ blocTest: true }, (root) => {
    write(root, 'pubspec.yaml', 'name: example_app\ndev_dependencies:\n# state testing\n  bloc_test: any # pinned by the lockfile\n');
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, blocTestPath, `${blocImport}import 'package:bloc_test/bloc_test.dart';\nvoid main() { blocTest<LoginBloc<Session>, LoginState<List<Result>>>('loads', build: () => LoginBloc()); }\n`);
    const cubitProduction = 'lib/features/login/presentation/bloc/login_cubit.dart';
    const cubitTest = 'test/features/login/presentation/bloc/login_cubit_test.dart';
    write(root, cubitProduction, 'class LoginCubit {}\n');
    write(root, cubitTest, "import 'package:example_app/features/login/presentation/bloc/login_cubit.dart';\nimport 'package:bloc_test/bloc_test.dart';\nvoid main() { blocTest<LoginCubit, LoginState>('loads', build: () => LoginCubit()); }\n");
    write(root, 'lib/core/storage/user_session.dart', 'class UserSession {}\n');
    write(root, 'test/core/storage/user_session_test.dart', "import 'package:example_app/core/storage/user_session.dart';\nvoid main() {}\n");

    const result = validate(root, [blocTestPath, cubitTest, 'test/core/storage/user_session_test.dart']);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.exceptions, []);
  });
});

test('validator rejects flat feature tests and prints the mirrored destination', () => {
  withProject({}, (root) => {
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, 'test/login_bloc_test.dart', `${blocImport}void main() {}\n`);

    const result = validate(root, ['test/login_bloc_test.dart']);
    const placement = result.errors.find(({ code }) => code === 'TEST_PATH_NOT_MIRRORED');
    assert.equal(placement.expected, blocTestPath);
  });
});

test('validator accepts a flat legacy test after it moves to the mirrored path', () => {
  withProject({}, (root) => {
    const production = 'lib/features/login/data/repositories/login_repository_impl.dart';
    const mirrored = 'test/features/login/data/repositories/login_repository_impl_test.dart';
    const source = "import 'package:example_app/features/login/data/repositories/login_repository_impl.dart';\nvoid main() {}\n";
    write(root, production, 'class LoginRepositoryImpl {}\n');
    write(root, mirrored, source);
    assert.deepEqual(validate(root, [mirrored]).errors, []);
  });
});

test('validator rejects mirrored paths without a production mapping', () => {
  withProject({}, (root) => {
    const file = 'test/features/login/data/repositories/missing_repository_test.dart';
    write(root, file, 'void main() {}\n');
    const result = validate(root, [file]);
    assert.deepEqual(result.errors.map(({ code }) => code), ['TEST_PATH_UNMAPPED']);
    assert.equal(result.errors[0].expected, 'lib/features/login/data/repositories/missing_repository.dart');
  });
});

test('validator requires dependency, import, and typed blocTest usage', () => {
  withProject({}, (root) => {
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, blocTestPath, `${blocImport}void main() { test('loads', () {}); }\n`);
    const result = validate(root, [blocTestPath]);
    assert.deepEqual(result.errors.map(({ code }) => code), [
      'BLOC_TEST_DEPENDENCY',
      'BLOC_TEST_IMPORT',
      'BLOC_TEST_USAGE',
    ]);
  });
});

test('validator permits documented manual Bloc and root-test exceptions', () => {
  withProject({}, (root) => {
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, blocTestPath, `${blocImport}// flutter-rules: allow-manual-bloc-test -- coordinates two dependent streams\nvoid main() { test('streams', () {}); }\n`);
    write(root, 'lib/features/login/presentation/pages/login_page.dart', 'class LoginPage {}\n');
    write(root, 'test/app_flow_test.dart', "import 'package:example_app/features/login/presentation/pages/login_page.dart';\n// flutter-rules: allow-root-test -- app-wide smoke flow crosses feature boundaries\nvoid main() {}\n");

    const result = validate(root, [blocTestPath, 'test/app_flow_test.dart']);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.exceptions.map(({ code }) => code), [
      'ROOT_TEST_EXCEPTION',
      'MANUAL_BLOC_EXCEPTION',
    ]);
    const output = [];
    assert.equal(run([
      '--project', root,
      '--file', blocTestPath,
      '--file', 'test/app_flow_test.dart',
    ], { log: (message) => output.push(message) }), 0);
    assert.match(output.join('\n'), /coordinates two dependent streams/);
    assert.match(output.join('\n'), /app-wide smoke flow crosses feature boundaries/);
  });
});

test('support and app-wide tests pass while integration tests stay out of scope', () => {
  withProject({}, (root) => {
    write(root, 'test/support/fake_clock_test.dart', 'void main() {}\n');
    write(root, 'test/app_smoke_test.dart', 'void main() {}\n');
    write(root, 'integration_test/login_flow_test.dart', 'void main() {}\n');
    const result = validate(root, [
      'test/support/fake_clock_test.dart',
      'test/app_smoke_test.dart',
      'integration_test/login_flow_test.dart',
    ]);
    assert.deepEqual(result.files, ['test/app_smoke_test.dart', 'test/support/fake_clock_test.dart']);
    assert.deepEqual(result.errors, []);
  });
});

test('widget tests are exempt unless they directly assert transitions', () => {
  withProject({}, (root) => {
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, 'lib/features/login/presentation/pages/login_page.dart', 'class LoginPage {}\n');
    const file = 'test/features/login/presentation/pages/login_page_test.dart';
    write(root, file, `${blocImport}void main() { testWidgets('renders', (tester) async {}); }\n`);
    assert.deepEqual(validate(root, [file]).errors, []);

    write(root, file, `${blocImport}void main() { testWidgets('transitions', (tester) async { expectLater(bloc.stream, emitsInOrder([])); }); }\n`);
    assert.deepEqual(validate(root, [file]).errors.map(({ code }) => code), [
      'BLOC_TEST_DEPENDENCY',
      'BLOC_TEST_IMPORT',
      'BLOC_TEST_USAGE',
    ]);
  });
});

test('changed-file detection includes untracked Dart tests before the first commit', () => {
  withProject({}, (root) => {
    const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    write(root, 'test/widget_test.dart', 'void main() {}\n');
    write(root, 'README.md', 'ignored\n');
    assert.deepEqual(changedDartFiles(root), ['test/widget_test.dart']);
  });
});

test('changed-file detection includes staged tests after a commit', () => {
  withProject({}, (root) => {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
    write(root, 'test/widget_test.dart', 'void main() {}\n');
    assert.equal(spawnSync('git', ['add', '.'], { cwd: root }).status, 0);
    const commit = spawnSync('git', ['commit', '--quiet', '-m', 'baseline'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
    assert.equal(commit.status, 0, commit.stderr);
    write(root, 'test/widget_test.dart', 'void main() { testWidgets(); }\n');
    assert.equal(spawnSync('git', ['add', 'test/widget_test.dart'], { cwd: root }).status, 0);
    assert.deepEqual(changedDartFiles(root), ['test/widget_test.dart']);
  });
});

test('CLI returns failure and JSON diagnostics for violations', () => {
  withProject({}, (root) => {
    write(root, blocProduction, 'class LoginBloc {}\n');
    write(root, 'test/login_bloc_test.dart', `${blocImport}void main() {}\n`);
    const output = [];
    const errors = [];
    const code = run(['--project', root, '--file', 'test/login_bloc_test.dart', '--json'], {
      log: (message) => output.push(message),
      error: (message) => errors.push(message),
    });
    assert.equal(code, 1);
    assert.equal(output.length, 0);
    assert.equal(JSON.parse(errors.join('\n')).errors[0].code, 'TEST_PATH_NOT_MIRRORED');
  });
});
