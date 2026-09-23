/**
 * EventSource / <video> / <img> / <iframe> can't set Authorization headers, so
 * a Clerk session token may ride in ?token= — but only on these read paths.
 * Everything else, the admin downloads included, must send the header.
 */
const TOKEN_QUERY_PATHS = [
  /^\/projects\/[^/]+\/(events|thumbnail)$/,
  /^\/projects\/[^/]+\/assets\/thumb$/,
  /^\/admin\/projects\/[^/]+\/(events|thumbnail)$/,
  /^\/admin\/projects\/[^/]+\/assets\/thumb$/,
  /^\/files\//,
]

export function acceptsTokenQuery(path: string): boolean {
  return TOKEN_QUERY_PATHS.some(re => re.test(path))
}
