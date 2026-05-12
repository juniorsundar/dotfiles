---
name: ask-user-question
description: Ask the user one targeted clarifying question and wait for an answer. Use when progress depends on user input, especially for single-choice or multiple-choice decisions with explicit options.
---

# Ask User Question

Use this skill when you need a specific decision or missing fact from the user before continuing.

## Preferred interactive flow

If the `ask_user_question` tool is available, use it instead of writing a plain-text question. It opens an interactive Pi UI and waits for the user's answer.

When using the tool:

- Ask exactly one question per tool call.
- Keep `question` short and do **not** include the option list in the question text.
- Put choices only in `options` for `single` and `multiple` questions.
- Use `why` for a brief reason, not for repeating choices.
- Use `recommended` for defaults or suggested choices.
- Stop after calling the tool and wait for the answer.

Examples:

```json
{
  "type": "single",
  "question": "Where should I install this skill?",
  "why": "The location controls whether it is available globally or only in this project.",
  "options": ["Global", "Project-local", "Temporary"],
  "recommended": ["Global"]
}
```

```json
{
  "type": "multiple",
  "question": "Which tool calls should require confirmation?",
  "why": "This controls what the permission extension blocks until approved.",
  "options": ["edit", "write", "bash", "read"],
  "recommended": ["edit", "write", "bash"]
}
```

Only fall back to the Markdown formats below when the interactive tool is unavailable.

## Core rules

1. Ask exactly one question at a time.
2. Make the question concrete and answerable.
3. Prefer options when the expected answer space is known.
4. Do not ask for information you can safely discover with available tools.
5. Do not continue work after asking; wait for the user's answer.

## Plain-text fallback formats

### Free-form

```markdown
Question: <one concise question>
Why I need this: <one short reason>
Expected answer: <format or example>
```

### Single selection

```markdown
Question: <one concise question>
Why I need this: <one short reason>
Choose one:
1. <option> — <brief consequence>
2. <option> — <brief consequence>
3. <option> — <brief consequence>
Recommended: <number or label>

Reply with the option number or label.
```

### Multiple selection

```markdown
Question: <one concise question>
Why I need this: <one short reason>
Choose any that apply:
1. <option> — <brief consequence>
2. <option> — <brief consequence>
3. <option> — <brief consequence>
Recommended: <numbers or labels, or "none">

Reply with comma-separated option numbers or labels, or "none".
```

## Handling answers

- Accept numbers, labels, or short natural-language answers.
- If the answer is ambiguous, ask one follow-up question using this same skill.
- If the user chooses a recommended/default option by saying "yes", "ok", "default", or similar, proceed with the recommended option.
- Briefly restate the interpreted answer before acting when the choice has meaningful consequences.

## When running as a subagent

If you are a subagent that cannot directly call `ask_user_question`, emit this block and stop:

```markdown
ASK_USER_QUESTION
Type: single | multiple | free-form
Question: <one concise question; no embedded option list>
Why I need this: <one short reason>
Options:
1. <option> — <brief consequence>
2. <option> — <brief consequence>
Recommended: <number(s), label(s), or none>
Expected answer: <format>
END_ASK_USER_QUESTION
```

The parent/orchestrating agent should forward the question to the user, wait for the answer, then resume the subagent or continue the task with the answer.
