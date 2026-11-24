#!/usr/bin/env node
// Merges the per-site guides written by `npm run grab --output=raw/{site}.xml`,
// keeps only what airs in the next few hours, and writes guide.xml (+ .gz).
// For each channel it takes the first site (in channels.xml order) that has
// something on air now; if every site failed it reuses the last published guide.
//
// node epg/trim.mjs --channels channels.xml --raw raw/ [--previous prev.xml] \
//   [--hours 6] --out site/
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]])
    return acc
  }, [])
)
if (!args.channels || !args.raw || !args.out) {
  console.error('usage: trim.mjs --channels FILE --raw DIR --out DIR [--previous FILE] [--hours 6]')
  process.exit(2)
}
const hours = Number(args.hours || 6)
const now = Date.now()
const from = now
const until = now + hours * 3600e3

const attrs = s => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))

// XMLTV time: "20261123210000 +0000" (offset optional)
function xmltvTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{2}):?(\d{2})?/.exec(s || '')
  if (!m) return NaN
  const [, y, mo, d, h, mi, se = '0', oh = '+00', om = '00'] = m
  const off = (Math.abs(+oh) * 60 + +om) * (oh.startsWith('-') ? -1 : 1)
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - off * 60e3
}

// Parse an XMLTV file into { channels: Map(id → raw), programmes: Map(id → [{s, e, raw}]) }
function readGuide(file) {
  const g = { channels: new Map(), programmes: new Map() }
  if (!file || !fs.existsSync(file)) return g
  let xml = fs.readFileSync(file)
  if (xml[0] === 0x1f && xml[1] === 0x8b) xml = zlib.gunzipSync(xml)
  xml = xml.toString('utf8')
  for (const m of xml.matchAll(/<channel\s[^>]*?(?:\/>|>[\s\S]*?<\/channel>)/g)) {
    const id = attrs(m[0].slice(0, m[0].indexOf('>'))).id
    if (id && !g.channels.has(id)) g.channels.set(id, m[0])
  }
  for (const m of xml.matchAll(/<programme\s[^>]*?(?:\/>|>[\s\S]*?<\/programme>)/g)) {
    const a = attrs(m[0].slice(0, m[0].indexOf('>')))
    const s = xmltvTime(a.start)
    const e = xmltvTime(a.stop)
    if (!a.channel || !isFinite(s)) continue
    const list = g.programmes.get(a.channel) || g.programmes.set(a.channel, []).get(a.channel)
    list.push({ s, e, raw: m[0] })
  }
  for (const list of g.programmes.values()) {
    list.sort((a, b) => a.s - b.s)
    list.forEach((p, i) => { if (!isFinite(p.e)) p.e = list[i + 1]?.s ?? p.s + 3600e3 })
  }
  return g
}

const inWindow = list => (list || []).filter(p => p.e > from && p.s < until)
const onAir = list => list.some(p => p.s <= now && now < p.e)

// Channel order and site preference come from the built channels.xml
const order = []
for (const m of fs.readFileSync(args.channels, 'utf8').matchAll(/<channel\s([^>]*)>/g)) {
  const a = attrs(m[1])
  let o = order.find(x => x.id === a.xmltv_id)
  if (!o) order.push((o = { id: a.xmltv_id, sites: [] }))
  if (!o.sites.includes(a.site)) o.sites.push(a.site)
}

const cache = new Map()
const siteGuide = site => {
  if (!cache.has(site)) cache.set(site, readGuide(path.join(args.raw, `${site}.xml`)))
  return cache.get(site)
}
const previous = readGuide(args.previous)

const outChannels = []
const outProgrammes = []
const report = {}
for (const { id, sites } of order) {
  let best = null
  for (const site of sites) {
    const g = siteGuide(site)
    const list = inWindow(g.programmes.get(id))
    if (!list.length) continue
    const cand = { from: site, list, channel: g.channels.get(id) }
    if (onAir(list)) { best = cand; break }
    if (!best || list.length > best.list.length) best = cand
  }
  if (!best) {
    const list = inWindow(previous.programmes.get(id))
    if (list.length) best = { from: 'previous', list, channel: previous.channels.get(id) }
  }
  report[id] = best ? { from: best.from, programmes: best.list.length } : null
  if (!best) continue
  outChannels.push(best.channel || `<channel id="${id}"><display-name>${id}</display-name></channel>`)
  for (const p of best.list) outProgrammes.push(p)
}
outProgrammes.sort((a, b) => a.s - b.s)

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<tv date="${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}" generator-info-name="tuner-epg">\n` +
  outChannels.map(c => '  ' + c.trim()).join('\n') + '\n' +
  outProgrammes.map(p => '  ' + p.raw.trim()).join('\n') + '\n' +
  '</tv>\n'

fs.mkdirSync(args.out, { recursive: true })
fs.writeFileSync(path.join(args.out, 'guide.xml'), xml)
fs.writeFileSync(path.join(args.out, 'guide.xml.gz'), zlib.gzipSync(xml, { level: 9 }))
const status = {
  generated: new Date(now).toISOString(),
  windowHours: hours,
  channels: outChannels.length,
  programmes: outProgrammes.length,
  missing: Object.keys(report).filter(k => !report[k]),
  sources: report
}
fs.writeFileSync(path.join(args.out, 'guide-status.json'), JSON.stringify(status, null, 2) + '\n')

const stale = Object.entries(report).filter(([, r]) => r?.from === 'previous').map(([k]) => k)
console.log(`guide.xml: ${status.channels}/${order.length} channels, ${status.programmes} programmes, next ${hours}h (${(xml.length / 1024).toFixed(0)} KB)`)
if (stale.length) console.log(`Reused last published guide for: ${stale.join(', ')}`)
if (status.missing.length) console.log(`No programmes for: ${status.missing.join(', ')}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(report).map(([k, r]) => `| ${k} | ${r ? r.from : '—'} | ${r ? r.programmes : 0} |`)
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Published guide\n${status.channels}/${order.length} channels, ${status.programmes} programmes, next ${hours} h\n\n| Channel | Source | Programmes |\n|---|---|---|\n${rows.join('\n')}\n`
  )
}
// Fail the run (and skip the deploy) only if nothing at all came through
if (!outProgrammes.length && order.length) {
  console.error('No programmes from any source, keeping the current site.')
  process.exit(1)
}
