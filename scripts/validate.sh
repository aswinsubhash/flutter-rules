#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

python3 -m json.tool "$repo_root/.agents/plugins/marketplace.json" >/dev/null
python3 -m json.tool "$repo_root/plugins/flutter-rules/.codex-plugin/plugin.json" >/dev/null
python3 -m json.tool "$repo_root/.claude-plugin/marketplace.json" >/dev/null
python3 -m json.tool "$repo_root/claude-plugins/flutter-rules/.claude-plugin/plugin.json" >/dev/null

"$script_dir/sync-plugin-skills.sh" --check
"$script_dir/build-packages.sh" "$temporary_root/dist"

grep -q '^disable-model-invocation: true$' "$temporary_root/dist/claude/flutter-rules/SKILL.md"
grep -q '^disable-model-invocation: true$' "$temporary_root/dist/cursor/flutter-rules/SKILL.md"
grep -q '^triggers: \["user"\]$' "$temporary_root/dist/cursor/flutter-rules/SKILL.md"
grep -q '^disable-model-invocation: true$' "$temporary_root/dist/devin/flutter-rules/SKILL.md"
grep -q '^triggers: \["user"\]$' "$temporary_root/dist/devin/flutter-rules/SKILL.md"
grep -q '^  allow_implicit_invocation: false$' "$temporary_root/dist/codex/flutter-rules/agents/openai.yaml"

if command -v skills-ref >/dev/null 2>&1; then
  skills-ref validate "$repo_root/src/flutter-rules"
elif command -v pipx >/dev/null 2>&1; then
  pipx run \
    --spec 'git+https://github.com/agentskills/agentskills.git#subdirectory=skills-ref' \
    skills-ref validate "$repo_root/src/flutter-rules"
else
  echo "skills-ref and pipx not found; skipped the official Agent Skills validator."
fi

plugin_validator="${FLUTTER_RULES_CODEX_PLUGIN_VALIDATOR:-$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py}"
validator_python="${FLUTTER_RULES_VALIDATOR_PYTHON:-python3}"
if [[ -f "$plugin_validator" ]] && "$validator_python" -c 'import yaml' >/dev/null 2>&1; then
  "$validator_python" "$plugin_validator" "$repo_root/plugins/flutter-rules"
else
  echo "Codex plugin validator or PyYAML not found; skipped product-specific validation."
fi

if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$repo_root/claude-plugins/flutter-rules"
  claude plugin validate "$repo_root"
else
  echo "Claude CLI not found; skipped Claude plugin validation."
fi

echo "All available validations passed."
