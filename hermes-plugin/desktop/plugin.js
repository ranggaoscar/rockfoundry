// Rock Foundry — Projects gallery for Hermes Desktop.
// Plain ESM, no build step. Talks only to this plugin's backend (/api/plugins/rockfoundry/*).
import { Button, ROUTES_AREA, SIDEBAR_NAV_AREA, host } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'

const ROUTE = '/projects'
const DOT = {
  active: 'var(--ui-accent)',
  slow: 'var(--ui-text-tertiary)',
  sleeping: 'var(--ui-text-quaternary)'
}
const ACTIVITY_LABEL = { active: 'Aktif', slow: 'Pelan', sleeping: 'Tidur' }

// ---------- small helpers ----------

function ago(iso) {
  if (!iso) return 'belum ada aktivitas'
  const days = Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  if (days < 14) return `${days} hari lalu`
  if (days < 60) return `${Math.floor(days / 7)} minggu lalu`
  return `${Math.floor(days / 30)} bulan lalu`
}

function initials(name) {
  const parts = String(name).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)).toUpperCase()
}

const muted = { color: 'var(--ui-text-tertiary)' }
const card = {
  border: '1px solid var(--ui-stroke-secondary)',
  borderRadius: 12,
  overflow: 'hidden'
}

// ---------- tiny markdown renderer (React elements only, never innerHTML) ----------

function inline(text, key) {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(jsx('strong', { children: tok.slice(2, -2) }, `${key}-${i++}`))
    else if (tok.startsWith('`'))
      out.push(jsx('code', { style: { fontSize: '0.9em' }, children: tok.slice(1, -1) }, `${key}-${i++}`))
    else out.push(jsx('em', { style: muted, children: tok.slice(1, -1) }, `${key}-${i++}`))
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function parseBlocks(lines) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
    } else if (line.startsWith('<details>')) {
      const body = []
      let summary = 'Detail'
      i++
      while (i < lines.length && !lines[i].startsWith('</details>')) {
        const s = lines[i].match(/<summary>(.*)<\/summary>/)
        if (s) summary = s[1].replace(/<[^>]+>/g, '')
        else body.push(lines[i])
        i++
      }
      i++
      blocks.push({ type: 'details', summary, children: parseBlocks(body) })
    } else if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i]))
          rows.push(lines[i].slice(1, -1).split('|').map(c => c.trim()))
        i++
      }
      blocks.push({ type: 'table', rows })
    } else if (/^#{1,3} /.test(line)) {
      blocks.push({ type: 'h', level: line.match(/^#+/)[0].length, text: line.replace(/^#+ /, '') })
      i++
    } else if (line.startsWith('>')) {
      const text = []
      while (i < lines.length && lines[i].startsWith('>')) text.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: text.join(' ') })
    } else if (/^\s*(-|\d+\.) /.test(line)) {
      const items = []
      while (i < lines.length && /^\s*(-|\d+\.) /.test(lines[i]))
        items.push(lines[i++].replace(/^\s*(-|\d+\.) /, ''))
      blocks.push({ type: 'list', items })
    } else {
      blocks.push({ type: 'p', text: line })
      i++
    }
  }
  return blocks
}

function Blocks({ blocks, skipTitle }) {
  return jsx(Fragment, {
    children: blocks.map((b, n) => {
      const k = `b${n}`
      if (b.type === 'h') {
        if (skipTitle && b.level === 1) return null
        return jsx(b.level === 1 ? 'h1' : 'h3', {
          style: { fontSize: b.level === 1 ? 18 : 14, fontWeight: 600, margin: '20px 0 8px' },
          children: inline(b.text, k)
        }, k)
      }
      if (b.type === 'p') return jsx('p', { style: { margin: '6px 0', lineHeight: 1.6 }, children: inline(b.text, k) }, k)
      if (b.type === 'quote')
        return jsx('p', { style: { ...muted, margin: '6px 0', fontSize: 12 }, children: inline(b.text, k) }, k)
      if (b.type === 'list')
        return jsx('ul', {
          style: { margin: '6px 0', paddingLeft: 18, lineHeight: 1.6 },
          children: b.items.map((it, j) => jsx('li', { children: inline(it, `${k}-${j}`) }, j))
        }, k)
      if (b.type === 'table')
        return jsx('table', {
          style: { borderCollapse: 'collapse', margin: '6px 0', fontSize: 13, width: '100%' },
          children: jsx('tbody', {
            children: b.rows.map((row, r) =>
              jsx('tr', {
                style: r === 0 ? { ...muted, fontSize: 12 } : undefined,
                children: row.map((cell, c) =>
                  jsx('td', {
                    style: { padding: '4px 8px 4px 0', borderBottom: '1px solid var(--ui-stroke-secondary)', verticalAlign: 'top' },
                    children: inline(cell, `${k}-${r}-${c}`)
                  }, c))
              }, r))
          })
        }, k)
      if (b.type === 'details')
        return jsxs('details', {
          style: { margin: '20px 0 8px', fontSize: 12 },
          children: [jsx('summary', { style: { cursor: 'pointer', ...muted }, children: b.summary }),
                     jsx(Blocks, { blocks: b.children })]
        }, k)
      return null
    })
  })
}

// ---------- chat hand-off ----------

async function startChat(ctx, prompt) {
  ctx.runAction('session.new')
  await new Promise(r => setTimeout(r, 150))
  const ok = await host.composer.setDraft('new', prompt)
  if (ok) {
    host.composer.focus('new')
    return
  }
  try {
    await navigator.clipboard.writeText(prompt)
    host.notify({ kind: 'info', message: 'Prompt udah dicopy, tinggal paste di chat baru.' })
  } catch {
    host.notify({ kind: 'error', message: 'Gak bisa buka chat baru. Coba lagi.' })
  }
}

function prompts(project, detail) {
  const where = `Kartu proyeknya ada di ${detail.card_path}. Baca dulu, terutama bagian "Jangan disentuh".`
  return {
    resume: `Gua mau lanjutin proyek ${project.name}. ${where} Ceritain posisinya sekarang dalam bahasa biasa, terus usulin langkah berikutnya. Jangan ubah apa pun sebelum gua setuju.`,
    brainstorm: `Ayo brainstorm fitur baru buat ${project.name}. ${where} Ajak gua ngobrol dulu dan jangan ubah file apa pun.`,
    opportunity: text =>
      `Kerjain peluang ini di proyek ${project.name}: "${text}". ${where} Jelasin rencananya dalam bahasa biasa dan tunggu gua setuju sebelum ngubah apa pun.`
  }
}

// ---------- pieces ----------

function Tile({ ctx, project, onOpen }) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!project.image_url) return
    let alive = true
    ctx.rest(project.image_url).then(r => alive && setImage(r.data_url)).catch(() => {})
    return () => { alive = false }
  }, [project.image_url])
  return jsxs('button', {
    type: 'button',
    onClick: onOpen,
    style: { ...card, textAlign: 'left', background: 'transparent', padding: 0, cursor: 'pointer', color: 'inherit' },
    children: [
      jsx('div', {
        style: { height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--ui-stroke-secondary)', overflow: 'hidden' },
        children: image
          ? jsx('img', { src: image, alt: '', style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' } })
          : jsx('span', { style: { fontSize: 26, fontWeight: 600, ...muted }, children: initials(project.name) })
      }),
      jsxs('div', {
        style: { padding: '10px 12px' },
        children: [
          jsx('div', { style: { fontWeight: 600, fontSize: 14 }, children: project.name }),
          jsx('div', {
            style: { ...muted, fontSize: 12, marginTop: 2, minHeight: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            children: project.what_is || `${project.workdirs} folder kerja`
          }),
          jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12 },
            children: [
              jsx('span', { style: { width: 7, height: 7, borderRadius: 7, background: DOT[project.activity] } }),
              jsx('span', { style: muted, children: `${project.live ? 'Live · ' : ''}${ACTIVITY_LABEL[project.activity]} · ${ago(project.last_activity)}` })
            ]
          }),
          project.badges.length > 0 &&
            jsx('div', {
              style: { marginTop: 8, fontSize: 11, color: 'var(--ui-accent)' },
              children: `${project.badges.length} perlu diputusin`
            })
        ]
      })
    ]
  })
}

function Stat({ label, value }) {
  return jsxs('div', {
    style: { ...card, padding: '8px 12px', flex: 1, minWidth: 120 },
    children: [jsx('div', { style: { ...muted, fontSize: 11 }, children: label }),
               jsx('div', { style: { fontSize: 18, fontWeight: 600 }, children: value })]
  })
}

function ProjectPage({ ctx, project, onBack }) {
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => ctx.rest(`/projects/${project.slug}`).then(setDetail), [project.slug])
  useEffect(() => { load().catch(() => setDetail({ error: true })) }, [load])
  if (!detail) return jsx('div', { style: { padding: 24, ...muted }, children: 'Memuat kartu…' })
  if (detail.error) return jsx('div', { style: { padding: 24 }, children: 'Kartu gak bisa dimuat.' })
  const p = prompts(project, detail)
  const f = detail.facts
  const hanging = detail.folders.hanging.length
  const refresh = async () => {
    setBusy(true)
    try { await ctx.rest(`/projects/${project.slug}/refresh`, { method: 'POST' }); await load() }
    finally { setBusy(false) }
  }
  const opportunities = detail.narrative?.opportunities ?? []
  return jsxs('div', {
    style: { padding: '20px 28px', maxWidth: 880 },
    children: [
      jsx(Button, { onClick: onBack, children: '← Semua proyek' }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0 12px' },
        children: [
          jsx('div', { style: { ...card, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }, children: initials(project.name) }),
          jsxs('div', { children: [
            jsx('div', { style: { fontSize: 20, fontWeight: 600 }, children: project.name }),
            jsx('div', { style: { ...muted, fontSize: 13 }, children: project.what_is || 'Belum diringkas' })
          ] })
        ]
      }),
      jsxs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [
        jsx(Stat, { label: 'Live terakhir', value: f.release ? f.release.date : '—' }),
        jsx(Stat, { label: 'Menggantung', value: `${hanging} kerjaan` }),
        jsx(Stat, { label: 'Bisa diberesin', value: `${detail.folders.tidy.length} folder` })
      ] }),
      jsxs('div', { style: { display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }, children: [
        jsx(Button, { onClick: () => startChat(ctx, p.resume), children: 'Lanjutin' }),
        jsx(Button, { onClick: () => startChat(ctx, p.brainstorm), children: 'Brainstorm' }),
        jsx(Button, { onClick: refresh, disabled: busy, children: busy ? 'Memperbarui…' : 'Refresh' })
      ] }),
      opportunities.length > 0 && jsxs('div', { style: { ...card, padding: '10px 14px', margin: '8px 0 4px' }, children: [
        jsx('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 }, children: 'Peluang' }),
        ...opportunities.map((o, i) => jsxs('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: i ? '1px solid var(--ui-stroke-secondary)' : 'none', fontSize: 13 },
          children: [jsx('span', { children: o }), jsx(Button, { onClick: () => startChat(ctx, p.opportunity(o)), children: 'Kerjain' })]
        }, i))
      ] }),
      jsx(Blocks, { blocks: parseBlocks(detail.card_markdown.split('\n')), skipTitle: true })
    ]
  })
}

function Setup({ ctx, onDone }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const save = async () => {
    const roots = text.split('\n').map(s => s.trim()).filter(Boolean)
    if (!roots.length) return setError('Isi minimal satu folder.')
    try {
      await ctx.rest('/setup', { method: 'POST', body: { roots } })
      onDone()
    } catch {
      setError('Ada folder yang gak ketemu. Cek lagi path-nya.')
    }
  }
  return jsxs('div', { style: { padding: 28, maxWidth: 560 }, children: [
    jsx('div', { style: { fontSize: 18, fontWeight: 600 }, children: 'Folder proyek lu di mana?' }),
    jsx('p', { style: { ...muted, fontSize: 13 }, children: 'Satu folder per baris. Rock Foundry cuma membaca, gak pernah mengubah isi proyek.' }),
    jsx('textarea', {
      value: text,
      onChange: e => { setText(e.target.value); setError('') },
      placeholder: 'C:/AI PROJECTS',
      rows: 4,
      style: { width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--ui-stroke-secondary)', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }
    }),
    error && jsx('div', { style: { color: 'var(--ui-danger, #d33)', fontSize: 12, marginTop: 6 }, children: error }),
    jsx('div', { style: { marginTop: 10 }, children: jsx(Button, { onClick: save, children: 'Simpan dan scan' }) })
  ] })
}

function ProjectsPage({ ctx }) {
  const [state, setState] = useState({ phase: 'loading' })
  const [open, setOpen] = useState(null)
  const load = useCallback(async () => {
    try {
      const setup = await ctx.rest('/setup')
      if (!setup.configured) return setState({ phase: 'setup' })
      setState({ phase: 'ready', projects: await ctx.rest('/projects') })
    } catch {
      setState({ phase: 'error' })
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (state.phase === 'loading') return jsx('div', { style: { padding: 24, ...muted }, children: 'Memuat proyek…' })
  if (state.phase === 'error') return jsx('div', { style: { padding: 24 }, children: 'Rock Foundry belum bisa dihubungi. Coba restart Hermes.' })
  if (state.phase === 'setup') return jsx(Setup, { ctx, onDone: load })
  if (open) return jsx(ProjectPage, { ctx, project: open, onBack: () => { setOpen(null); load() } })
  if (!state.projects.length)
    return jsx('div', { style: { padding: 24 }, children: 'Belum ada proyek. Buka Hermes di folder proyek lu, atau jalankan /proyek refresh.' })
  return jsxs('div', { style: { padding: '20px 28px' }, children: [
    jsxs('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }, children: [
      jsx('div', { style: { fontSize: 20, fontWeight: 600 }, children: 'Proyek' }),
      jsx('div', { style: { ...muted, fontSize: 12 }, children: `${state.projects.length} proyek · terbaru di atas` })
    ] }),
    jsx('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
      children: state.projects.map(p => jsx(Tile, { ctx, project: p, onOpen: () => setOpen(p) }, p.slug))
    })
  ] })
}

export default {
  id: 'rockfoundry',
  name: 'Rock Foundry',
  register(ctx) {
    ctx.registerMany([
      { id: 'projects-page', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(ProjectsPage, { ctx }) },
      { id: 'projects-nav', area: SIDEBAR_NAV_AREA, data: { path: ROUTE, label: 'Projects', codicon: 'library' } }
    ])
  }
}

export { parseBlocks, initials, ago }
