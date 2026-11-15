import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'

interface Props {
  value: string
  onChange: (v: string) => void
  onRun: () => void
}

export default function Editor({ value, onChange, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef({ onChange, onRun })
  cb.current = { onChange, onRun }

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const theme = new Compartment()
    const pick = () => (mq.matches ? oneDark : [])
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (cb.current.onRun(), true) }])),
          basicSetup,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          sql(),
          placeholder('-- Напиши SQL тут. Cmd/Ctrl+Enter, щоб виконати'),
          theme.of(pick()),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    const onMq = () => v.dispatch({ effects: theme.reconfigure(pick()) })
    mq.addEventListener('change', onMq)
    return () => {
      mq.removeEventListener('change', onMq)
      v.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Зовнішнє оновлення (завантажене рішення) без зациклення.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  return <div className="editor" ref={host} />
}
