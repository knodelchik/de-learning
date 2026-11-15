import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Editor from './Editor'
import { weeks, type Week, type Task } from './content'
import { getConn, runSql, runCheck, type QueryResult, MAX_ROWS } from './db'
import type { CheckResult } from './check'
import { getDraft, setDraft, getStatus, setStatus, loadSolution, saveSolution, type Status } from './store'

type Route = { week: string; page: 'lesson' | 'submit' | 'task'; task?: string }

function parseHash(): Route {
  const [, w, p, t] = window.location.hash.split('/')
  const week = weeks.find((x) => x.id === w) ?? weeks[0]
  if (!week) return { week: '', page: 'lesson' }
  if (p === 'task' && t && week.tasks.some((x) => x.id === t)) return { week: week.id, page: 'task', task: t }
  if (p === 'submit' && week.submit) return { week: week.id, page: 'submit' }
  return { week: week.id, page: 'lesson' }
}

const Md = ({ children }: { children: string }) => (
  <div className="md">
    <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
  </div>
)

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [dbState, setDbState] = useState<'loading' | 'ready' | string>('loading')
  const [, bump] = useState(0)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    getConn().then(
      () => setDbState('ready'),
      (e) => setDbState(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  const week = weeks.find((w) => w.id === route.week)
  if (!week) return <div className="empty">Немає жодного тижня в weeks/*/lesson.md</div>
  const task = route.task ? week.tasks.find((t) => t.id === route.task) : undefined

  return (
    <div className="layout">
      <Sidebar route={route} />
      <main className="content">
        {dbState === 'loading' && <div className="banner">Завантажую DuckDB і дані…</div>}
        {dbState !== 'loading' && dbState !== 'ready' && <div className="banner err">Помилка DuckDB: {dbState}</div>}
        {route.page === 'lesson' && <Md>{week.lesson}</Md>}
        {route.page === 'submit' && (
          <>
            <Md>{week.submit}</Md>
          </>
        )}
        {route.page === 'task' && task && (
          <TaskView key={`${week.id}/${task.id}`} week={week} task={task} ready={dbState === 'ready'} onStatus={() => bump((n) => n + 1)} />
        )}
      </main>
    </div>
  )
}

function Sidebar({ route }: { route: Route }) {
  return (
    <nav className="sidebar">
      <div className="brand">DE-курс · SQL</div>
      {weeks.map((w) => {
        const groups: { name: string; tasks: Task[] }[] = []
        for (const t of w.tasks) {
          const g = groups[groups.length - 1]
          if (g && g.name === t.group) g.tasks.push(t)
          else groups.push({ name: t.group, tasks: [t] })
        }
        const cur = w.id === route.week
        return (
          <div key={w.id} className="week">
            <a className={'week-title' + (cur && route.page === 'lesson' ? ' active' : '')} href={`#/${w.id}/lesson`}>
              {w.title}
            </a>
            <a className={'item' + (cur && route.page === 'lesson' ? ' active' : '')} href={`#/${w.id}/lesson`}>
              Урок
            </a>
            {groups.map((g) => (
              <div key={g.name}>
                {g.name && <div className="group">{g.name}</div>}
                {g.tasks.map((t) => {
                  const st = getStatus(w.id, t.id)
                  return (
                    <a
                      key={t.id}
                      className={'item' + (cur && route.task === t.id ? ' active' : '')}
                      href={`#/${w.id}/task/${t.id}`}
                    >
                      <span>Завдання {t.id}</span>
                      <span className="mark">{st === 'ok' ? '✅' : st === 'submitted' ? '●' : ''}</span>
                    </a>
                  )
                })}
              </div>
            ))}
            {w.submit && (
              <a className={'item' + (cur && route.page === 'submit' ? ' active' : '')} href={`#/${w.id}/submit`}>
                Здача
              </a>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function TaskView({ week, task, ready, onStatus }: { week: Week; task: Task; ready: boolean; onStatus: () => void }) {
  const ref = week.checks[task.id]
  const [sql, setSql] = useState(() => getDraft(week.id, task.id) ?? '')
  const [res, setRes] = useState<QueryResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [status, setSt] = useState<Status>(() => getStatus(week.id, task.id))
  const sqlRef = useRef(sql)
  sqlRef.current = sql

  useEffect(() => {
    if (getDraft(week.id, task.id) !== null) return
    loadSolution(week.id, task.id).then((s) => {
      if (s !== null && sqlRef.current === '') setSql(s)
    })
  }, [week.id, task.id])

  const change = (v: string) => {
    setSql(v)
    setDraft(week.id, task.id, v)
  }
  const updateStatus = (s: Status) => {
    setStatus(week.id, task.id, s)
    setSt(s)
    onStatus()
  }

  const run = useCallback(async () => {
    if (!ready || running) return
    setRunning(true)
    setErr(null)
    setCheck(null)
    setMsg('')
    try {
      const r = await runSql(sqlRef.current)
      setRes(r)
      if (ref) {
        try {
          const c = await runCheck(r.last, ref)
          setCheck(c)
          if (c.ok) updateStatus('ok')
          else if (status === 'ok') updateStatus('none')
        } catch (e) {
          setErr('Автоперевірка не змогла виконатися: ' + (e instanceof Error ? e.message : String(e)))
        }
      }
    } catch (e) {
      setRes(null)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, running, ref, status])

  const save = async () => {
    setMsg(await saveSolution(week.id, task.id, sql))
    if (status !== 'ok') updateStatus('submitted')
  }

  return (
    <>
      {week.preamble && (
        <details className="preamble">
          <summary>Умови / визначення</summary>
          <Md>{week.preamble}</Md>
        </details>
      )}
      <Md>{task.body}</Md>
      <Editor value={sql} onChange={change} onRun={run} />
      <div className="actions">
        <button className="primary" onClick={run} disabled={!ready || running}>
          {running ? 'Виконую…' : 'Виконати'}
        </button>
        <button onClick={save} disabled={!sql.trim()}>
          {import.meta.env.DEV ? 'Зберегти у solutions/' : 'Завантажити .sql'}
        </button>
        <span className="hint">Cmd/Ctrl+Enter</span>
        {msg && <span className="hint">{msg}</span>}
      </div>
      {!ref && <div className="note">Це завдання перевіряє ментор.</div>}
      {ref && !check && !res && !err && status === 'ok' && <div className="note ok">✅ Збігається з еталоном</div>}
      {check && (
        <div className={'note ' + (check.ok ? 'ok' : 'bad')}>
          {check.ok ? (
            '✅ Збігається з еталоном'
          ) : (
            <>
              ❌ Не збігається з еталоном.{' '}
              {!check.rowsOk && <>рядків: {check.rowCount}, очікується {check.expectedRows}. </>}
              {check.matched < check.total && (
                <>
                  збіглося колонок: {check.matched} з {check.total}.
                </>
              )}
            </>
          )}
        </div>
      )}
      {err && <pre className="error">{err}</pre>}
      {res && <ResultTable res={res} />}
    </>
  )
}

function ResultTable({ res }: { res: QueryResult }) {
  const numeric = (t: string) => /INT|DOUBLE|FLOAT|DECIMAL|REAL|Int|Float|Decimal/.test(t)
  return (
    <div className="result">
      <div className="meta">
        Рядків: {res.total}
        {res.total > MAX_ROWS && ` (показано ${MAX_ROWS})`} · {res.columns.length} кол. · {Math.round(res.ms)} мс
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {res.columns.map((c, i) => (
                <th key={i} className={numeric(c.type) ? 'num' : ''}>
                  {c.name}
                  <small>{c.type}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={numeric(res.columns[j].type) ? 'num' : ''}>
                    {v === null ? <span className="null">NULL</span> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
