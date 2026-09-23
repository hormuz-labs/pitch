#!/usr/bin/env node
// Render environment-specific manifests before Kustomize hashes the ConfigMap.
//
//   node scripts/render-gke.mjs             the application (infra/gke via kustomize)
//   node scripts/render-gke.mjs migrate     the per-release migration Job, applied first
//   node scripts/render-gke.mjs tailscale   the subnet router putting the VPC on the tailnet
//   node scripts/render-gke.mjs node        an egress Service for one worker machine on the tailnet
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const image = /^[a-z0-9][a-z0-9./_:-]*@sha256:[a-f0-9]{64}$/
const bucketName = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/
const values = {
  API_IMAGE: image,
  BOT_IMAGE: image,
  API_HOST: /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/,
  // Further hosts the same load balancer answers for (comma-separated, may be
  // empty): each gets its own ManagedCertificate, issued once its DNS lands.
  API_EXTRA_HOSTS: /^(?:[a-z0-9]+(?:[.-][a-z0-9]+)+(?:,[a-z0-9]+(?:[.-][a-z0-9]+)+)*)?$/,
  APP_URL: /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\/)?$/,
  MEDIA_PUBLIC_URL: /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\/[a-zA-Z0-9._/-]*)?$/,
  GKE_STATIC_IP_NAME: /^[a-z][a-z0-9-]*$/,
  // Cloud Storage bucket names are global; each deployment names its own.
  MEDIA_BUCKET: bucketName,
  PROFILES_BUCKET: bucketName,
  WORKSPACE_BUCKET: bucketName,
  // Names the migration Job; a Job is immutable, so every release needs a new one.
  RELEASE: /^[a-z0-9][a-z0-9-]{0,39}$/,
  // Tailscale: the VPC CIDRs the cluster advertises, and one external worker node.
  TAILSCALE_ROUTES: /^(?:\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2})(?:,\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2})*$/,
  NODE_NAME: /^[a-z0-9][a-z0-9-]{0,30}$/,
  NODE_TAILNET_FQDN: /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/,
}
// What each mode renders and which variables it needs. `app` is the
// kustomization; the others are single files applied on their own.
const standalone = {
  // The Job runs before the app is applied, so it brings the namespace and
  // Kubernetes service account along.
  migrate: {
    files: ['namespace.yaml', 'service-account.yaml', 'migrate.yaml'],
    needs: ['API_IMAGE', 'RELEASE'],
  },
  tailscale: { file: 'tailscale/connector.yaml', needs: ['TAILSCALE_ROUTES'] },
  node: { file: 'tailscale/node.yaml', needs: ['NODE_NAME', 'NODE_TAILNET_FQDN'] },
}
const mode = process.argv[2] ?? 'app'
if (mode !== 'app' && !(mode in standalone)) throw new Error(`Unknown mode: ${mode} (app, ${Object.keys(standalone).join(', ')})`)
const appNeeds = Object.keys(values).filter(k => !['RELEASE', 'TAILSCALE_ROUTES', 'NODE_NAME', 'NODE_TAILNET_FQDN'].includes(k))
const needed = mode === 'app' ? appNeeds : standalone[mode].needs
for (const name of needed) {
  if (!values[name].test(process.env[name] ?? '')) throw new Error(`Set a valid ${name}; images must use immutable sha256 digests`)
}
const extraHosts = (process.env.API_EXTRA_HOSTS ?? '').split(',').filter(Boolean)
const derived = {
  MANAGED_CERTIFICATES: ['pitch', ...extraHosts.map((_h, i) => `pitch-${i + 2}`)].join(','),
  EXTRA_CERTIFICATES: extraHosts
    .map((host, i) => `---\napiVersion: networking.gke.io/v1\nkind: ManagedCertificate\nmetadata:\n  name: pitch-${i + 2}\nspec:\n  domains: ["${host}"]\n`)
    .join(''),
}
const substitute = yaml =>
  yaml.replace(/\$\{([A-Z_]+)\}/g, (_match, key) => {
    if (key in derived) return derived[key]
    if (!needed.includes(key)) throw new Error(`Unknown manifest variable: ${key}`)
    return process.env[key]
  })
const source = fileURLToPath(new URL('../infra/gke/', import.meta.url))
if (mode !== 'app') {
  const files = standalone[mode].files ?? [standalone[mode].file]
  process.stdout.write(files.map(f => substitute(readFileSync(path.join(source, f), 'utf8'))).join('\n---\n'))
  process.exit(0)
}
const dir = mkdtempSync(path.join(tmpdir(), 'pitch-gke-'))
try {
  // Only the kustomization's own files; the standalone ones live beside it.
  for (const name of readdirSync(source).filter(name => name.endsWith('.yaml') && name !== 'migrate.yaml'))
    writeFileSync(path.join(dir, name), substitute(readFileSync(path.join(source, name), 'utf8')))
  const result = spawnSync(process.env.KUSTOMIZE_BIN || 'kubectl', [process.env.KUSTOMIZE_BIN ? 'build' : 'kustomize', dir], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  process.stdout.write(result.stdout)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
