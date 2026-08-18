# GitHub repository metadata

Set these on https://github.com/ranggaoscar/rockfoundry/settings

## Description

```text
Local-first product discovery for AI builders. Find hidden decisions, score Decision Debt, and export anti-invention handoffs before coding agents invent your product.
```

## Website

```text
https://github.com/ranggaoscar/rockfoundry
```

## Topics

```text
product-discovery
decision-debt
local-first
open-source
byok
prd
brd
erd
coding-agents
agentic
typescript
nextjs
```

## About blurb (short)

```text
Before AI writes your code, make sure it isn't inventing your product.
```

## Social preview tip

When you have a clean local screenshot:

1. Landing empty state
2. CRM discovery question with options
3. Context drawer showing Decision Debt drop
4. DO_NOT_INVENT.md open in editor

Do not capture secrets, local usernames, or unrelated desktop chrome.

## Why manual

This environment has no GitHub API token / `gh` auth for metadata writes. Repo code + README are pushed; About/topics need one manual paste (or run with `gh auth` locally):

```bash
gh repo edit ranggaoscar/rockfoundry \
  --description "Local-first product discovery for AI builders. Find hidden decisions, score Decision Debt, and export anti-invention handoffs before coding agents invent your product." \
  --homepage "https://github.com/ranggaoscar/rockfoundry" \
  --add-topic product-discovery \
  --add-topic decision-debt \
  --add-topic local-first \
  --add-topic open-source \
  --add-topic byok \
  --add-topic prd \
  --add-topic brd \
  --add-topic erd \
  --add-topic coding-agents \
  --add-topic agentic
```
