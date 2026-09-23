import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { type NetworkInterfaceInfo, networkInterfaces } from 'node:os'
import { contentTypeFor } from './mime'
import { buildSlideshowHtml, type Slide, type SlideshowOptions } from './slideshow'

export interface RunningSlideshowServer {
  url: string
  html: string
  close: () => Promise<void>
}

export interface SlideshowServerOptions {
  advertiseHost?: string
  listenHost?: string
}

type NetworkAddress = Pick<NetworkInterfaceInfo, 'address' | 'family' | 'internal'>
type NetworkAddresses = Record<string, readonly NetworkAddress[] | undefined>

const VIRTUAL_INTERFACE = /^(?:lo|docker|br-|veth|virbr|tailscale|tun|tap)/i

/**
 * Pick a non-loopback address to advertise. The recorded browser runs in this
 * process today, where loopback would do, but a pod or container address stays
 * reachable if the browser is ever placed elsewhere. On GKE the worker pins it
 * with SLIDESHOW_BROWSER_HOST=$(POD_IP).
 */
export function selectBrowserReachableHost(addresses: NetworkAddresses): string {
  const candidates = Object.entries(addresses).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter(entry => entry.family === 'IPv4' && !entry.internal)
      .map(entry => ({ name, address: entry.address })),
  )

  return (
    candidates.find(candidate => !VIRTUAL_INTERFACE.test(candidate.name))?.address ??
    candidates[0]?.address ??
    '127.0.0.1'
  )
}

const listen = (server: Server, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Slideshow server did not receive a TCP port.'))
        return
      }
      resolve(address.port)
    })
  })

/**
 * Serve one generated slideshow and only its prepared image files over HTTP.
 * `pitch demo browser goto` opens http(s) URLs only, so the slideshow needs a
 * real origin; every local image path is rewritten to /assets/<index> here.
 */
export async function startSlideshowServer(
  slides: Slide[],
  options: SlideshowOptions = {},
  serverOptions: SlideshowServerOptions = {},
): Promise<RunningSlideshowServer> {
  const assetPaths = slides.map(slide => slide.image)
  let html = ''

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (requestUrl.pathname === '/' || requestUrl.pathname === '/slideshow.html') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(request.method === 'HEAD' ? undefined : html)
      return
    }

    const match = requestUrl.pathname.match(/^\/assets\/(\d+)$/)
    const index = match ? Number(match[1]) : -1
    const assetPath = assetPaths[index]
    if (!assetPath || /^(?:data|https?|file):/i.test(assetPath)) {
      response.writeHead(404).end()
      return
    }

    try {
      const info = await stat(assetPath)
      if (!info.isFile()) throw new Error('Asset is not a file.')
      response.writeHead(200, {
        'Content-Type': contentTypeFor(assetPath),
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
      })
      if (request.method === 'HEAD') {
        response.end()
      } else {
        createReadStream(assetPath)
          .on('error', () => response.destroy())
          .pipe(response)
      }
    } catch {
      response.writeHead(404).end()
    }
  })

  const port = await listen(server, serverOptions.listenHost ?? '0.0.0.0')
  const advertiseHost =
    serverOptions.advertiseHost ??
    process.env.SLIDESHOW_BROWSER_HOST?.trim() ??
    selectBrowserReachableHost(networkInterfaces())
  const origin = `http://${advertiseHost}:${port}`
  const servedSlides = slides.map((slide, index) => ({
    ...slide,
    image: /^(?:data|https?):/i.test(slide.image) ? slide.image : `${origin}/assets/${index}`,
  }))
  html = buildSlideshowHtml(servedSlides, options)
  server.unref()

  let closed = false
  return {
    url: `${origin}/slideshow.html`,
    html,
    close: () =>
      new Promise(resolve => {
        if (closed || !server.listening) {
          closed = true
          resolve()
          return
        }
        closed = true
        server.close(() => resolve())
      }),
  }
}
