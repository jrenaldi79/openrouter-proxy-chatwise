# Secret Scanning & Prevention

This document describes how the project prevents accidental commits of API keys and other secrets.

## Multi-Layer Secret Detection

### Layer 1: Local Pre-Commit Hook ✅

**Location:** `.git/hooks/pre-commit`

**When it runs:** Before every commit (locally)

**What it does:**
- Scans all staged files for hardcoded API keys
- Detects patterns:
  - OpenRouter: `sk-or-v1-[64-char-hex]`
  - Langfuse: `sk-lf-*`, `pk-lf-*`
  - Hardcoded Bearer tokens: `Bearer sk-or-v1-`
  - Hardcoded env vars: `OPENROUTER_TEST_API_KEY=sk-or-v1-...`
- Skips documentation files (can have examples)
- **Blocks commits** if secrets are found

**Example:**
```bash
$ git commit -m "Add test script"
🔍 Scanning for exposed secrets...
❌ SECURITY ALERT: Potential secret found in dev-tests/test.js
   Pattern: sk-or-v1-[a-zA-Z0-9]{64}
   Line 5: const API_KEY = 'sk-or-v1-abc123...';

⚠️  COMMIT BLOCKED: Exposed secrets detected!
```

**To bypass (NOT RECOMMENDED):**
```bash
git commit --no-verify -m "message"  # Only if absolutely sure!
```

### Layer 2: GitHub Actions Secret Scanning ✅

**Location:** `.github/workflows/test-and-deploy.yml`

**When it runs:** On every push to GitHub (before linting)

**What it does:**
- Double-checks for secrets that bypassed the pre-commit hook
- Fails the build if secrets are detected
- Provides clear error messages
- Runs on all branches

**If a secret reaches GitHub:**
```
🔍 Scanning for hardcoded secrets...
❌ SECURITY ALERT: Exposed secrets detected in commit!
```

### Layer 3: GitHub's Native Secret Scanning ✅

**Automatically enabled:** On all public repositories

**What it does:**
- Scans the entire repository history
- Detects known secret patterns
- **Alerts the repository maintainer** if secrets are found
- Can automatically revoke exposed credentials (for some providers)

**You'll see:** A notification on GitHub if secrets are detected

## For Development

### Setting API Keys Properly

**DO NOT DO THIS:** ❌
```javascript
// ❌ NEVER hardcode secrets
const API_KEY = 'sk-or-v1-abc123...';
```

**DO THIS INSTEAD:** ✅

**Option 1: Environment variable for one-off run**
```bash
OPENROUTER_TEST_API_KEY="sk-or-v1-..." node dev-tests/test-script.js
```

**Option 2: Export for multiple scripts**
```bash
export OPENROUTER_TEST_API_KEY="sk-or-v1-..."
node dev-tests/script1.js
node dev-tests/script2.js
unset OPENROUTER_TEST_API_KEY
```

**Option 3: Create .env.local (gitignored)**
```bash
# .env.local (never committed)
OPENROUTER_TEST_API_KEY=sk-or-v1-...
WANDB_API_KEY=...
LANGFUSE_SECRET_KEY=...
```

Then in scripts:
```javascript
const apiKey = process.env.OPENROUTER_TEST_API_KEY || 'fallback-for-testing';
```

### In Code

**All scripts should use:**
```javascript
// Good - uses env var with fallback for development
const API_KEY = process.env.OPENROUTER_TEST_API_KEY || 'sk-or-v1-your-test-key-here';

// Or with error if not set
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;
if (!API_KEY) {
  throw new Error('OPENROUTER_TEST_API_KEY environment variable is required');
}
```

## What Triggers the Hook

The pre-commit hook looks for these patterns (in non-documentation files):

| Pattern | Purpose | Example |
|---------|---------|---------|
| `sk-or-v1-[a-zA-Z0-9]{64}` | OpenRouter API keys | `sk-or-v1-abc123...xyz` |
| `sk-lf-[a-zA-Z0-9]{32}` | Langfuse secret keys | `sk-lf-abc123...xyz` |
| `pk-lf-[a-zA-Z0-9]{32}` | Langfuse public keys | `pk-lf-abc123...xyz` |
| `Bearer sk-or-v1-` | Hardcoded Bearer tokens | `Bearer sk-or-v1-...` |
| `OPENROUTER_TEST_API_KEY.*=.*sk-or` | Hardcoded env var | `OPENROUTER_TEST_API_KEY=sk-or-v1-...` |
| `WANDB_API_KEY.*=.*` | Weights & Biases keys | `WANDB_API_KEY=...` |

## Incident Response

If you accidentally commit a secret:

### Short-term (Immediate)
1. The pre-commit hook would have blocked it locally ✅
2. If it somehow reached GitHub, GitHub Actions will catch it
3. Review the error message and fix the issue

### Long-term (After Incident)
1. **Rotate the exposed key** immediately (contact the service provider)
2. Remove it from git history:
   ```bash
   git filter-branch --tree-filter 'sed -i "" "s/sk-or-v1-old-key/sk-or-v1-new-key/g" *'
   git push --force-with-lease origin master
   ```
3. Review audit logs for unauthorized access

## References

- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [Pre-commit Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## Questions?

If you're unsure whether something is a secret:
- **API Keys** → Secret ✅ Use env vars
- **Auth tokens** → Secret ✅ Use env vars
- **Database passwords** → Secret ✅ Use env vars
- **Public URLs** → Not a secret ❌
- **Configuration values** → Usually not secret ❌

**When in doubt, treat it as a secret.**
