/** Download pinned GitHub SVG collections and build the offline icon catalog. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../assets/icons')
const sources = JSON.parse(readFileSync(path.join(root, 'sources.json'), 'utf8'))
const icons: any[] = []
const extraTags: Record<string, string[]> = {
  slack: ['chat', 'messaging', 'communication', 'notification'],
  github: ['git', 'code', 'repository', 'pull request', 'pr'],
  linear: ['issue', 'ticket', 'task', 'project management'],
  windows: ['os', 'operating system', 'desktop', 'computer'],
  apple: ['mac', 'macos', 'os', 'desktop', 'computer'],
  linux: ['os', 'operating system', 'desktop', 'computer'],
  android: ['os', 'mobile', 'phone'],
  discord: ['chat', 'messaging', 'community'],
  gmail: ['email', 'mail', 'message'],
  'google-drive': ['files', 'storage', 'documents'],
}

// SVGL stores metadata as a TS data literal. Parse syntax, never execute upstream code.
function literal(node: ts.Node): any {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map(p => {
        if (
          !ts.isPropertyAssignment(p) ||
          !p.name ||
          (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name))
        )
          throw new Error('Unexpected executable syntax in icon metadata')
        return [p.name.text, literal(p.initializer)]
      }),
    )
  throw new Error(`Unsupported icon metadata syntax: ${ts.SyntaxKind[node.kind]}`)
}

function svglData(file: string): any[] {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations)
      if (declaration.name.getText(ast) === 'svgs' && declaration.initializer)
        return literal(declaration.initializer)
  }
  throw new Error('SVGL metadata array not found')
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) =>
      String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const temp = mkdtempSync(path.join(tmpdir(), 'pitch-vendor-icons-'))
try {
  for (const [collection, rawSource] of Object.entries(sources)) {
    const source = rawSource as any
    if (!/^[a-f0-9]{40}$/.test(source.revision))
      throw new Error('Pin each collection to a commit SHA')
    const response = await fetch(
      `https://codeload.github.com/${source.repository}/tar.gz/${source.revision}`,
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!response.ok) throw new Error(`${collection}: GitHub download returned ${response.status}`)
    const archive = path.join(temp, `${collection}.tgz`)
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
    const upstream = path.join(temp, collection)
    mkdirSync(upstream)
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', upstream])
    const destination = path.join(root, collection)
    mkdirSync(destination, { recursive: true })
    mkdirSync(path.join(root, 'licenses', collection), { recursive: true })
    for (const file of source.licenseFiles)
      writeFileSync(
        path.join(root, 'licenses', collection, file),
        readFileSync(path.join(upstream, file)),
      )

    let metadata: any[] = []
    if (collection === 'simple-icons')
      metadata = JSON.parse(readFileSync(path.join(upstream, 'data/simple-icons.json'), 'utf8'))
    if (collection === 'svgl') metadata = svglData(path.join(upstream, 'src/data/svgs.ts'))
    const byTitle = new Map(metadata.map(m => [m.title, m]))
    const byFile = new Map<string, { item: any; variant: string }>()
    if (collection === 'svgl') {
      for (const item of metadata) {
        for (const key of ['route', 'wordmark']) {
          const variants = typeof item[key] === 'string' ? { original: item[key] } : item[key] || {}
          for (const [variant, file] of Object.entries(variants))
            byFile.set(path.basename(String(file)), {
              item,
              variant: `${key === 'wordmark' ? 'wordmark-' : ''}${variant}`,
            })
        }
      }
    }
    const iconDir = path.join(upstream, collection === 'svgl' ? 'static/library' : 'icons')
    const before = icons.length
    for (const file of readdirSync(iconDir)
      .filter(f => f.endsWith('.svg'))
      .sort()) {
      let svg = readFileSync(path.join(iconDir, file), 'utf8')
      if (!/<svg\b/i.test(svg)) throw new Error(`${collection}/${file} is not an SVG`)
      let normalizedViewBox: boolean | undefined
      if (!/viewBox\s*=/i.test(svg)) {
        const header = svg.match(/<svg\b[^>]*>/i)?.[0] || ''
        const width = header.match(/\bwidth=["']([\d.]+)(?:px)?["']/)?.[1]
        const height = header.match(/\bheight=["']([\d.]+)(?:px)?["']/)?.[1]
        if (!(Number(width) > 0 && Number(height) > 0))
          throw new Error(`${collection}/${file} has no scalable dimensions`)
        svg = svg.replace(/<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`)
        normalizedViewBox = true
      }
      const slug = file.slice(0, -4)
      let name = slug,
        tags: string[] = [],
        variant = 'original',
        details: any = {}
      if (collection === 'lucide') {
        const metaFile = path.join(iconDir, `${slug}.json`)
        const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {}
        tags = [...(meta.tags || []), ...(meta.categories || [])]
        name = slug.replace(/-/g, ' ')
        variant = 'outline'
      } else if (collection === 'simple-icons') {
        name = decodeXml(svg.match(/<title>(.*?)<\/title>/s)?.[1] || slug)
        const meta = byTitle.get(name)
        if (!meta) throw new Error(`Missing Simple Icons metadata for ${name}`)
        tags = meta.aliases?.aka || []
        details = {
          color: `#${meta.hex}`,
          sourceUrl: meta.source,
          guidelines: meta.guidelines,
          brandLicense: meta.license,
        }
        variant = 'monochrome'
      } else {
        const meta = byFile.get(file)
        if (!meta) continue // Only cataloged brand assets, not unrelated static files.
        name = meta.item.title.trim()
        tags = [meta.item.category].flat()
        variant = meta.variant
        details = { sourceUrl: meta.item.url, guidelines: meta.item.brandUrl }
      }
      tags.push(...(extraTags[name.toLowerCase().replace(/\s+/g, '-')] || []))
      writeFileSync(path.join(destination, file), svg)
      icons.push({
        id: `${collection}/${slug}`,
        name,
        collection,
        variant,
        file: `${collection}/${file}`,
        tags: [...new Set(tags)],
        sha256: createHash('sha256').update(svg).digest('hex'),
        normalizedViewBox,
        ...details,
      })
    }
    console.log(`${collection}: ${icons.length - before} SVGs`)
  }
  // Stale vendor files are harmless and excluded from the catalog; never delete local additions.
  icons.sort((a, b) => a.id.localeCompare(b.id))
  writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify({ version: 1, sources, icons }, null, 2) + '\n',
  )
  console.log(`Cataloged ${icons.length} icons in assets/icons/manifest.json`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
