# Tuner

A small web app for browsing M3U/IPTV playlists on iPhone and iPad. It loads a playlist link, lists every channel, and searches by channel name, category, or what's on now. It installs to the Home Screen and opens full screen like a native app.

## Put it online (pick one, about 2 minutes)

iOS only installs web apps served over **https**, so the folder needs a host. Any static host works.

**Netlify Drop (no account needed to try)**
1. Go to https://app.netlify.com/drop on a computer.
2. Drag this whole `tuner` folder onto the page.
3. Open the link it gives you on your iPhone.

**GitHub Pages**
1. Create a new repository and upload the contents of this folder (index.html at the top level).
2. Settings → Pages → Deploy from branch → `main` / root → Save.
3. Open `https://<you>.github.io/<repo>/` on your iPhone.

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

What's playing comes from an XMLTV guide (.xml or .xml.gz). If the playlist names one in its header (`x-tvg-url` / `url-tvg`), Tuner loads it automatically. The iptv-org playlists don't include one, so paste a guide link under **Playlist → TV guide**. Programmes are matched by `tvg-id` (with or without the `@feed` suffix), then by channel name. The iptv-org/epg project can generate guides for its channels.

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
