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

// The Projects page is a bright workbench: a cutting mat with paper project folders on it.
const DESK_CSS = `
.rf-desk { min-height: 100%; color: #1f2a24;
  background-color: #dde5d8;
  background-image:
    linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px),
    linear-gradient(rgba(80,105,88,.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(80,105,88,.10) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px; }
.rf-head { display:flex; align-items:baseline; justify-content:space-between; padding: 26px 32px 6px; }
.rf-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.rf-sub { font-size: 13px; color: #5d6b62; }
.rf-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 30px 26px; padding: 22px 32px 48px; }
.rf-card { position:relative; text-align:left; padding:0; border:0; cursor:pointer; color:inherit; font:inherit;
  background:#fffdf8; border-radius: 4px 14px 14px 14px;
  transform: rotate(var(--tilt)); transition: transform .18s ease, box-shadow .18s ease;
  box-shadow: 0 1px 1px rgba(31,42,36,.10), 0 3px 6px rgba(31,42,36,.08), 0 14px 28px -10px rgba(31,42,36,.30); }
.rf-card::before { content:""; position:absolute; top:-11px; left:0; width:46%; height:12px;
  background: var(--tab); border-radius: 6px 10px 0 0; }
.rf-card:hover, .rf-card:focus-visible { transform: rotate(0deg) translateY(-4px);
  box-shadow: 0 2px 2px rgba(31,42,36,.10), 0 8px 14px rgba(31,42,36,.10), 0 26px 40px -12px rgba(31,42,36,.38); outline: none; }
.rf-card:focus-visible { box-shadow: 0 0 0 3px #2f7d57, 0 26px 40px -12px rgba(31,42,36,.38); }
.rf-cover { height: 112px; margin: 10px 10px 0; border-radius: 9px; display:flex; align-items:center; justify-content:center; overflow:hidden; background: var(--cover); }
.rf-cover img { max-width: 70%; max-height: 72%; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,.18)); }
.rf-mono { font-size: 30px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
.rf-body { padding: 12px 14px 14px; }
.rf-name { font-size: 15px; font-weight: 700; line-height: 1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height: 2.5em; word-break: break-word; }
.rf-what { font-size: 12.5px; color:#5d6b62; margin-top: 3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-meta { display:flex; align-items:center; gap:7px; margin-top: 10px; font-size: 12px; color:#4b5850; }
.rf-dot { width:8px; height:8px; border-radius:8px; flex:none; }
.rf-live { font-size: 11px; font-weight: 700; color:#1d6b43; background:#d7f0e1; padding: 1px 7px; border-radius: 20px; }
.rf-note { position:absolute; top: 18px; right: -8px; transform: rotate(4deg);
  background:#ffe16a; color:#4a3b00; font-size: 11.5px; font-weight: 700; padding: 5px 9px 6px;
  box-shadow: 0 6px 10px -4px rgba(74,59,0,.45); }
.rf-page { padding-bottom: 56px; }
.rf-page-inner { max-width: 940px; margin: 0 auto; padding: 22px 32px 0; }
.rf-back { border:0; background: rgba(255,255,255,.65); color:#1f2a24; font: inherit; font-size: 13px; font-weight: 600;
  padding: 7px 12px; border-radius: 20px; cursor:pointer; box-shadow: 0 1px 2px rgba(31,42,36,.15); }
.rf-back:hover { background:#fff; }
.rf-sheet { position:relative; margin-top: 28px; background:#fffdf8; border-radius: 4px 16px 16px 16px; padding: 26px 34px 34px;
  --ui-text-tertiary:#5d6b62; --ui-stroke-secondary:#e7e0d2;
  box-shadow: 0 1px 1px rgba(31,42,36,.10), 0 4px 8px rgba(31,42,36,.08), 0 30px 50px -20px rgba(31,42,36,.35); }
.rf-sheet::before { content:""; position:absolute; top:-13px; left:0; width:34%; height:14px; background: var(--tab); border-radius: 6px 12px 0 0; }
.rf-sheet-head { display:flex; gap: 22px; align-items:center; }
.rf-sheet-cover { width: 112px; height: 112px; flex:none; border-radius: 14px; background: var(--cover); display:flex; align-items:center; justify-content:center; overflow:hidden; }
.rf-sheet-cover img { max-width: 72%; max-height: 72%; object-fit: contain; }
.rf-sheet .rf-title { font-size: 30px; overflow-wrap:anywhere; }
.rf-actions { display:flex; flex-wrap:wrap; gap: 8px; margin-top: 14px; }
.rf-btn { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor:pointer;
  background:#fff; color:#1f2a24; border: 1px solid #d9d2c3; box-shadow: 0 1px 0 rgba(31,42,36,.06); }
.rf-btn:hover { border-color:#b9b19f; }
.rf-btn:disabled { opacity:.6; cursor: default; }
.rf-btn-main { background:#1f5c41; color:#fff; border-color:#1f5c41; }
.rf-btn-main:hover { background:#174a34; }
.rf-btn:focus-visible, .rf-back:focus-visible { outline: 3px solid #2f7d57; outline-offset: 2px; }
.rf-stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 18px; margin: 28px 0 8px; }
.rf-stat { background:#f4f8f1; border-radius: 6px; padding: 12px 14px; transform: rotate(var(--tilt));
  box-shadow: 0 1px 1px rgba(31,42,36,.08), 0 8px 14px -8px rgba(31,42,36,.28); border-top: 3px solid var(--tab); }
.rf-stat-label { font-size: 12px; color:#5d6b62; }
.rf-stat-value { font-size: 20px; font-weight: 800; letter-spacing:-0.01em; margin-top: 2px; }
.rf-opps { margin: 26px 0 6px; background:#fff6c4; padding: 14px 18px 10px; border-radius: 3px; transform: rotate(-0.4deg);
  box-shadow: 0 10px 18px -10px rgba(74,59,0,.45); }
.rf-opps-title { margin: 0 0 6px; font-size: 15px; }
.rf-opp { display:flex; align-items:center; justify-content:space-between; gap: 12px; padding: 8px 0; border-top: 1px dashed rgba(74,59,0,.25); font-size: 14px; }
.rf-card-md { margin-top: 10px; font-size: 14.5px; line-height: 1.6; }
.rf-card-md h3 { font-size: 17px !important; font-weight: 800 !important; margin-top: 30px !important; padding-bottom: 4px; border-bottom: 3px solid var(--tab); display:inline-block; }
.rf-card-md table td { font-size: 13.5px; }
.rf-card-md table td:first-child { white-space: nowrap; }
.rf-card-md code { background:#f1ece1; padding: 1px 5px; border-radius: 4px; }
@media (max-width: 640px) { .rf-sheet { padding: 20px; } .rf-sheet-head { flex-direction: column; align-items:flex-start; } }
@media (prefers-reduced-motion: reduce) { .rf-card { transition:none; } }
`
const TILTS = ['-0.7deg', '0.5deg', '-0.25deg', '0.8deg', '-0.5deg', '0.3deg']

function hueOf(name) {
  let h = 0
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function Tile({ ctx, project, index, onOpen }) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!project.image_url) return
    let alive = true
    ctx.rest(project.image_url).then(r => alive && setImage(r.data_url)).catch(() => {})
    return () => { alive = false }
  }, [project.image_url])
  const hue = hueOf(project.name)
  const status = `${ACTIVITY_LABEL[project.activity]} · ${ago(project.last_activity)}`
  return jsxs('button', {
    type: 'button',
    className: 'rf-card',
    onClick: onOpen,
    'aria-label': `${project.name}, ${status}`,
    style: {
      '--tilt': TILTS[index % TILTS.length],
      '--tab': `hsl(${hue} 45% 62%)`,
      '--cover': image ? `hsl(${hue} 30% 94%)` : `hsl(${hue} 55% 86%)`,
      '--ink': `hsl(${hue} 45% 28%)`
    },
    children: [
      jsx('div', {
        className: 'rf-cover',
        children: image
          ? jsx('img', { src: image, alt: '' })
          : jsx('span', { className: 'rf-mono', children: initials(project.name) })
      }),
      jsxs('div', {
        className: 'rf-body',
        children: [
          jsx('div', { className: 'rf-name', children: project.name }),
          jsx('div', { className: 'rf-what', children: project.what_is || `${project.workdirs} folder kerja` }),
          jsxs('div', {
            className: 'rf-meta',
            children: [
              jsx('span', { className: 'rf-dot', style: { background: DESK_DOT[project.activity] } }),
              jsx('span', { children: status }),
              project.live && jsx('span', { className: 'rf-live', children: 'Live' })
            ]
          })
        ]
      }),
      project.badges.length > 0 &&
        jsx('div', { className: 'rf-note', children: `${project.badges.length} perlu diputusin` })
    ]
  })
}

const DESK_DOT = { active: '#2f9e62', slow: '#c9952e', sleeping: '#9aa39c' }

function Stat({ label, value, tilt }) {
  return jsxs('div', {
    className: 'rf-stat',
    style: { '--tilt': tilt },
    children: [jsx('div', { className: 'rf-stat-label', children: label }),
               jsx('div', { className: 'rf-stat-value', children: value })]
  })
}

function ProjectPage({ ctx, project, onBack }) {
  const [detail, setDetail] = useState(null)
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => ctx.rest(`/projects/${project.slug}`).then(setDetail), [project.slug])
  useEffect(() => { load().catch(() => setDetail({ error: true })) }, [load])
  useEffect(() => {
    if (!project.image_url) return
    ctx.rest(project.image_url).then(r => setImage(r.data_url)).catch(() => {})
  }, [project.image_url])
  const hue = hueOf(project.name)
  const shell = children => jsxs('div', { className: 'rf-desk rf-page', children: [jsx('style', { children: DESK_CSS }), children] })
  if (!detail) return shell(jsx('div', { className: 'rf-sub', style: { padding: 32 }, children: 'Memuat kartu…' }))
  if (detail.error) return shell(jsx('div', { style: { padding: 32 }, children: 'Kartu gak bisa dimuat. Coba Refresh atau buka lagi.' }))
  const p = prompts(project, detail)
  const f = detail.facts
  const refresh = async () => {
    setBusy(true)
    try { await ctx.rest(`/projects/${project.slug}/refresh`, { method: 'POST' }); await load() }
    finally { setBusy(false) }
  }
  const opportunities = detail.narrative?.opportunities ?? []
  return shell(jsxs('div', { className: 'rf-page-inner', children: [
    jsx('button', { type: 'button', className: 'rf-back', onClick: onBack, children: '← Meja proyek' }),
    jsxs('article', {
      className: 'rf-sheet',
      style: {
        '--tab': `hsl(${hue} 45% 62%)`,
        '--cover': image ? `hsl(${hue} 30% 94%)` : `hsl(${hue} 55% 86%)`,
        '--ink': `hsl(${hue} 45% 28%)`
      },
      children: [
        jsxs('header', { className: 'rf-sheet-head', children: [
          jsx('div', {
            className: 'rf-sheet-cover',
            children: image ? jsx('img', { src: image, alt: '' }) : jsx('span', { className: 'rf-mono', children: initials(project.name) })
          }),
          jsxs('div', { style: { minWidth: 0 }, children: [
            jsx('h1', { className: 'rf-title', children: project.name }),
            jsx('div', { className: 'rf-sub', children: project.what_is || `${project.workdirs} folder kerja, terakhir dikerjain ${ago(project.last_activity)}` }),
            jsxs('div', { className: 'rf-actions', children: [
              jsx('button', { type: 'button', className: 'rf-btn rf-btn-main', onClick: () => startChat(ctx, p.resume), children: 'Lanjutin' }),
              jsx('button', { type: 'button', className: 'rf-btn', onClick: () => startChat(ctx, p.brainstorm), children: 'Brainstorm' }),
              jsx('button', { type: 'button', className: 'rf-btn', onClick: refresh, disabled: busy, children: busy ? 'Memperbarui…' : 'Refresh' })
            ] })
          ] })
        ] }),
        jsxs('div', { className: 'rf-stats', children: [
          jsx(Stat, { label: 'Live terakhir', value: f.release ? new Date(f.release.date + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Belum tercatat', tilt: '-0.8deg' }),
          jsx(Stat, { label: 'Menggantung', value: `${detail.folders.hanging.length} kerjaan`, tilt: '0.6deg' }),
          jsx(Stat, { label: 'Bisa diberesin', value: `${detail.folders.tidy.length} folder`, tilt: '-0.3deg' })
        ] }),
        opportunities.length > 0 && jsxs('section', { className: 'rf-opps', children: [
          jsx('h3', { className: 'rf-opps-title', children: 'Peluang' }),
          ...opportunities.map((o, i) => jsxs('div', { className: 'rf-opp', children: [
            jsx('span', { children: o }),
            jsx('button', { type: 'button', className: 'rf-btn', onClick: () => startChat(ctx, p.opportunity(o)), children: 'Kerjain' })
          ] }, i))
        ] }),
        jsx('div', { className: 'rf-card-md', children: jsx(Blocks, { blocks: parseBlocks(detail.card_markdown.split('\n')), skipTitle: true }) })
      ]
    })
  ] }))
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
  return jsxs('div', { className: 'rf-desk', children: [
    jsx('style', { children: DESK_CSS }),
    jsxs('div', { className: 'rf-head', children: [
      jsx('h1', { className: 'rf-title', children: 'Meja proyek' }),
      jsx('div', { className: 'rf-sub', children: `${state.projects.length} proyek, yang terakhir dikerjain di depan` })
    ] }),
    jsx('div', {
      className: 'rf-grid',
      children: state.projects.map((p, i) => jsx(Tile, { ctx, project: p, index: i, onOpen: () => setOpen(p) }, p.slug))
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
