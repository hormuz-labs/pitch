import { useNavigate } from '@solidjs/router';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { api, previewUrl, type Skill } from '../api';
import { FrameThumb, Initials, Markdown } from '../components/bits';
import { Icon } from '../components/Icon';
import { store } from '../store';

const MODE_LABELS: Record<string, string> = {
  prototype: 'Web & apps',
  deck: 'Slides',
  'design-system': 'Design systems',
  image: 'Image',
  video: 'Motion & video',
  audio: 'Audio',
  template: 'Documents',
  utility: 'Utilities',
};

export function Library() {
  const navigate = useNavigate();
  const [source, setSource] = createSignal<'template' | 'skill'>('template');
  const [mode, setMode] = createSignal('all');
  const [q, setQ] = createSignal('');
  const [open, setOpen] = createSignal<Skill | null>(null);

  const inSource = createMemo(() => (store.skills() ?? []).filter((s) => s.source === source()));
  const modes = createMemo(() => {
    const seen = new Set(inSource().map((s) => s.mode ?? 'other'));
    return ['all', ...Object.keys(MODE_LABELS).filter((m) => seen.has(m)), ...(seen.has('other') ? ['other'] : [])];
  });
  const list = createMemo(() => {
    const needle = q().toLowerCase();
    return inSource()
      .filter((s) => mode() === 'all' || (s.mode ?? 'other') === mode())
      .filter((s) => !needle || `${s.name} ${s.description} ${s.tags.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  });

  function tryIt(s: Skill) {
    store.setHandoff({ skill: s, prompt: s.examplePrompt ?? '' });
    navigate('/');
  }

  return (
    <div class="page">
      <div class="page-head">
        <h1>Plugins</h1>
      </div>
      <div class="toolbar-row">
        <div class="seg">
          <button classList={{ on: source() === 'template' }} onClick={() => { setSource('template'); setMode('all'); }}>
            Templates
          </button>
          <button classList={{ on: source() === 'skill' }} onClick={() => { setSource('skill'); setMode('all'); }}>
            Skills
          </button>
        </div>
        <input class="input" style={{ width: '360px', 'margin-left': 'auto' }} placeholder="Search" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <div class="cats">
        <For each={modes()}>
          {(m) => (
            <button classList={{ on: mode() === m }} onClick={() => setMode(m)}>
              {m === 'all' ? 'All' : MODE_LABELS[m] ?? 'Other'}
            </button>
          )}
        </For>
      </div>
      <div class="lib-grid">
        <For each={list()}>
          {(s) => (
            <div class="lib-card" role="button" tabindex="0" onClick={() => setOpen(s)} onKeyDown={(e) => e.key === 'Enter' && setOpen(s)}>
              <Initials name={s.name} />
              <div class="body">
                <div class="title">{s.name}</div>
                <div class="desc">{s.description}</div>
              </div>
              <button
                class="btn small"
                onClick={(e) => {
                  e.stopPropagation();
                  tryIt(s);
                }}
              >
                Try it
              </button>
            </div>
          )}
        </For>
      </div>
      <Show when={open()}>
        <SkillModal skill={open()!} onClose={() => setOpen(null)} onTry={tryIt} />
      </Show>
    </div>
  );
}

function SkillModal(props: { skill: Skill; onClose: () => void; onTry: (s: Skill) => void }) {
  const [detail] = createResource(() => props.skill.id, (id) => api.skill(id));
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-label={props.skill.name}>
        <div class="modal-head">
          <Initials name={props.skill.name} />
          <h3>{props.skill.name}</h3>
          <button class="btn dark" onClick={() => props.onTry(props.skill)}>
            <Icon name="sparkle" size={14} /> Try it
          </button>
          <button class="icon-btn" onClick={props.onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div class="modal-body">
          <div>
            <p class="muted" style={{ 'margin-top': 0 }}>{props.skill.description}</p>
            <Show when={props.skill.examplePrompt}>
              <div class="section-label">Example brief</div>
              <div class="prose">{props.skill.examplePrompt}</div>
            </Show>
            <div class="section-label">Workflow</div>
            <Show when={detail()} fallback={<div class="muted">Loading…</div>}>
              <Markdown text={detail()!.body.slice(0, 6000)} />
            </Show>
          </div>
          <Show when={detail()?.hasExample}>
            <div>
              <div class="pv">
                <FrameThumb src={previewUrl(`/skills/${props.skill.id}/example`)} />
              </div>
              <a class="btn small" style={{ 'margin-top': '10px' }} href={previewUrl(`/skills/${props.skill.id}/example`)} target="_blank" rel="noreferrer">
                <Icon name="external" size={13} /> Open example
              </a>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
