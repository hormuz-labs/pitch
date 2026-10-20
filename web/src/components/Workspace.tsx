import { createEffect, createResource, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js';
import { api, PREVIEW_SANDBOX, type ProjectFile, rawUrl, withToken } from '../api';
import { FrameThumb, formatBytes, Markdown } from './bits';
import { Icon } from './Icon';

type Viewport = 'desktop' | 'tablet' | 'mobile';
const SIZES: Record<Viewport, [number, number] | null> = { desktop: null, tablet: [820, 1180], mobile: [390, 844] };

export function Workspace(props: {
  projectId: string;
  files: ProjectFile[];
  tabs: string[];
  active: string;
  versions: Record<string, number>;
  onActivate: (tab: string) => void;
  onClose: (tab: string) => void;
  onUploaded: () => void;
}) {
  const file = () => props.files.find((f) => f.path === props.active);
  const [dragging, setDragging] = createSignal(false);

  async function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    await api.upload(props.projectId, files);
    props.onUploaded();
  }

  return (
    <section
      class="workspace"
      style={{ position: 'relative' }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={drop}
    >
      <div class="tabs" role="tablist">
        <button class="tab" classList={{ on: props.active === '' }} onClick={() => props.onActivate('')} role="tab">
          <Icon name="grid" size={14} />
          <span>Design Files</span>
        </button>
        <For each={props.tabs}>
          {(t) => (
            <button class="tab" classList={{ on: props.active === t }} onClick={() => props.onActivate(t)} role="tab" title={t}>
              <Icon name={kindIcon(props.files.find((f) => f.path === t))} size={14} />
              <span>{t.split('/').pop()}</span>
              <span
                class="x"
                role="button"
                aria-label={`Close ${t}`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(t);
                }}
              >
                ×
              </span>
            </button>
          )}
        </For>
      </div>
      <Show
        when={props.active && file()}
        fallback={<FilesPanel projectId={props.projectId} files={props.files} onOpen={props.onActivate} onChanged={props.onUploaded} />}
      >
        <Viewer projectId={props.projectId} file={file()!} version={props.versions[props.active] ?? 0} />
      </Show>
      <Show when={dragging()}>
        <div class="drop-hint">Drop files to add them to the project</div>
      </Show>
    </section>
  );
}

function kindIcon(f?: ProjectFile): string {
  if (!f) return 'file';
  if (f.artifactManifest?.kind === 'deck') return 'slides';
  return { html: 'monitor', image: 'image', video: 'film', audio: 'wave', text: 'doc', code: 'code' }[f.kind] ?? 'file';
}

function Viewer(props: { projectId: string; file: ProjectFile; version: number }) {
  const [mode, setMode] = createSignal<'preview' | 'code'>('preview');
  const [viewport, setViewport] = createSignal<Viewport>('desktop');
  const [reloadKey, setReloadKey] = createSignal(0);
  const [slide, setSlide] = createSignal<{ active: number; count: number } | null>(null);
  const [menu, setMenu] = createSignal(false);
  let frame: HTMLIFrameElement | undefined;

  const isHtml = () => props.file.kind === 'html';
  const isDeck = () => props.file.artifactManifest?.kind === 'deck' || slide() !== null;
  const textLike = () => ['text', 'code'].includes(props.file.kind) || (isHtml() && mode() === 'code') || props.file.path.endsWith('.svg') && mode() === 'code';
  const src = () => rawUrl(props.projectId, props.file.path, props.version * 1000 + reloadKey() + 1);
  const [text] = createResource(
    () => (textLike() || props.file.kind === 'text' ? `${props.file.path}#${props.version}#${reloadKey()}` : null),
    () => fetch(rawUrl(props.projectId, props.file.path, Date.now())).then((r) => r.text()),
  );

  createEffect(on(() => props.file.path, () => { setSlide(null); setMode('preview'); }));

  onMount(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data as { type?: string; active?: number; count?: number };
      if (d?.type === 'od:slide-state' && typeof d.count === 'number') setSlide({ active: d.active ?? 0, count: d.count });
      if (d?.type === 'od:deck-ready' && !slide()) setSlide({ active: 0, count: 0 });
    };
    window.addEventListener('message', onMsg);
    onCleanup(() => window.removeEventListener('message', onMsg));
  });

  const go = (action: string) => frame?.contentWindow?.postMessage({ type: 'od:slide', action }, '*');
  const size = () => SIZES[viewport()];

  async function exportHtml() {
    setMenu(false);
    const blob = await api.exportHtml(props.projectId, props.file.path);
    downloadBlob(blob, props.file.path.split('/').pop() ?? 'export.html');
  }

  return (
    <>
      <div class="viewer-bar">
        <button class="icon-btn" title="Reload" onClick={() => setReloadKey((k) => k + 1)}>
          <Icon name="refresh" size={15} />
        </button>
        <Show when={isHtml() || props.file.path.endsWith('.svg')}>
          <div class="seg">
            <button classList={{ on: mode() === 'preview' }} onClick={() => setMode('preview')}>Preview</button>
            <button classList={{ on: mode() === 'code' }} onClick={() => setMode('code')}>Code</button>
          </div>
        </Show>
        <Show when={isHtml() && mode() === 'preview' && !isDeck()}>
          <button class="icon-btn" classList={{ active: viewport() === 'desktop' }} title="Desktop" onClick={() => setViewport('desktop')}>
            <Icon name="monitor" size={15} />
          </button>
          <button class="icon-btn" classList={{ active: viewport() === 'tablet' }} title="Tablet 820×1180" onClick={() => setViewport('tablet')}>
            <Icon name="tablet" size={15} />
          </button>
          <button class="icon-btn" classList={{ active: viewport() === 'mobile' }} title="Mobile 390×844" onClick={() => setViewport('mobile')}>
            <Icon name="phone" size={15} />
          </button>
        </Show>
        <span class="path">{props.file.path}</span>
        <span class="spacer" />
        <a class="icon-btn" title="Open in a new tab" href={src()} target="_blank" rel="noreferrer">
          <Icon name="external" size={15} />
        </a>
        <div style={{ position: 'relative' }}>
          <button class="btn dark small" onClick={() => setMenu(!menu())}>
            Export <Icon name="chevronDown" size={12} />
          </button>
          <Show when={menu()}>
            <div class="menu-pop" style={{ right: 0, top: '32px' }} onMouseLeave={() => setMenu(false)}>
              <Show when={isHtml()}>
                <button onClick={exportHtml}>
                  <Icon name="doc" size={14} /> Self-contained HTML
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    const w = window.open(src(), '_blank');
                    w?.addEventListener('load', () => w.print());
                  }}
                >
                  <Icon name="file" size={14} /> PDF (print)
                </button>
              </Show>
              <button
                onClick={() => {
                  setMenu(false);
                  location.href = withToken(`/api/projects/${props.projectId}/archive`);
                }}
              >
                <Icon name="download" size={14} /> Project as ZIP
              </button>
              <div class="sep" />
              <a href={rawUrl(props.projectId, props.file.path)} download={props.file.name}>
                <button>
                  <Icon name="download" size={14} /> Download {props.file.name}
                </button>
              </a>
            </div>
          </Show>
        </div>
      </div>
      <div class="stage" classList={{ device: !!size() && isHtml() && mode() === 'preview' && !isDeck(), deck: isDeck() && mode() === 'preview' }}>
        <Switch fallback={<div class="muted" style={{ margin: 'auto' }}>{props.file.name} · {formatBytes(props.file.size)}</div>}>
          <Match when={textLike()}>
            <Show when={props.file.path.endsWith('.md') && mode() === 'preview'} fallback={<pre class="code-view">{text() ?? ''}</pre>}>
              <div style={{ padding: '24px 32px', width: '100%', background: 'white', overflow: 'auto' }}>
                <Markdown text={text() ?? ''} />
              </div>
            </Show>
          </Match>
          <Match when={isHtml() || props.file.kind === 'pdf'}>
            <iframe
              ref={frame}
              class="preview"
              src={src()}
              sandbox={props.file.kind === 'pdf' ? undefined : PREVIEW_SANDBOX}
              title={props.file.path}
              style={size() ? { width: `${size()![0]}px`, height: `${size()![1]}px` } : undefined}
            />
          </Match>
          <Match when={props.file.kind === 'image' || props.file.path.endsWith('.svg')}>
            <img class="media-view" src={src()} alt={props.file.name} />
          </Match>
          <Match when={props.file.kind === 'video'}>
            <video class="media-view" src={src()} controls />
          </Match>
          <Match when={props.file.kind === 'audio'}>
            <audio src={src()} controls style={{ margin: 'auto' }} />
          </Match>
        </Switch>
        <Show when={isDeck() && mode() === 'preview'}>
          <div class="deck-pager">
            <button onClick={() => go('prev')} aria-label="Previous slide">
              <Icon name="chevronLeft" size={16} />
            </button>
            <span style={{ padding: '0 6px', 'min-width': '52px', 'text-align': 'center' }}>
              {slide() && slide()!.count ? `${slide()!.active + 1} / ${slide()!.count}` : 'Slides'}
            </span>
            <button onClick={() => go('next')} aria-label="Next slide">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </Show>
      </div>
    </>
  );
}

function FilesPanel(props: { projectId: string; files: ProjectFile[]; onOpen: (p: string) => void; onChanged: () => void }) {
  let input!: HTMLInputElement;
  async function remove(f: ProjectFile) {
    if (!confirm(`Delete ${f.path}?`)) return;
    await api.deleteFile(props.projectId, f.path);
    props.onChanged();
  }
  return (
    <div class="files-panel">
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '14px' }}>
        <h3 style={{ 'font-size': '15px', flex: 1 }}>Design Files</h3>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={async (e) => {
            const files = [...(e.currentTarget.files ?? [])];
            if (files.length) {
              await api.upload(props.projectId, files);
              props.onChanged();
            }
            e.currentTarget.value = '';
          }}
        />
        <button class="btn small" onClick={() => input.click()}>
          <Icon name="plus" size={13} /> Add files
        </button>
        <a class="btn small" href={withToken(`/api/projects/${props.projectId}/archive`)}>
          <Icon name="download" size={13} /> ZIP
        </a>
      </div>
      <Show when={props.files.length} fallback={<div class="empty-state">No files yet. They appear here as the agent writes them — or drop some in.</div>}>
        <div class="files-grid">
          <For each={props.files}>
            {(f) => (
              <div class="fcard">
                <button class="fcard" onClick={() => props.onOpen(f.path)} style={{ width: '100%' }}>
                  <div class="cover">
                    <Switch fallback={<Icon name={kindIcon(f)} size={22} />}>
                      <Match when={f.kind === 'html'}>
                        <FrameThumb src={rawUrl(props.projectId, f.path, f.mtime)} />
                      </Match>
                      <Match when={f.kind === 'image' || f.path.endsWith('.svg')}>
                        <img src={rawUrl(props.projectId, f.path, f.mtime)} alt="" style={{ width: '100%', height: '100%', 'object-fit': 'cover' }} />
                      </Match>
                    </Switch>
                  </div>
                  <div class="nm" title={f.path}>{f.path}</div>
                  <div class="sub">
                    {f.artifactManifest?.kind === 'deck' ? 'Slides' : f.kind} · {formatBytes(f.size)}
                  </div>
                </button>
                <button class="icon-btn del" title="Delete" onClick={() => remove(f)} style={{ background: 'rgba(255,255,255,.9)' }}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
