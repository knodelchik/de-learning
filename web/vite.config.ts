import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const WEEKS = path.resolve(__dirname, '../weeks')
const WEEK_RE = /^\d{2}-[a-z0-9-]+$/i
const TASK_RE = /^\d{2}$/

function solutionPath(week: unknown, task: unknown): string | null {
  if (typeof week !== 'string' || typeof task !== 'string') return null
  if (!WEEK_RE.test(week) || !TASK_RE.test(task)) return null
  const dir = path.join(WEEKS, week)
  if (!fs.existsSync(path.join(dir, 'lesson.md'))) return null
  return path.join(dir, 'solutions', `task${task}.sql`)
}

function send(res: ServerResponse, code: number, body: string) {
  res.statusCode = code
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}

// Лише для `npm run dev`: читає/пише weeks/<week>/solutions/taskNN.sql
function solutionsPlugin(): Plugin {
  return {
    name: 'de-solutions',
    configureServer(server) {
      server.middlewares.use('/__save', (req: IncomingMessage, res, next) => {
        if (req.method !== 'POST') return next()
        let raw = ''
        req.on('data', (c) => {
          raw += c
          if (raw.length > 1_000_000) req.destroy()
        })
        req.on('end', () => {
          try {
            const { week, task, sql } = JSON.parse(raw)
            const file = solutionPath(week, task)
            if (!file || typeof sql !== 'string') return send(res, 400, 'bad request')
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, sql.endsWith('\n') ? sql : sql + '\n')
            send(res, 200, path.relative(path.resolve(__dirname, '..'), file))
          } catch {
            send(res, 400, 'bad request')
          }
        })
      })
      server.middlewares.use('/__load', (req, res, next) => {
        if (req.method !== 'GET') return next()
        const url = new URL(req.url ?? '', 'http://x')
        const file = solutionPath(url.searchParams.get('week'), url.searchParams.get('task'))
        if (!file) return send(res, 400, 'bad request')
        if (!fs.existsSync(file)) return send(res, 204, '')
        send(res, 200, fs.readFileSync(file, 'utf8'))
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), solutionsPlugin()],
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
})
