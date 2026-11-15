export type Status = 'none' | 'ok' | 'submitted'

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

export const getDraft = (week: string, task: string) => get(`de:draft:${week}:${task}`)
export const setDraft = (week: string, task: string, sql: string) => set(`de:draft:${week}:${task}`, sql)
export const getStatus = (week: string, task: string): Status => {
  const v = get(`de:status:${week}:${task}`)
  return v === 'ok' || v === 'submitted' ? v : 'none'
}
export const setStatus = (week: string, task: string, s: Status) => set(`de:status:${week}:${task}`, s)

// Локальне збереження рішення: у dev — файл weeks/<week>/solutions/taskNN.sql, інакше завантаження.
export async function loadSolution(week: string, task: string): Promise<string | null> {
  if (!import.meta.env.DEV) return null
  try {
    const r = await fetch(`/__load?week=${encodeURIComponent(week)}&task=${encodeURIComponent(task)}`)
    return r.status === 200 ? await r.text() : null
  } catch {
    return null
  }
}

export async function saveSolution(week: string, task: string, sql: string): Promise<string> {
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/__save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, task, sql }),
      })
      if (r.ok) return `Збережено: ${await r.text()}`
    } catch {
      /* fallthrough to download */
    }
  }
  const blob = new Blob([sql.endsWith('\n') ? sql : sql + '\n'], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `task${task}.sql`
  a.click()
  URL.revokeObjectURL(a.href)
  return `Завантажено task${task}.sql: поклади у weeks/${week}/solutions/`
}
