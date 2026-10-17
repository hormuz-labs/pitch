import { A, useLocation } from '@solidjs/router';
import { For, type JSX, onCleanup, onMount } from 'solid-js';
import { APP_NAME } from '../api';
import { store } from '../store';
import { Icon } from './Icon';

export function Shell(props: { children?: JSX.Element }) {
  const loc = useLocation();
  const is = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p));
  onMount(() => {
    store.refreshProjects();
    const t = setInterval(() => store.refreshProjects(), 15000);
    onCleanup(() => clearInterval(t));
  });
  const link = (href: string, icon: string, label: string) => (
    <A href={href} class="rail-link" classList={{ active: is(href) }}>
      <Icon name={icon} size={18} />
      {label}
    </A>
  );
  return (
    <div class="shell">
      <nav class="rail">
        <div class="rail-brand">
          <span class="mark">◆</span>
          {APP_NAME}
        </div>
        {link('/', 'home', 'Home')}
        {link('/projects', 'grid', 'All projects')}
        {link('/design-systems', 'palette', 'Design systems')}
        {link('/plugins', 'puzzle', 'Plugins')}
        {link('/settings', 'gear', 'Settings')}
        <div class="rail-section">Recent projects</div>
        <div class="rail-recent">
          <For each={(store.projects() ?? []).slice(0, 14)}>
            {(p) => (
              <A href={`/projects/${p.id}`} title={p.name}>
                <Icon name="folder" size={15} />
                <span class="name">{p.name}</span>
                {['running', 'queued'].includes(p.status?.value ?? '') && <span class="running-dot" />}
              </A>
            )}
          </For>
        </div>
      </nav>
      <main class="main-card">{props.children}</main>
    </div>
  );
}
