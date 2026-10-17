import { useNavigate, useParams } from '@solidjs/router';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { api, previewUrl } from '../api';
import { FrameThumb, Initials, Markdown } from '../components/bits';
import { Icon } from '../components/Icon';
import { store } from '../store';

/** `--name: value` pairs from a tokens.css that look like colours. */
function colorTokens(css: string | null): { name: string; value: string }[] {
  if (!css) return [];
  const out: { name: string; value: string }[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /--([\w-]+)\s*:\s*([^;\n{}]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const value = m[2]!.trim();
    if (/^(#|rgb|hsl|oklch|oklab|color\()/i.test(value) && !out.some((o) => o.name === m![1])) {
      out.push({ name: m[1]!, value });
    }
  }
  return out.slice(0, 24);
}

export function DesignSystems() {
  const params = useParams();
  const navigate = useNavigate();
  const [q, setQ] = createSignal('');
  const list = createMemo(() =>
    (store.designSystems() ?? []).filter(
      (d) => !q() || `${d.name} ${d.category ?? ''}`.toLowerCase().includes(q().toLowerCase()),
    ),
  );
  const selectedId = () => params.id ?? list()[0]?.id;
  const [detail] = createResource(selectedId, (id) => api.designSystem(id));
  const colors = createMemo(() => colorTokens(detail()?.tokensCss ?? null));

  return (
    <div class="page">
      <div class="page-head">
        <h1>Design systems</h1>
        <span class="muted">{store.designSystems()?.length ?? 0} presets</span>
      </div>
      <div class="ds-layout">
        <div>
          <input class="input" placeholder="Search design systems" value={q()} onInput={(e) => setQ(e.currentTarget.value)} style={{ 'margin-bottom': '10px' }} />
          <div class="ds-list">
            <For each={list()}>
              {(d) => (
                <button class="ds-row" classList={{ on: d.id === selectedId() }} onClick={() => navigate(`/design-systems/${d.id}`)}>
                  <Initials name={d.name} />
                  <div>
                    <div class="nm">{d.name}</div>
                    <div class="cat">{d.category}</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="ds-detail">
          <Show when={detail()} fallback={<div class="muted">{detail.loading ? 'Loading…' : 'Pick a design system'}</div>}>
            {(d) => (
              <>
                <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <h2>{d().name}</h2>
                    <p class="muted">{d().description}</p>
                  </div>
                  <button
                    class="btn"
                    classList={{ dark: store.designSystemId() !== d().id }}
                    onClick={() => store.setDesignSystemId(store.designSystemId() === d().id ? null : d().id)}
                  >
                    <Icon name={store.designSystemId() === d().id ? 'check' : 'sparkle'} size={14} />
                    {store.designSystemId() === d().id ? 'Default for new projects' : 'Use for new projects'}
                  </button>
                </div>
                <Show when={colors().length}>
                  <div class="section-label">Color palette</div>
                  <div class="swatches">
                    <For each={colors()}>
                      {(c) => (
                        <div class="swatch-card">
                          <div class="chip-color" style={{ background: c.value }} />
                          <div class="lbl">
                            <div class="mono" style={{ 'font-size': '11px' }}>--{c.name}</div>
                            <div class="muted mono" style={{ 'font-size': '10.5px' }}>{c.value}</div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={d().previewPages.length}>
                  <div class="section-label">Previews</div>
                  <div class="ds-previews">
                    <For each={d().previewPages.slice(0, 6)}>
                      {(p) => (
                        <a class="pv" href={previewUrl(`/design-systems/${d().id}/files/${p.path}`)} target="_blank" rel="noreferrer">
                          <FrameThumb src={previewUrl(`/design-systems/${d().id}/files/${p.path}`)} />
                          <span class="cap">{p.title ?? p.role ?? p.path}</span>
                        </a>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={d().designMd}>
                  <div class="section-label">DESIGN.md</div>
                  <Markdown text={d().designMd!} />
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
