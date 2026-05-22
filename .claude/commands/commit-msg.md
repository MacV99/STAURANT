---
description: Generate a short English commit message for staged/unstaged changes
allowed-tools: [Bash]
---

Run `git diff HEAD` and `git status` to see all current changes (staged and unstaged).

Then output **only** a single commit message line in English, following conventional commits format (`type: short description`). No explanation, no bullet points, no extra text — just the message itself.

Rules:
- Max ~72 characters
- Lowercase after the colon
- Use present tense ("add", "fix", "improve", "remove", "update")
- Be specific about what changed, not how
- Common types: `feat`, `fix`, `style`, `refactor`, `chore`
