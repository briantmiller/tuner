# Tuner

A small web app for browsing M3U/IPTV playlists on iPhone and iPad. It loads a playlist link, lists every channel, and searches by channel name, category, or what's on now. It installs to the Home Screen and opens full screen like a native app.

## Put it online (pick one, about 2 minutes)

iOS only installs web apps served over **https**, so the folder needs a host. Any static host works.

**Netlify Drop (no account needed to try)**
1. Go to https://app.netlify.com/drop on a computer.
2. Drag this whole `tuner` folder onto the page.
3. Open the link it gives you on your iPhone.

**GitHub Pages (recommended: also builds the TV guide)**
1. Create a new repository and upload the contents of this folder (index.html at the top level), including the hidden `.github` folder.
2. Settings → Pages → Source: **GitHub Actions**.
3. Actions → **Guide and site** → **Run workflow** (after that it runs by itself every 30 minutes and on every push to `main`).
4. Open `https://<you>.github.io/<repo>/` on your iPhone.

Cloudflare Pages, Vercel and similar hosts work the same way.

## Install on iPhone / iPad

1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch Tuner from the Home Screen icon.

## Using it

- **Playlist** (top right): paste any M3U link, or choose an .m3u file from Files. The first launch loads the iptv-org list as an example. The playlist is saved on the device and refreshed every 12 hours.
- **Search** with the scope bar: *All*, *Channel* (name), *Category* (group-title), or *On now* (current programme).
- **Category chips** filter the list; **★** saves favorites.
- Tap a channel to play it. If a stream won't play in the browser, use **Open in VLC**, **Infuse**, or **Copy link**.

## “On now” needs a TV guide

What's playing comes from an XMLTV guide (.xml or .xml.gz). Tuner uses, in this order: the link under **Playlist → TV guide**, the guide named in the playlist header (`x-tvg-url` / `url-tvg`), then the `guide.xml` published next to the app. Programmes are matched by `tvg-id` (with or without the `@feed` suffix), then by channel name.

### The built-in guide (GitHub Pages)

`.github/workflows/epg.yml` runs every 30 minutes. It downloads [iptv-org/epg](https://github.com/iptv-org/epg), grabs listings for the channels in `epg/channels.txt`, keeps the next 6 hours and publishes them with the app:

- `https://<you>.github.io/<repo>/guide.xml` (and `guide.xml.gz`)
- `https://<you>.github.io/<repo>/guide-status.json`: when it was built and which site each channel came from

To change the channels, edit `epg/channels.txt` (one `tvg-id` per line, as in your playlist) and push. Each run's summary lists channels that iptv-org/epg has no source for. To find a channel's id, search `sites/*/*.channels.xml` in iptv-org/epg for the channel name.

Each channel gets a preferred site and one fallback (order in `epg/sites.txt`). If both fail, the channel keeps the programmes from the last published guide until they run out. Repository variables `EPG_WINDOW_HOURS`, `EPG_FALLBACK_SITES`, `EPG_MAX_CONNECTIONS` and `EPG_REF` change the defaults.

The app refreshes this guide every 30 minutes while it's open. **Remove guide** turns it off; **Load guide** with an empty link turns it back on.

Good to know: GitHub runs schedules on a best-effort basis (runs can start late or be skipped at busy times), and it pauses scheduled workflows in public repositories after 60 days without commits. Re-enable it from the Actions tab if that happens.

To try it locally:

```sh
git clone --depth 1 https://github.com/iptv-org/epg .epg && (cd .epg && npm ci)
node epg/build-channels.mjs --sites .epg/sites --wanted epg/channels.txt --prefer epg/sites.txt --out /tmp/channels.xml
(cd .epg && npm run grab --- --channels=/tmp/channels.xml --output=/tmp/raw/{site}.xml --days=2 --maxConnections=4)
node epg/trim.mjs --channels /tmp/channels.xml --raw /tmp/raw --hours 6 --out .
```

## Limits worth knowing

- **CORS**: the browser can only download playlists and guides from servers that allow it. GitHub Pages does. For others, set a CORS proxy under **Advanced**, or download the file and choose it.
- **http:// streams** are blocked inside an https app. Many iptv-org streams are https and play fine; for the rest, use VLC/Infuse.
- Streams that need a special User-Agent or Referrer (`#EXTVLCOPT`) usually only work in VLC.
- Very large guides (100 MB+) can take a while on a phone. Tuner keeps only the next 36 hours for matched channels.

## Files

- `index.html` – the whole app (HTML, CSS, JS)
- `manifest.webmanifest` – install metadata
- `sw.js` – offline cache for the app itself
- `icons/` – Home Screen and app icons
- `epg/` – channel list and scripts for the guide (not published)
- `.github/workflows/epg.yml` – builds the guide and deploys the site
