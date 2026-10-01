#!/usr/bin/env bash
# Fast e2e loop against an already-running QA app (scripts/qa.sh up): reseed the data, then run Playwright.
cd "$(dirname "$0")/.."
scripts/qa.sh reseed && E2E_EXTERNAL=1 npx playwright test "$@"
