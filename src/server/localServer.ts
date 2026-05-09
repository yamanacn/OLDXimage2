import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApiHandler } from './zhenzhenProxy'
import type { ServerRuntime } from './runtimeConfig'

interface LocalServerOptions {
  staticDir: string;
  runtime: ServerRuntime;
}

interface LocalServerHandle {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
}

const sendJson = (response: ServerResponse, statusCode: number, payload: { ok: false; error: string }) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const sendStaticFile = (request: IncomingMessage, response: ServerResponse, staticDir: string) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const url = new URL(request.url || '/', 'http://localhost')
  const decodedPath = decodeURIComponent(url.pathname)
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const candidatePath = normalizedPath === '/' || normalizedPath === '.'
    ? join(staticDir, 'index.html')
    : join(staticDir, normalizedPath)
  const resolvedPath = resolve(candidatePath)
  const allowedRoot = resolve(staticDir)

  if (!resolvedPath.toLowerCase().startsWith(allowedRoot.toLowerCase())) {
    sendJson(response, 403, { ok: false, error: 'Forbidden' })
    return
  }

  const filePath = existsSync(resolvedPath) && statSync(resolvedPath).isFile()
    ? resolvedPath
    : join(staticDir, 'index.html')

  if (!existsSync(filePath)) {
    sendJson(response, 404, { ok: false, error: `Missing static file: ${pathToFileURL(filePath).href}` })
    return
  }

  const extension = extname(filePath).toLowerCase()
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  createReadStream(filePath)
    .on('error', error => {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    })
    .pipe(response)
}

export const startLocalServer = async ({ staticDir, runtime }: LocalServerOptions): Promise<LocalServerHandle> => {
  const apiHandler = createApiHandler(runtime)
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname
      if (pathname.startsWith('/api/')) {
        await apiHandler(request, response)
        return
      }

      sendStaticFile(request, response, staticDir)
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to resolve local server port')
  const port = address.port

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => {
        if (error) rejectClose(error)
        else resolveClose()
      })
    }),
  }
}
