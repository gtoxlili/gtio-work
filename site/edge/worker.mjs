const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

function language(request) {
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)lang=(en|zh)(?:;|$)/)
  return cookie?.[1] ?? (/^\s*zh/i.test(request.headers.get('Accept-Language') ?? '') ? 'zh' : 'en')
}

async function film(request, env, ctx) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const key = new URL(request.url).pathname.slice(1)
  const rangeHeader = request.headers.get('Range')
  const cached = request.method === 'GET' && !rangeHeader ? await caches.default.match(request) : null
  if (cached) return cached
  let range
  if (request.method === 'GET' && rangeHeader) {
    const metadata = await env.FILM.head(key)
    if (metadata) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
      const ifRange = request.headers.get('If-Range')
      const rangeAllowed =
        !ifRange || ifRange === metadata.httpEtag || metadata.uploaded.getTime() <= Date.parse(ifRange)
      if (match && rangeAllowed) {
        const offset = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]))
        const end = match[1] && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1
        if ((!match[1] && !Number(match[2])) || offset >= metadata.size || end < offset) {
          return new Response(null, {
            status: 416,
            headers: { ...SECURITY, 'Content-Range': `bytes */${metadata.size}` },
          })
        }
        range = { offset, length: end - offset + 1 }
      }
    }
  }
  const object =
    request.method === 'HEAD' ? await env.FILM.head(key) : await env.FILM.get(key, { range, onlyIf: request.headers })
  if (!object) return new Response('Not found', { status: 404, headers: { ...SECURITY, 'Cache-Control': 'no-store' } })
  const headers = new Headers(SECURITY)
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(object.size))
    return new Response(null, { headers })
  }
  if (!('body' in object)) {
    const failedPrecondition = request.headers.has('If-Match') || request.headers.has('If-Unmodified-Since')
    return new Response(null, { status: failedPrecondition ? 412 : 304, headers })
  }
  let status = 200
  if (object.range) {
    const offset = Math.max(0, object.range.offset ?? object.size - object.range.suffix)
    const length = Math.min(object.range.length ?? object.range.suffix ?? object.size - offset, object.size - offset)
    if (offset >= object.size || length <= 0) {
      await object.body.cancel()
      headers.set('Content-Range', `bytes */${object.size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set('Content-Length', String(length))
    status = 206
  } else {
    headers.set('Content-Length', String(object.size))
  }
  const response = new Response(object.body, { status, headers })
  if (status === 200) ctx.waitUntil(caches.default.put(new Request(request.url), response.clone()))
  return response
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/film/')) return film(request, env, ctx)
    if (url.pathname === '/en' || url.pathname === '/zh') {
      url.pathname += '/'
      return Response.redirect(url, 301)
    }
    if (['/', '/en/', '/zh/'].includes(url.pathname)) {
      const lang = url.pathname === '/' ? language(request) : url.pathname.slice(1, 3)
      url.pathname = `/index.${lang}.html`
      const asset = await env.ASSETS.fetch(new Request(url, request))
      const headers = new Headers(asset.headers)
      for (const [name, value] of Object.entries(SECURITY)) headers.set(name, value)
      headers.set('Cache-Control', 'no-cache')
      headers.set('Vary', 'Accept-Language, Cookie')
      return new Response(asset.body, { status: asset.status, headers })
    }
    return env.ASSETS.fetch(request)
  },
}
