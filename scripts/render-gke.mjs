#!/usr/bin/env node
// Render environment-specific manifests before Kustomize hashes the ConfigMap.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const image = /^[a-z0-9][a-z0-9./_:-]*@sha256:[a-f0-9]{64}$/
const values = {
  API_IMAGE: image,
  CLOAK_IMAGE: image,
  API_HOST: /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/,
  APP_URL: /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\/)?$/,
  MEDIA_PUBLIC_URL: /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\/[a-zA-Z0-9._/-]*)?$/,
  GCP_SERVICE_ACCOUNT: /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/,
  CLOUD_SQL_CONNECTION_NAME: /^[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/,
  GKE_STATIC_IP_NAME: /^[a-z][a-z0-9-]*$/,
}
for (const [name, pattern] of Object.entries(values)) {
  if (!pattern.test(process.env[name] ?? '')) throw new Error(`Set a valid ${name}; images must use immutable sha256 digests`)
}
const source = fileURLToPath(new URL('../infra/gke/', import.meta.url))
const dir = mkdtempSync(path.join(tmpdir(), 'pitch-gke-'))
try {
  for (const name of readdirSync(source).filter(name => name.endsWith('.yaml'))) {
    const yaml = readFileSync(path.join(source, name), 'utf8').replace(/\$\{([A-Z_]+)\}/g, (_match, key) => {
      if (!(key in values)) throw new Error(`Unknown manifest variable: ${key}`)
      return process.env[key]
    })
    writeFileSync(path.join(dir, name), yaml)
  }
  const result = spawnSync(process.env.KUSTOMIZE_BIN || 'kubectl', [process.env.KUSTOMIZE_BIN ? 'build' : 'kustomize', dir], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  process.stdout.write(result.stdout)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
