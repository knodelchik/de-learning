import type { Check } from './check'

const md = import.meta.glob('../../weeks/*/{lesson,tasks}.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const checkFiles = import.meta.glob('../../weeks/*/checks.json', {
  import: 'default',
  eager: true,
}) as Record<string, Record<string, Check>>

export interface Task {
  id: string
  group: string
  body: string
}

export interface Week {
  id: string // 01-sql
  title: string
  lesson: string
  preamble: string
  tasks: Task[]
  submit: string
  checks: Record<string, Check>
}

const TASK_RE = /^\*\*(\d{2})\.\*\*/
const H2_RE = /^## /

function stripTrailingRule(lines: string[]): string {
  const out = [...lines]
  while (out.length && (out[out.length - 1].trim() === '' || out[out.length - 1].trim() === '---')) out.pop()
  return out.join('\n')
}

export function parseTasks(src: string): { preamble: string; tasks: Task[]; submit: string } {
  let lines = src.split('\n')
  let submit = ''
  const si = lines.findIndex((l) => l.startsWith('## Самоперевірка'))
  if (si >= 0) {
    submit = lines.slice(si).join('\n').trim()
    lines = lines.slice(0, si)
  }
  const first = lines.findIndex((l) => TASK_RE.test(l))
  if (first < 0) return { preamble: stripTrailingRule(lines), tasks: [], submit }

  // Останній `## ` перед першим завданням — це група, а не вступ.
  let preEnd = first
  for (let i = first - 1; i >= 0; i--) {
    if (H2_RE.test(lines[i])) {
      preEnd = i
      break
    }
  }
  const preamble = stripTrailingRule(lines.slice(0, preEnd))

  const tasks: Task[] = []
  let group = ''
  let cur: { id: string; group: string; lines: string[] } | null = null
  const flush = () => {
    if (cur) tasks.push({ id: cur.id, group: cur.group, body: stripTrailingRule(cur.lines) })
    cur = null
  }
  for (let i = preEnd; i < lines.length; i++) {
    const line = lines[i]
    const m = TASK_RE.exec(line)
    if (H2_RE.test(line)) {
      flush()
      group = line.replace(H2_RE, '').trim()
    } else if (m) {
      flush()
      cur = { id: m[1], group, lines: [line] }
    } else if (cur) {
      cur.lines.push(line)
    }
  }
  flush()
  return { preamble, tasks, submit }
}

function build(): Week[] {
  const ids = new Set<string>()
  for (const p of Object.keys(md)) ids.add(p.split('/').slice(-2)[0])
  const weeks: Week[] = []
  for (const id of [...ids].sort()) {
    const find = (name: string) => md[Object.keys(md).find((p) => p.endsWith(`/${id}/${name}.md`)) ?? ''] ?? ''
    const lesson = find('lesson')
    const parsed = parseTasks(find('tasks'))
    const ck = Object.keys(checkFiles).find((p) => p.endsWith(`/${id}/checks.json`))
    const title = (lesson.split('\n').find((l) => l.startsWith('# ')) ?? `# ${id}`).replace(/^# /, '').trim()
    weeks.push({ id, title, lesson, ...parsed, checks: ck ? checkFiles[ck] : {} })
  }
  return weeks
}

export const weeks = build()
