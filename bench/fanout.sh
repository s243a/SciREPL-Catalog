#!/bin/bash
# Pass 2 locale fan-out: 11 workbooks x 11 locales. Resumable (skips jobs
# with existing evidence). Failed jobs get their staged file restored.
# Greens commit per locale.
SD="$(dirname "$0")"
cd /home/s243a/Projects/SciREPL-Catalog || exit 1
WBS="lua-tables-coroutines.srwb lua-parsing-coroutines.srwb typr-intro.srwb r_ggplot2_showcase.ipynb r_tidyverse_wrangling.ipynb life_expectancy_csv_demo.ipynb r_statistics.ipynb prolog-generates-lua.srwb prolog-generates-r.srwb prolog-generates-typr.srwb prolog-generates-clojurescript.srwb"
for loc in de fr pt-BR id ru ja zh ko hi bn ar; do
  echo "########## LOCALE $loc ##########"
  green=0; fail=0
  for wb in $WBS; do
    base="${wb%.*}"
    [ "$base" = "r_statistics" ] && [ "$loc" = "es" ] && continue
    if [ -f ".pilot/$base-$loc/span-manifest.derived.json" ]; then
      echo "[$base/$loc] already done — skip"; continue
    fi
    echo "--- $base / $loc ---"
    if node "$SD/run-translation.mjs" "$wb" "$loc" 2>&1 | grep -E '^\[|GREEN|giving' | grep -v drive | tail -6; then :; fi
    if [ -f ".pilot/$base-$loc/span-manifest.derived.json" ]; then
      green=$((green+1))
    else
      fail=$((fail+1))
      git checkout -- "workbooks/$loc/$wb" 2>/dev/null
      echo "[$base/$loc] FAILED — workbook restored"
    fi
  done
  echo "locale $loc: $green green, $fail failed"
  if [ "$green" -gt 0 ]; then
    git add -A
    git commit -q -m "Pass 2 $loc: $green workbook(s) fully translated, runtime-verified

Batch fan-out via run-translation driver (draft+review worker calls,
mechanical apply, derive/lint/bench x2/envelope/differential oracle).
Failed jobs restored to round-one state; evidence in .pilot/<wb>-$loc/.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ViSPjSKEFZyKAHty5DfWFT"
    git push origin pass2/workbooks 2>&1 | tail -1
  fi
done
echo "FANOUT COMPLETE"
