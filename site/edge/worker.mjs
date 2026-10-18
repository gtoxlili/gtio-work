const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

function language(request) {
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)lang=(en|zh)(?:;|$)/)
  return cookie?.[1] ?? (/^\s*zh/i.test(request.headers.get('Accept-Language') ?? '') ? 'zh' : 'en')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
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
    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return asset
    return new Response(asset.body, {
      status: 404,
      headers: { ...SECURITY, 'Cache-Control': 'no-store' },
    })
  },
}
