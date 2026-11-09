# PromptForge

**Live:** https://promptforge-sooty-chi.vercel.app/

Build clear AI prompts from parts, in the browser. No account, nothing sent anywhere.

## What it does
- **Parts:** role, context, task, input, examples, rules, output format and tone. Empty parts are left out.
- **Two styles:** XML-style tags (`<task>…</task>`) or Markdown headings.
- **Variables:** write `{{name}}` anywhere; a box appears to fill it in. The preview shows the filled prompt.
- **Prompt check:** simple rules flag a missing task, vague words, no output format or size, JSON without an example, rules that only say "don't", capitals, unfilled variables and very long prompts. Score out of 100.
- **Templates:** summarise an article, review code, reply to an email, interview practice, extract JSON.
- **Keep and share:** copy, download `.md`, save to a library in this browser, export/import the library as JSON, and copy a share link (the prompt is in the URL after `#`, so it never reaches a server). Links are compressed with the browser's built-in `deflate-raw` and the copied message shows the link length. Links made by older versions still open.

## How it works
- `forge.js`: pure functions with no DOM: assemble, variables, token estimate (about 4 characters per token), the rules, share-link encoding.
- `app.js`: the page. Text goes in with `textContent`, never `innerHTML`. Share links and imported files keep only the known text fields.
- No framework, no build step, no dependencies.

![CI](https://github.com/surypratapsingh/promptforge/actions/workflows/ci.yml/badge.svg)

## Run and test
Node 18 or newer.

```bash
npm test
```

```bash
python -m http.server 8080
```

Then open http://127.0.0.1:8080.

## Limits
- The prompt check is a set of rules, not an AI. It cannot tell if the prompt is right for your task.
- The token count is an estimate; real tokenizers differ by model and language.
- The library lives in this browser's storage. Clearing site data deletes it, so export a copy.
