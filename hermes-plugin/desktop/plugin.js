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
const ACTIVITY_LABEL = { active: 'Active', slow: 'Slow', sleeping: 'Asleep' }

// ---------- small helpers ----------

function ago(iso) {
  if (!iso) return 'no activity yet'
  const days = Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
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
    host.notify({ kind: 'info', message: 'Prompt copied. Paste it into the new chat.' })
  } catch {
    host.notify({ kind: 'error', message: 'Could not open a new chat. Try again.' })
  }
}

function prompts(project, detail) {
  const where = `The project card is at ${detail.card_path}. Read it first, especially "Do not touch".`
  return {
    resume: `I want to continue ${project.name}. ${where} Tell me in plain words where it stands, then suggest the next step. Don't change anything until I agree.`,
    brainstorm: `Let's brainstorm new features for ${project.name}. ${where} Talk it through with me first and don't change any files.`,
    opportunity: text =>
      `Work on this opportunity in ${project.name}: "${text}". ${where} Explain the plan in plain words and wait for my OK before changing anything.`
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
.rf-head-side { display:flex; align-items:center; gap: 14px; }
.rf-tools { display:flex; flex-wrap:wrap; align-items:center; gap: 12px 16px; padding: 10px 32px 0; }
.rf-input { font: inherit; font-size: 14px; color:#1f2a24; background:#fffdf8; border: 1px solid #d9d2c3; border-radius: 10px; padding: 9px 12px; width: 100%; box-sizing: border-box; margin-top: 12px; }
.rf-input:focus { outline: 3px solid #2f7d57; outline-offset: 1px; }
.rf-search { width: 260px; margin-top: 0; box-shadow: 0 1px 0 rgba(31,42,36,.06); }
.rf-chips { display:flex; flex-wrap:wrap; gap: 6px; }
.rf-chip { font: inherit; font-size: 12.5px; font-weight: 600; color:#3d4b43; background: rgba(255,255,255,.6); border: 1px solid transparent; border-radius: 20px; padding: 6px 12px; cursor:pointer; }
.rf-chip:hover { background:#fff; }
.rf-chip.on { background:#1f5c41; color:#fff; }
.rf-chip:focus-visible { outline: 3px solid #2f7d57; outline-offset: 2px; }
.rf-progress { flex: 1; min-width: 260px; background:#fffdf8; border-radius: 10px; padding: 10px 14px; box-shadow: 0 1px 1px rgba(31,42,36,.08), 0 8px 14px -8px rgba(31,42,36,.25); }
.rf-progress-text { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.rf-bar { height: 6px; background:#e6eee2; border-radius: 6px; overflow:hidden; }
.rf-bar-fill { height: 100%; background:#2f9e62; border-radius: 6px; transition: width .4s ease; }
.rf-empty { margin: 30px 32px 0; padding: 18px 20px; background: rgba(255,255,255,.6); border-radius: 12px; font-size: 14px; color:#3d4b43; }
.rf-error { color:#a3302a; font-size: 13px; margin-top: 8px; }
.rf-notice { margin: 0; flex: 1; background:#fff6c4; color:#4a3b00; }
.rf-drives { display:flex; flex-wrap:wrap; align-items:center; gap: 6px; margin-top: 10px; }
.rf-sheet .rf-chip { background:#eef3eb; }
.rf-sheet .rf-chip.on { background:#1f5c41; color:#fff; }
@media (max-width: 640px) { .rf-head { flex-direction: column; gap: 8px; } .rf-search { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .rf-card, .rf-bar-fill { transition:none; } }
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
          jsx('div', { className: 'rf-what', children: project.what_is || `${project.workdirs} work folder${project.workdirs === 1 ? '' : 's'}` }),
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
        jsx('div', { className: 'rf-note', children: `${project.badges.length} to decide` })
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
  if (!detail) return shell(jsx('div', { className: 'rf-sub', style: { padding: 32 }, children: 'Loading card…' }))
  if (detail.error) return shell(jsx('div', { style: { padding: 32 }, children: 'Could not load this card. Try Refresh or open it again.' }))
  const p = prompts(project, detail)
  const f = detail.facts
  const refresh = async () => {
    setBusy(true)
    try { await ctx.rest(`/projects/${project.slug}/refresh`, { method: 'POST' }); await load() }
    finally { setBusy(false) }
  }
  const opportunities = detail.narrative?.opportunities ?? []
  return shell(jsxs('div', { className: 'rf-page-inner', children: [
    jsx('button', { type: 'button', className: 'rf-back', onClick: onBack, children: '← Project desk' }),
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
            jsx('div', { className: 'rf-sub', children: project.what_is || `${project.workdirs} work folders, last worked on ${ago(project.last_activity)}` }),
            jsxs('div', { className: 'rf-actions', children: [
              jsx('button', { type: 'button', className: 'rf-btn rf-btn-main', onClick: () => startChat(ctx, p.resume), children: 'Continue' }),
              jsx('button', { type: 'button', className: 'rf-btn', onClick: () => startChat(ctx, p.brainstorm), children: 'Brainstorm' }),
              jsx('button', { type: 'button', className: 'rf-btn', onClick: refresh, disabled: busy, children: busy ? 'Refreshing…' : 'Refresh' }),
              // The page backend has no model access; the AI summary runs through Hermes chat.
              !detail.narrative && jsx('button', {
                type: 'button',
                className: 'rf-btn',
                onClick: () => startChat(ctx, `/project refresh ${project.slug}`),
                children: 'Summarize with AI'
              })
            ] })
          ] })
        ] }),
        jsxs('div', { className: 'rf-stats', children: [
          jsx(Stat, { label: 'Last release', value: f.release ? new Date(f.release.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded', tilt: '-0.8deg' }),
          jsx(Stat, { label: 'Hanging work', value: `${detail.folders.hanging.length} folders`, tilt: '0.6deg' }),
          jsx(Stat, { label: 'Safe to tidy', value: `${detail.folders.tidy.length} folders`, tilt: '-0.3deg' })
        ] }),
        opportunities.length > 0 && jsxs('section', { className: 'rf-opps', children: [
          jsx('h3', { className: 'rf-opps-title', children: 'Opportunities' }),
          ...opportunities.map((o, i) => jsxs('div', { className: 'rf-opp', children: [
            jsx('span', { children: o }),
            jsx('button', { type: 'button', className: 'rf-btn', onClick: () => startChat(ctx, p.opportunity(o)), children: 'Work on it' })
          ] }, i))
        ] }),
        jsx('div', { className: 'rf-card-md', children: jsx(Blocks, { blocks: parseBlocks(detail.card_markdown.split('\n')), skipTitle: true }) })
      ]
    })
  ] }))
}

function Setup({ ctx, onDone, onCancel, initialRoots = [] }) {
  const [text, setText] = useState(initialRoots.join('\n'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [drives, setDrives] = useState([])
  useEffect(() => { ctx.rest('/setup').then(s => setDrives(s.drives || [])).catch(() => {}) }, [])
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
  const addDrive = d => { if (!lines.includes(d)) { setText([...lines, d].join('\n')); setError('') } }
  const save = async () => {
    const roots = text.split('\n').map(s => s.trim()).filter(Boolean)
    if (!roots.length) return setError('Add at least one folder.')
    setBusy(true)
    try {
      await ctx.rest('/setup', { method: 'POST', body: { roots } })
      onDone()
    } catch {
      setError('Some folders were not found. Check the paths.')
    } finally {
      setBusy(false)
    }
  }
  return jsxs('div', { className: 'rf-desk rf-page', children: [
    jsx('style', { children: DESK_CSS }),
    jsx('div', { className: 'rf-page-inner', children: jsxs('div', { className: 'rf-sheet', style: { '--tab': '#6fc48f', maxWidth: 620 }, children: [
      jsx('h1', { className: 'rf-title', children: onCancel ? 'Project folders' : 'Where are your projects?' }),
      jsx('p', { className: 'rf-sub', children: 'One folder per line, or a whole drive to find every project on it. Rock Foundry only reads; it never changes your projects.' }),
      drives.length > 0 && jsxs('div', { className: 'rf-drives', children: [
        jsx('span', { className: 'rf-sub', children: 'Whole drive:' }),
        ...drives.map(d => jsx('button', { type: 'button', className: `rf-chip${lines.includes(d) ? ' on' : ''}`, 'aria-pressed': lines.includes(d), onClick: () => addDrive(d), children: d }, d))
      ] }),
      lines.some(l => drives.includes(l)) && jsx('p', { className: 'rf-sub', children: 'Drives are searched deeper and skip system, app and dependency folders. The first scan of a drive can take a few minutes.' }),
      jsx('textarea', {
        className: 'rf-input',
        value: text,
        onChange: e => { setText(e.target.value); setError('') },
        placeholder: 'C:/Projects',
        rows: 4,
        'aria-label': 'Project folders, one per line'
      }),
      error && jsx('div', { className: 'rf-error', role: 'alert', children: error }),
      jsx('div', { className: 'rf-actions', children: [jsx('button', {
        type: 'button', className: 'rf-btn rf-btn-main', onClick: save, disabled: busy,
        children: busy ? 'Saving…' : 'Save and scan'
      }), onCancel && jsx('button', { type: 'button', className: 'rf-btn', onClick: onCancel, children: 'Cancel' })] })
    ] }) })
  ] })
}

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: p => p.activity === 'active' },
  { id: 'slow', label: 'Slow', test: p => p.activity === 'slow' },
  { id: 'sleeping', label: 'Asleep', test: p => p.activity === 'sleeping' },
  { id: 'decide', label: 'To decide', test: p => p.badges.length > 0 }
]

function ScanProgress({ scan }) {
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0
  return jsxs('div', { className: 'rf-progress', role: 'status', 'aria-live': 'polite', children: [
    jsx('div', { className: 'rf-progress-text', children: scan.total
      ? `Scanning ${Math.min(scan.done + 1, scan.total)} of ${scan.total}${scan.current ? ` · ${scan.current}` : ''}`
      : 'Finding your projects…' }),
    jsx('div', { className: 'rf-bar', children: jsx('div', { className: 'rf-bar-fill', style: { width: `${pct}%` } }) })
  ] })
}

function ProjectsPage({ ctx }) {
  const [state, setState] = useState({ phase: 'loading' })
  const [scan, setScan] = useState({ running: false })
  const [open, setOpen] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)

  const loadProjects = useCallback(async () => {
    setState({ phase: 'ready', projects: await ctx.rest('/projects') })
  }, [])

  const watchScan = useCallback(async () => {
    try {
      const s = await ctx.rest('/scan')
      setScan(s)
      if (s.running) {
        setTimeout(watchScan, 1000)
      } else {
        await loadProjects()
      }
    } catch {
      setScan({ running: false })
    }
  }, [loadProjects])

  const load = useCallback(async () => {
    try {
      const setup = await ctx.rest('/setup')
      if (!setup.configured) return setState({ phase: 'setup' })
      await loadProjects()
      watchScan()
    } catch {
      setState({ phase: 'error' })
    }
  }, [loadProjects, watchScan])
  useEffect(() => { load() }, [load])

  const rescan = async () => {
    setNotice('')
    try {
      await ctx.rest('/scan', { method: 'POST' })
      watchScan()
    } catch {
      // An older gateway (not restarted since the update) has no /scan route.
      setNotice('Rescan is not available yet. Restart the Hermes gateway (hermes gateway restart) to finish updating Rock Foundry, then open this page again.')
    }
  }
  const editFolders = async () => {
    try { setEditing((await ctx.rest('/setup')).roots || []) } catch { setEditing([]) }
  }

  const shell = children => jsxs('div', { className: 'rf-desk', children: [jsx('style', { children: DESK_CSS }), ...children] })
  if (state.phase === 'loading') return shell([jsx('div', { className: 'rf-sub', style: { padding: 32 }, children: 'Loading projects…' })])
  if (state.phase === 'error') return shell([jsx('div', { style: { padding: 32 }, children: 'Could not reach Rock Foundry. Restart the Hermes gateway, then open this page again.' })])
  if (state.phase === 'setup') return jsx(Setup, { ctx, onDone: load })
  if (editing) return jsx(Setup, { ctx, initialRoots: editing, onCancel: () => setEditing(null), onDone: () => { setEditing(null); load() } })
  if (open) return jsx(ProjectPage, { ctx, project: open, onBack: () => { setOpen(null); loadProjects() } })

  const q = query.trim().toLowerCase()
  const test = FILTERS.find(f => f.id === filter).test
  const shown = state.projects.filter(p => test(p) && (!q || `${p.name} ${p.what_is || ''}`.toLowerCase().includes(q)))

  return shell([
    jsxs('div', { className: 'rf-head', children: [
      jsx('h1', { className: 'rf-title', children: 'Project desk' }),
      jsxs('div', { className: 'rf-head-side', children: [
        jsx('span', { className: 'rf-sub', children: `${state.projects.length} projects, most recently worked on first` }),
        jsx('button', { type: 'button', className: 'rf-btn', onClick: editFolders, children: 'Folders' }),
        jsx('button', { type: 'button', className: 'rf-btn', onClick: rescan, disabled: scan.running, children: scan.running ? 'Scanning…' : 'Rescan all' })
      ] })
    ] }, 'head'),
    notice && jsx('div', { className: 'rf-tools', children: jsx('div', { className: 'rf-empty rf-notice', role: 'alert', children: notice }) }, 'notice'),
    scan.running && jsx('div', { className: 'rf-tools', children: jsx(ScanProgress, { scan }) }, 'progress'),
    state.projects.length > 0 && jsxs('div', { className: 'rf-tools', children: [
      jsx('input', {
        type: 'search', className: 'rf-input rf-search', value: query, placeholder: 'Search projects',
        'aria-label': 'Search projects', onChange: e => setQuery(e.target.value)
      }),
      jsx('div', { className: 'rf-chips', role: 'group', 'aria-label': 'Filter projects', children: FILTERS.map(f => jsx('button', {
        type: 'button', className: `rf-chip${filter === f.id ? ' on' : ''}`, 'aria-pressed': filter === f.id,
        onClick: () => setFilter(f.id),
        children: `${f.label} ${state.projects.filter(f.test).length}`
      }, f.id)) })
    ] }, 'tools'),
    !state.projects.length && !scan.running && jsx('div', { className: 'rf-empty', children: 'No projects found yet. Check your folders with Rescan all, or work in a project folder with Hermes.' }, 'empty'),
    state.projects.length > 0 && !shown.length && jsx('div', { className: 'rf-empty', children: 'No projects match. Clear the search or pick another filter.' }, 'nomatch'),
    jsx('div', {
      className: 'rf-grid',
      children: shown.map((p, i) => jsx(Tile, { ctx, project: p, index: i, onOpen: () => setOpen(p) }, p.slug))
    }, 'grid')
  ])
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
