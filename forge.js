// Pure prompt-building helpers with no DOM, so node:test can check them.

export const FIELDS = [
  { key: 'role', label: 'Role', hint: 'Who the AI should act as. "A senior Python reviewer".' },
  { key: 'context', label: 'Context', hint: 'Background the AI needs: audience, goal, what you already tried.' },
  { key: 'task', label: 'Task', hint: 'What to do, starting with a verb. "Summarise", "Review", "Write".' },
  { key: 'input', label: 'Input', hint: 'The material to work on. Use {{name}} for parts you fill in later.' },
  { key: 'examples', label: 'Examples', hint: 'One or two examples of a good answer.' },
  { key: 'constraints', label: 'Rules', hint: 'One rule per line: length, what to include, what to leave out.' },
  { key: 'format', label: 'Output format', hint: 'What the answer looks like: bullet points, a table, JSON with these keys…' },
  { key: 'tone', label: 'Tone', hint: 'Friendly, formal, plain English for a beginner…' },
];

const TAGS = { context: 'context', task: 'task', input: 'input', examples: 'examples', constraints: 'rules', format: 'output_format', tone: 'tone' };
const ORDER = ['context', 'task', 'input', 'examples', 'constraints', 'format', 'tone'];
const HEAD = { context: 'Context', task: 'Task', input: 'Input', examples: 'Examples', constraints: 'Rules', format: 'Output format', tone: 'Tone' };

const clean = (s) => String(s ?? '').trim();
const rules = (s) => clean(s).split('\n').map((l) => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);

// style: 'tags' (XML-style tags, which Claude and GPT models follow well) or 'markdown' (headings).
export function assemble(spec, style = 'tags') {
  const out = [];
  const s = spec ?? {}; // avoid throwing on undefined/null
  const role = clean(s.role);
  if (role) out.push(/^you are\b/i.test(role) ? role : `You are ${role.replace(/^an? /i, (m) => m.toLowerCase()).replace(/\.$/, '')}.`);
  for (const key of ORDER) {
    const value = key === 'constraints' ? rules(s[key]).map((l) => `- ${l}`).join('\n') : clean(s[key]);
    if (!value) continue;
    out.push(style === 'markdown' ? `## ${HEAD[key]}\n${value}` : `<${TAGS[key]}>\n${value}\n</${TAGS[key]}>`);
  }
  return out.join('\n\n');
}

const VAR = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;
// Own keys only, so {{constructor}} is not "filled" by Object.prototype.
const filled = (values, name) => Object.hasOwn(values, name) && clean(values[name]) !== '';

export function findVars(text) {
  const t = String(text ?? '');
  return [...new Set([...t.matchAll(VAR)].map((m) => m[1]))];
}

export function fillVars(text, values) {
  const t = String(text ?? '');
  return t.replace(VAR, (m, name) => (filled(values, name) ? values[name] : m));
}

// Rough count: about 4 characters per token for English text.
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4);

const VAGUE = /\b(etc|some|good|nice|stuff|things|maybe|properly|appropriate|various)\b/gi;

// Rule-based checks. level 'fix' = the prompt will likely fail; 'tip' = it would get better.
export function lint(spec, values = {}) {
  const out = [];
  const s = spec ?? {};
  const task = clean(s.task), format = clean(s.format), cons = rules(s.constraints);
  if (!task) out.push({ level: 'fix', msg: 'Add a task: say what you want done.' });
  else if (task.split(/\s+/).length < 4) out.push({ level: 'tip', msg: 'The task is very short. Say what, for whom, and why.' });
  const vague = [...new Set([...`${task}\n${s.constraints ?? ''}\n${format}`.matchAll(VAGUE)].map((m) => m[0].toLowerCase()))];
  if (vague.length) out.push({ level: 'tip', msg: `Vague words: ${vague.join(', ')}. Say exactly what you mean.` });
  if (!format) out.push({ level: 'tip', msg: 'Say what the answer should look like: length, sections, a table or JSON.' });
  if (/json/i.test(format) && !clean(s.examples)) out.push({ level: 'tip', msg: 'Asking for JSON? Add an example with the exact keys.' });
  if (!/\d/.test(`${format}\n${s.constraints ?? ''}`)) out.push({ level: 'tip', msg: 'Give a size: a number of words, bullet points or sentences.' });
  const negative = cons.filter((l) => /^(don'?t|do not|never|avoid|no)\b/i.test(l));
  if (negative.length >= 2 && negative.length === cons.length) out.push({ level: 'tip', msg: 'Every rule says what not to do. Say what to do instead, too.' });
  const shouting = [...new Set(assemble(s).match(/\b[A-Z]{4,}\b/g) || [])].filter((w) => w !== 'JSON' && w !== 'HTML');
  if (shouting.length) out.push({ level: 'tip', msg: `Capitals (${shouting.join(', ')}) rarely help. Explain why the rule matters instead.` });
  const missing = findVars(assemble(s)).filter((v) => !filled(values, v));
  if (missing.length) out.push({ level: 'fix', msg: `Fill in: ${missing.map((v) => `{{${v}}}`).join(', ')}.` });
  if (estimateTokens(assemble(s)) > 6000) out.push({ level: 'tip', msg: 'Over about 6,000 tokens. Cut what the AI does not need.' });
  return out;
}

export const score = (issues) => Math.max(0, 100 - (issues ?? []).reduce((n, i) => n + (i.level === 'fix' ? 25 : 8), 0));

// Share links carry the prompt in the URL hash (base64url of UTF-8 JSON). Only known text fields come back.
export function encodeSpec(spec) {
  let s = '';
  for (const b of new TextEncoder().encode(JSON.stringify(spec))) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSpec(str) {
  try {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return pickSpec(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
  } catch {
    return null;
  }
}

// Longest text a part may have when it is read back (share links, imported files). Longer parts are cut.
export const MAX_PART = 20000;

// Keeps only the known text fields of untrusted input (share links, imported files).
export const pickSpec = (raw) =>
  Object.fromEntries(FIELDS.map((f) => [f.key, typeof raw?.[f.key] === 'string' ? raw[f.key].slice(0, MAX_PART) : '']));

// Labels of the parts that would be cut in a share link.
export const overLimit = (spec) => FIELDS.filter((f) => String(spec?.[f.key] ?? '').length > MAX_PART).map((f) => f.label);

export const TEMPLATES = [
  {
    name: 'Summarise an article',
    spec: {
      role: 'an editor who writes short, clear summaries',
      context: 'I am a student and need the main ideas quickly before class.',
      task: 'Summarise the article below for a first-year college student.',
      input: '{{article}}',
      constraints: 'Use plain English\nKeep every number and name from the article that matters\nEnd with one question the article leaves open',
      format: '5 bullet points, each under 25 words.',
      tone: 'Neutral and clear.',
    },
  },
  {
    name: 'Review my code',
    spec: {
      role: 'a senior {{language}} developer doing a code review',
      context: 'This code goes to production next week. I care most about bugs, then readability.',
      task: 'Review the code below and list the problems you find, most serious first.',
      input: '{{code}}',
      constraints: 'Quote the exact line for each problem\nSuggest a fix in code for each problem\nSkip style nits that a formatter would fix',
      format: 'A numbered list with at most 8 items. Each item: problem, why it matters, fix.',
      tone: 'Direct and specific.',
    },
  },
  {
    name: 'Reply to an email',
    spec: {
      role: 'my assistant who writes polite, short emails',
      context: 'I received the email below from {{sender}}.',
      task: 'Write a reply that {{goal}}.',
      input: '{{email}}',
      constraints: 'Keep it under 120 words\nAnswer every question in the email\nSign off with my name, {{my_name}}',
      format: 'The email text only, with a subject line first.',
      tone: 'Warm and professional.',
    },
  },
  {
    name: 'Interview practice questions',
    spec: {
      role: 'an interviewer hiring for a {{job_title}} role',
      context: 'I am a fresher preparing for interviews in India. My strongest skills are {{skills}}.',
      task: 'Write interview questions I should practise, with what a strong answer covers.',
      constraints: 'Mix technical and behavioural questions\nOrder them from easy to hard',
      format: 'A table with 8 rows and columns: Question, What a strong answer covers.',
      tone: 'Encouraging.',
    },
  },
  {
    name: 'Extract data as JSON',
    spec: {
      role: 'a careful data-entry assistant',
      task: 'Extract every invoice from the text below.',
      input: '{{text}}',
      examples: '[{"invoice_no": "INV-104", "date": "2026-03-01", "total": 2499.00, "currency": "INR"}]',
      constraints: 'Use null when a value is missing\nWrite dates as YYYY-MM-DD\nOutput only the JSON',
      format: 'A JSON array of objects with keys invoice_no, date, total, currency. Return at most 50 objects.',
    },
  },
];
