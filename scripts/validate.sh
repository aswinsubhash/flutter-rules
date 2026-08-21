#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

skill_path="$repo_root/src/flutter-rules/SKILL.md"
policy_path="$repo_root/src/flutter-rules/agents/openai.yaml"
review_schema="$repo_root/src/flutter-rules/schemas/review-report.schema.json"
review_renderer="$repo_root/src/flutter-rules/scripts/render-review-report.mjs"
test_policy_validator="$repo_root/src/flutter-rules/scripts/validate-test-policy.mjs"
skills_cli="$(cd "$repo_root" && node --input-type=module -e "import { resolveSkillsCliPath } from './lib/skills-manager.mjs'; process.stdout.write(resolveSkillsCliPath());")"

NO_COLOR=1 node "$skills_cli" add "$repo_root" --list >"$temporary_root/skills-list.txt"
grep -q 'Found 1 skill' "$temporary_root/skills-list.txt"
grep -q 'flutter-rules' "$temporary_root/skills-list.txt"
grep -q '^disable-model-invocation: true$' "$skill_path"
grep -q '^  allow_implicit_invocation: false$' "$policy_path"
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$review_schema"
node --check "$review_renderer"
node --check "$test_policy_validator"

standard_root="$temporary_root/standard"
standard_skill="$standard_root/flutter-rules"
mkdir -p "$standard_root"
cp -R "$repo_root/src/flutter-rules" "$standard_skill"
node --input-type=module - "$standard_skill/SKILL.md" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const [path] = process.argv.slice(2);
const lines = readFileSync(path, 'utf8').split('\n');
const output = [];
for (const line of lines) {
  if (!line.startsWith('disable-model-invocation:')) output.push(line);
}
writeFileSync(path, output.join('\n'));
NODE

for legacy in .agents .devin .claude-plugin plugins claude-plugins; do
  if [[ -e "$repo_root/$legacy" ]]; then
    echo "Legacy artifact must not be tracked: $legacy" >&2
    exit 1
  fi
done

if command -v skills-ref >/dev/null 2>&1; then
  skills-ref validate "$standard_skill"
elif command -v pipx >/dev/null 2>&1; then
  pipx run \
    --spec 'git+https://github.com/agentskills/agentskills.git@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref' \
    skills-ref validate "$standard_skill"
else
  echo "skills-ref and pipx not found; skipped the official Agent Skills validator."
fi

echo "All available validations passed."
