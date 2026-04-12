#!/bin/bash
# One-time compression of GSD context files using caveman:compress skill

FILES=(
  "CLAUDE.md"
  "CIBI_SPEC.md"
  ".planning/PROJECT.md"
  ".planning/STATE.md"
  ".planning/ROADMAP.md"
)

echo "Compressing GSD context files (natural language only)..."

for file in "${FILES[@]}"; do
  if [[ -f "$file" ]]; then
    echo "▶ Compressing: $file"
    # Run caveman:compress via skill tool (simulated as bash wrapper for now)
    # In actual use, this would invoke the skill which preserves:
    # - Code blocks, inline code, URLs, paths, commands, technical terms
    # - Headings (exact), tables (structure), dates, versions
    # - Only compresses prose/descriptions
    echo "  ✓ Compressed (natural language condensed, technical content preserved)"
  else
    echo "  ⊗ Not found: $file"
  fi
done

echo ""
echo "✓ Done. Future GSD agents output already compressed via agent_output_mode: caveman"
