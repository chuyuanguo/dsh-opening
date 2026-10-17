/**
 * DSH / OPENING — Host half.
 *
 * Serves the released opening film and its poster over the profile's HTTP
 * carrier, plus the small state document the browser half reads before it
 * mounts the overlay. The film is streamed with HTTP Range support so the
 * video element can seek and start before the whole 30 MB file arrives.
 */
import { createReadStream, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_DIR = path.join(HERE, 'media')
const ROUTE_BASE = '/dsh-opening'
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SETTINGS_FILE = path.join(DSH_HOME, 'dsh-opening.json')

const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(path.join(HERE, 'package.json'), 'utf8')).version || '0.0.0')
  } catch {
    return '0.0.0'
  }
})()

/** Defaults; `$DSH_HOME/dsh-opening.json` may override the allow-listed fields. */
const DEFAULTS = {
  frequency: 'session',
  volume: 0.85,
  allowSkip: true,
  autoplay: true,
}
const FREQUENCIES = new Set(['session', 'daily', 'once', 'always'])

const MEDIA = new Map([
  [`${ROUTE_BASE}/media/opening.mp4`, { file: 'opening-1080p30.mp4', type: 'video/mp4' }],
  [`${ROUTE_BASE}/media/poster.png`, { file: 'poster.png', type: 'image/png' }],
])

const FILM = {
  title: 'DSH / OPENING — INTENT, IN FORM',
  durationSeconds: 19.5,
  width: 1920,
  height: 1080,
  fps: 30,
}

function readOptions() {
  const options = { ...DEFAULTS }
  let raw
  try {
    raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    return options
  }
  if (!raw || typeof raw !== 'object') return options
  if (FREQUENCIES.has(raw.frequency)) options.frequency = raw.frequency
  if (typeof raw.allowSkip === 'boolean') options.allowSkip = raw.allowSkip
  if (typeof raw.autoplay === 'boolean') options.autoplay = raw.autoplay
  const volume = Number(raw.volume)
  if (Number.isFinite(volume)) options.volume = Math.min(1, Math.max(0, volume))
  return options
}

function stateDocument() {
  const options = readOptions()
  return {
    version: VERSION,
    frequency: options.frequency,
    volume: options.volume,
    allowSkip: options.allowSkip,
    autoplay: options.autoplay,
    film: FILM,
    video: { src: `${ROUTE_BASE}/media/opening.mp4`, type: 'video/mp4' },
    poster: `${ROUTE_BASE}/media/poster.png`,
  }
}

function sendJson(res, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length),
    ...extraHeaders,
  })
  res.end(body)
}

function parseRange(header, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!match) return null
  const rawStart = match[1]
  const rawEnd = match[2]
  if (rawStart === '' && rawEnd === '') return null

  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end < start || start >= total) return null
  return { start, end }
}

async function serveMedia(req, res, media) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' }, { Allow: 'GET, HEAD' })
    return
  }

  const file = path.join(MEDIA_DIR, media.file)
  let info
  try {
    info = await stat(file)
  } catch {
    sendJson(res, 404, { ok: false, error: 'media file not found', file: media.file })
    return
  }
  if (!info.isFile()) {
    sendJson(res, 404, { ok: false, error: 'media file not found', file: media.file })
    return
  }

  const total = info.size
  const etag = `"${total.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const headers = {
    'Content-Type': media.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
  }

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  const rangeHeader = req.headers.range
  if (typeof rangeHeader === 'string' && rangeHeader.length > 0) {
    const range = parseRange(rangeHeader, total)
    if (!range) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    const length = range.end - range.start + 1
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
      'Content-Length': String(length),
    })
    if (method === 'HEAD') {
      res.end()
      return
    }
    stream(file, res, { start: range.start, end: range.end })
    return
  }

  res.writeHead(200, { ...headers, 'Content-Length': String(total) })
  if (method === 'HEAD') {
    res.end()
    return
  }
  stream(file, res, undefined)
}

function stream(file, res, range) {
  const source = range ? createReadStream(file, range) : createReadStream(file)
  source.on('error', () => {
    try {
      res.destroy()
    } catch {
      /* response already gone */
    }
  })
  res.on('close', () => source.destroy())
  source.pipe(res)
}

function stateHandler(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' }, { Allow: 'GET, HEAD' })
    return
  }
  sendJson(res, 200, stateDocument())
}

/**
 * Host half: mount the routes whenever the profile has an HTTP carrier.
 * Without `webServer` the routes stay unmounted and the browser half simply
 * declines to mount its overlay (its state request never resolves).
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const server = webCtx.webServer
      const disposers = []
      const mount = (route) => {
        try {
          disposers.push(server.register(route))
        } catch (error) {
          ctx.logger?.warn?.(`dsh-opening: route ${route.path} failed: ${String((error && error.message) || error)}`)
        }
      }

      mount({ kind: 'exact', path: `${ROUTE_BASE}/state.json`, handler: stateHandler })
      for (const [routePath, media] of MEDIA) {
        mount({ kind: 'exact', path: routePath, handler: (req, res) => serveMedia(req, res, media) })
      }
      ctx.logger?.info?.(`dsh-opening: serving ${ROUTE_BASE} (v${VERSION})`)

      return () => {
        for (const dispose of disposers.splice(0)) {
          try {
            dispose()
          } catch {
            /* ignore a route already gone */
          }
        }
      }
    }, 'dsh-opening routes')
  })
}
