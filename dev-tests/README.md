# Development Testing Scripts

This directory contains **manual testing scripts** for features under development. These are NOT automated tests and are NOT run as part of the CI/CD pipeline.

## Purpose

- **Ad-hoc testing** during feature development
- **Manual validation** of new functionality
- **Integration testing** with running dev server
- **Exploratory testing** scripts

## Usage

These scripts typically require:
1. A running development server (`npm run dev`)
2. Proper environment variables configured (`.env` file)
3. Manual execution via `node dev-tests/script-name.js`

## Current Scripts

### `test-weave-chat.js`
Tests Weave observability integration for LLM chat completions.

**Requirements:**
- Dev server running on port 3000
- `WANDB_API_KEY` and `WEAVE_PROJECT_NAME` set in `.env`
- `OPENROUTER_TEST_API_KEY` for real API calls

**Usage:**
```bash
npm run dev  # In one terminal
node dev-tests/test-weave-chat.js  # In another terminal
```

**What it tests:**
- Chat completion requests with Weave tracing enabled
- Proper input/output formatting in Weave traces
- Trace URLs logged to W&B portal

## Guidelines

**When to add scripts here:**
- Testing new features during development
- Manual validation that can't be easily automated
- Debugging specific scenarios
- Performance profiling during development

**When NOT to use this directory:**
- Automated tests → Use `tests/` directory
- Monitoring tests → Use `monitoring/tests/`
- Production validation → Use `scripts/`

## Cleanup

Scripts in this directory should either be:
1. **Converted to automated tests** in `tests/` once feature is stable
2. **Removed** if no longer needed after feature completion
3. **Kept** if useful for ongoing manual validation

Don't let this directory become a graveyard of outdated scripts!
