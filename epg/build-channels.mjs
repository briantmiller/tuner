#!/usr/bin/env node
// Builds a custom *.channels.xml for iptv-org/epg's `npm run grab` from a short
// list of tvg-ids (epg/channels.txt), picking a source site for each channel.
//
// node epg/build-channels.mjs --sites <iptv-org/epg/sites> --wanted epg/channels.txt \
//   [--prefer epg/sites.txt] [--fallbacks 1] [--lang en] --out channels.xml
import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]])
    return acc
  }, [])
)
const sitesDir = args.sites
const wantedFile = args.wanted
const outFile = args.out
if (!sitesDir || !wantedFile || !outFile) {
  console.error('usage: build-channels.mjs --sites DIR --wanted FILE --out FILE [--prefer FILE] [--fallbacks N] [--lang en]')
  process.exit(2)
}
const fallbacks = Math.max(0, parseInt(args.fallbacks ?? '1', 10) || 0)
const langs = (args.lang || 'en').toLowerCase().split(',').filter(Boolean)

const lines = file =>
  file && fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
    : []

// Wanted channels: "<id>[@feed] [site]"
const wanted = []
const seen = new Set()
for (const l of lines(wantedFile)) {
  const [id, site] = l.split(/\s+/)
  const key = id.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  wanted.push({ id, key, base: key.split('@')[0], exact: key.includes('@'), site: site?.toLowerCase() })
}
const prefer = lines(args.prefer).map(s => s.toLowerCase())

// Index every <channel> in every sites/*/*.channels.xml by xmltv_id
const attrRe = /([\w-]+)="([^"]*)"/g
const chanRe = /<channel\s([^>]*?)>([\s\S]*?)<\/channel>/g
const byId = new Map()
const byBase = new Map()
const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v)
for (const site of fs.readdirSync(sitesDir)) {
  const dir = path.join(sitesDir, site)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.channels.xml')) continue
    const xml = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const m of xml.matchAll(chanRe)) {
      const a = Object.fromEntries([...m[1].matchAll(attrRe)].map(x => [x[1], x[2]]))
      if (!a.xmltv_id || !a.site || !a.site_id || !m[2].trim()) continue
      const entry = { raw: m[0], site: a.site.toLowerCase(), lang: (a.lang || '').toLowerCase(), id: a.xmltv_id }
      push(byId, a.xmltv_id.toLowerCase(), entry)
      push(byBase, a.xmltv_id.toLowerCase().split('@')[0], entry)
    }
  }
}

const candidatesFor = w => (w.exact ? byId.get(w.key) : byBase.get(w.base)) || []

// How many wanted channels each site can serve: used to rank unlisted sites,
// so the guide comes from as few sites as possible.
const popularity = new Map()
for (const w of wanted) for (const s of new Set(candidatesFor(w).map(c => c.site))) popularity.set(s, (popularity.get(s) || 0) + 1)

const rankSite = (site, w) => {
  if (w.site && site === w.site) return -1
  const p = prefer.indexOf(site)
  return p >= 0 ? p : prefer.length + 1000 - (popularity.get(site) || 0)
}
const rankEntry = (e, w) =>
  (langs.includes(e.lang) ? 0 : 10) + (e.id.toLowerCase() === w.key ? 0 : 1) + (/@sd$/i.test(e.id) ? 0 : 2)

const picked = []
const missing = []
for (const w of wanted) {
  let cands = candidatesFor(w)
  if (w.site) {
    const forced = cands.filter(c => c.site === w.site)
    if (!forced.length) console.warn(`! ${w.id}: not listed by ${w.site}, using another site`)
    else cands = forced
  }
  if (!cands.length) { missing.push(w.id); continue }
  const sites = [...new Set(cands.map(c => c.site))].sort((a, b) => rankSite(a, w) - rankSite(b, w))
  const chosen = []
  for (const site of sites.slice(0, 1 + fallbacks)) {
    const best = cands.filter(c => c.site === site).sort((a, b) => rankEntry(a, w) - rankEntry(b, w))[0]
    chosen.push(best)
  }
  // Fallback entries must publish under the same xmltv_id so the guide merges them
  const id = chosen[0].id
  for (const c of chosen) picked.push(c.raw.replace(/xmltv_id="[^"]*"/, `xmltv_id="${id}"`))
  console.log(`  ${w.id.padEnd(28)} → ${chosen.map(c => c.site).join(', ')}`)
}

fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
fs.writeFileSync(outFile, `<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n${picked.map(r => '  ' + r).join('\n')}\n</channels>\n`)
console.log(`${wanted.length - missing.length}/${wanted.length} channels have a source (${picked.length} entries) → ${outFile}`)
if (missing.length) console.log(`No source in iptv-org/epg for: ${missing.join(', ')}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Guide channels\n${wanted.length - missing.length} of ${wanted.length} channels have a source.\n` +
      (missing.length ? `\nNo source in iptv-org/epg for: \`${missing.join('`, `')}\`\n` : '')
  )
}
