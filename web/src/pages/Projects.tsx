import { A } from '@solidjs/router';
import { createMemo, createResource, createSignal, For, Match, Show, Switch } from 'solid-js';
import { api, type Project, type ProjectFile, rawUrl, timeAgo } from '../api';
import { FrameThumb, kindTag } from '../components/bits';
import { Icon } from '../components/Icon';
import { store } from '../store';

/** The file that best represents a project: index.html, newest page, newest image. */
export function coverFile(files: ProjectFile[]): ProjectFile | undefined {
  return (
    files.find((f) => f.path === 'index.html') ??
    files.find((f) => f.kind === 'html') ??
    files.find((f) => f.kind === 'image')
  );
}

function Cover(props: { project: Project }) {
  const [files] = createResource(() => props.project.updatedAt, () => api.files(props.project.id).catch(() => []));
  const cover = createMemo(() => coverFile(files() ?? []));
  return (
    <div class="cover">
      <Switch fallback={<div class="empty">{files.loading ? '' : 'Empty'}</div>}>
        <Match when={cover()?.kind === 'html'}>
          <FrameThumb src={rawUrl(props.project.id, cover()!.path, cover()!.mtime)} />
        </Match>
        <Match when={cover()?.kind === 'image'}>
          <img src={rawUrl(props.project.id, cover()!.path)} alt="" style={{ width: '100%', height: '100%', 'object-fit': 'cover' }} />
        </Match>
      </Switch>
    </div>
  );
}

export function Projects() {
  const [filter, setFilter] = createSignal('all');
  const [q, setQ] = createSignal('');
  const list = createMemo(() =>
    (store.projects() ?? [])
      .filter((p) => filter() === 'all' || kindTag(p.metadata.kind).label === filter())
      .filter((p) => !q() || p.name.toLowerCase().includes(q().toLowerCase())),
  );

  async function remove(p: Project) {
    if (!confirm(`Delete “${p.name}” and all its files?`)) return;
    await api.deleteProject(p.id);
    store.setProjects((ps) => (ps ?? []).filter((x) => x.id !== p.id));
  }

  async function rename(p: Project) {
    const name = prompt('Rename project', p.name)?.trim();
    if (!name || name === p.name) return;
    const updated = await api.patchProject(p.id, { name });
    store.setProjects((ps) => (ps ?? []).map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
  }

  return (
    <div class="page">
      <div class="page-head">
        <h1>All projects</h1>
        <A href="/" class="btn dark">
          <Icon name="plus" size={14} /> New project
        </A>
      </div>
      <div class="toolbar-row">
        <div class="seg">
          <For each={['all', 'Prototype', 'Slides', 'Template', 'Media', 'Design System']}>
            {(f) => (
              <button classList={{ on: filter() === f }} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Any type' : f}
              </button>
            )}
          </For>
        </div>
        <input class="input" style={{ width: '260px', 'margin-left': 'auto' }} placeholder="Search projects" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <Show when={list().length} fallback={<div class="empty-state">{store.projects.loading ? 'Loading…' : 'No projects yet. Start one from Home.'}</div>}>
        <div class="grid">
          <For each={list()}>
            {(p) => {
              const tag = kindTag(p.metadata.kind);
              return (
                <div class="card">
                  <A href={`/projects/${p.id}`}>
                    <Cover project={p} />
                  </A>
                  <div class="menu">
                    <button class="icon-btn" title="Rename" onClick={() => rename(p)}>
                      <Icon name="edit" size={14} />
                    </button>{' '}
                    <button class="icon-btn" title="Delete" onClick={() => remove(p)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <A href={`/projects/${p.id}`} class="name">
                    {p.name}
                  </A>
                  <div class="meta">
                    <span>{timeAgo(p.updatedAt)}</span>
                    <span class={`tag ${tag.cls}`}>{tag.label}</span>
                    <Show when={['running', 'queued'].includes(p.status?.value ?? '')}>
                      <span class="running-dot" title="Running" />
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
