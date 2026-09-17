#!/usr/bin/env node
/** Offline icon search/import, usable by Pitch or any Node-capable agent harness. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const caches = new Map();
const normalize = value => String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function real(file) {
  try { return realpathSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    if (parent === file) return file;
    return path.join(real(parent), path.basename(file));
  }
}

function inside(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error('Use a relative path inside the library/workspace');
  const absolute = path.resolve(root, relative);
  const rel = path.relative(real(path.resolve(root)), real(absolute));
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    throw new Error(`Path escapes the library/workspace: ${relative}`);
  return absolute;
}

export function loadCatalog(root) {
  const file = inside(root, 'manifest.json');
  const stat = statSync(file);
  const key = `${stat.mtimeMs}:${stat.size}`;
  if (caches.get(file)?.key === key) return caches.get(file).catalog;
  const catalog = JSON.parse(readFileSync(file, 'utf8'));
  if (catalog.version !== 1 || !Array.isArray(catalog.icons) || !catalog.sources)
    throw new Error('Unsupported icon catalog');
  caches.set(file, { key, catalog });
  return catalog;
}

export function searchIcons(root, query, { collection, limit = 5 } = {}) {
  const catalog = loadCatalog(root);
  if (collection && !catalog.sources[collection]) throw new Error(`Unknown collection: ${collection}`);
  const needle = normalize(query);
  if (!needle) throw new Error('Search needs an icon name or concept');
  const terms = needle.split(' ');
  return catalog.icons.filter(icon => !collection || icon.collection === collection).map(icon => {
    const name = normalize(icon.name), slug = normalize(icon.id.split('/')[1]);
    const haystack = normalize([icon.name, icon.id, ...icon.tags].join(' '));
    if (!terms.every(term => haystack.includes(term))) return { icon, score: 0 };
    const score = (name === needle ? 100 : 0) + (slug === needle ? 80 : 0) +
      terms.reduce((sum, term) => sum + (name.split(' ').includes(term) ? 10 : 1), 0) +
      (icon.collection === 'svgl' && !icon.variant.startsWith('wordmark') ? 3 : 0);
    return { icon, score };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.icon.id.localeCompare(b.icon.id))
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)))
    .map(({ icon }) => ({ id: icon.id, name: icon.name, variant: icon.variant, color: icon.color }));
}

function writeUnchangedOrNew(file, bytes) {
  if (existsSync(file)) {
    if (!readFileSync(file).equals(Buffer.from(bytes))) throw new Error(`Existing file differs: ${file}. Choose a different output directory.`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes, { flag: 'wx' });
}

export function importIcons(root, workspace, ids, out = 'assets/icons') {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw new Error('Import 1–20 selected icon IDs');
  const catalog = loadCatalog(root);
  const output = inside(workspace, out);
  const ledgerFile = inside(workspace, path.join(out, 'attributions.json'));
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { version: 1, icons: [] };
  if (ledger.version !== 1 || !Array.isArray(ledger.icons)) throw new Error('Existing icon attribution file is not a library ledger');
  const selected = [...new Set(ids)].map(id => {
    const icon = catalog.icons.find(icon => icon.id === id);
    if (!icon) throw new Error(`Unknown icon ID: ${id}. Search the catalog first.`);
    const source = catalog.sources[icon.collection];
    const bytes = readFileSync(inside(root, icon.file));
    if (createHash('sha256').update(bytes).digest('hex') !== icon.sha256) throw new Error(`Icon checksum changed: ${id}`);
    const file = path.join(out, icon.file).split(path.sep).join('/');
    const dest = inside(workspace, file);
    const licenses = source.licenseFiles.map(name => {
      const relative = `licenses/${icon.collection}/${name}`;
      return { file: inside(workspace, path.join(out, relative)), bytes: readFileSync(inside(root, relative)) };
    });
    return { icon, source, bytes, file, dest, licenses };
  });
  for (const { icon, source, bytes, file, dest, licenses } of selected) {
    writeUnchangedOrNew(dest, bytes);
    for (const license of licenses) writeUnchangedOrNew(license.file, license.bytes);
    const attribution = { ...icon, file, repository: source.repository, revision: source.revision, license: source.license, licenseFiles: source.licenseFiles.map(name => `${out}/licenses/${icon.collection}/${name}`) };
    const index = ledger.icons.findIndex(entry => entry.file === file);
    if (index < 0) ledger.icons.push(attribution);
    else ledger.icons[index] = attribution;
  }
  mkdirSync(output, { recursive: true });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  return { files: selected.map(({ icon, file }) => ({ id: icon.id, file, variant: icon.variant })), attributions: path.join(out, 'attributions.json').split(path.sep).join('/') };
}

export function collections(root) {
  const catalog = loadCatalog(root);
  return Object.entries(catalog.sources).map(([id, source]) => ({ id, count: catalog.icons.filter(icon => icon.collection === id).length, ...source }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = {}, values = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${args[i]}`);
        options[args[i].slice(2)] = args[++i];
      } else values.push(args[i]);
    }
    const root = path.resolve(options.library || process.env.ICON_LIBRARY_DIR || 'assets/icons');
    let result;
    if (command === 'search') result = searchIcons(root, values.join(' '), options);
    else if (command === 'import') result = importIcons(root, path.resolve(options.workspace || '.'), values.flatMap(v => v.split(',')), options.out);
    else if (command === 'collections') result = collections(root);
    else throw new Error('Usage: icons.mjs search <query> | import <ids...> | collections [--library <catalog-directory>]');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
