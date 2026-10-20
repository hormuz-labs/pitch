import { A, useNavigate } from '@solidjs/router';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { api, previewUrl, type Skill } from '../api';
import { FrameThumb } from '../components/bits';
import { Icon } from '../components/Icon';
import { store } from '../store';

type Chip = {
  id: string;
  label: string;
  icon: string;
  word: string;
  kind: string;
  skill?: string;
  /** Skill modes whose example prompts this chip shows. */
  modes: string[];
  placeholder: string;
  metadata?: Record<string, unknown>;
};

const CHIPS: Chip[] = [
  { id: 'prototype', label: 'Prototype', icon: 'monitor', word: 'a prototype', kind: 'prototype', modes: ['prototype'], placeholder: 'Prototype a dashboard for tracking orders' },
  { id: 'deck', label: 'Slide deck', icon: 'slides', word: 'a slide deck', kind: 'deck', modes: ['deck'], placeholder: 'A 10-slide investor pitch for a climate-tech startup' },
  { id: 'document', label: 'Document', icon: 'doc', word: 'a document', kind: 'other', skill: 'doc', modes: ['template'], placeholder: 'A one-page product brief for our Q3 launch' },
  { id: 'dashboard', label: 'Data report', icon: 'layers', word: 'a data report', kind: 'prototype', skill: 'data-report', modes: [], placeholder: 'Turn our weekly metrics into a readable report' },
  { id: 'web-clone', label: 'Website clone', icon: 'globe', word: 'a website clone', kind: 'prototype', skill: 'web-clone', modes: [], placeholder: 'Rebuild https://linear.app as a static page' },
  { id: 'motion', label: 'Motion design', icon: 'bolt', word: 'motion design', kind: 'other', skill: 'motion-design', modes: ['video'], placeholder: 'A 15-second kinetic type intro for our launch' },
  { id: 'webgl', label: 'WebGL', icon: 'cube', word: 'a WebGL scene', kind: 'prototype', skill: 'threejs', modes: [], placeholder: 'An interactive 3D product viewer for a sneaker' },
];

export function Home() {
  const navigate = useNavigate();
  const [chip, setChip] = createSignal<Chip>(CHIPS[0]!);
  const [prompt, setPrompt] = createSignal('');
  const [skill, setSkill] = createSignal<Skill | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  let textarea!: HTMLTextAreaElement;

  // "Try it" from the plugins page hands a skill over.
  createEffect(() => {
    const h = store.handoff();
    if (!h) return;
    setSkill(h.skill);
    setPrompt(h.prompt);
    store.setHandoff(null);
    queueMicrotask(() => textarea?.focus());
  });

  const chipSkill = createMemo(() => {
    const id = chip().skill;
    return id ? (store.skills() ?? []).find((s) => s.id === id) ?? null : null;
  });

  const examples = createMemo(() => {
    const c = chip();
    const all = (store.skills() ?? []).filter((s) => s.examplePrompt);
    const matching = all.filter((s) => (c.skill ? s.id === c.skill : c.modes.includes(s.mode ?? '')));
    const pool = matching.length ? matching : all.filter((s) => s.featured);
    return pool.sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 4);
  });

  const [placeholderIdx, setPlaceholderIdx] = createSignal(0);
  onMount(() => {
    const t = setInterval(() => setPlaceholderIdx((i) => i + 1), 4000);
    onCleanup(() => clearInterval(t));
  });
  const placeholder = () => {
    const ex = examples();
    const i = placeholderIdx() % (ex.length + 1);
    return i === 0 || !ex[i - 1]?.examplePrompt ? chip().placeholder : firstLine(ex[i - 1]!.examplePrompt!);
  };

  async function submit() {
    const text = prompt().trim();
    if (!text || busy()) return;
    setBusy(true);
    setError('');
    const chosen = skill() ?? chipSkill();
    const kind = skill() ? kindForSkill(skill()!) : chip().kind;
    try {
      const { project } = await api.createProject({
        skillId: chosen?.id ?? null,
        designSystemId: store.designSystemId(),
        pendingPrompt: text,
        metadata: { kind, ...(chip().metadata ?? {}) },
      });
      store.refreshProjects();
      navigate(`/projects/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div class="home">
      <h1>
        Let's create <span class="word">{skill() ? skill()!.name : chip().word}</span>
      </h1>
      <div class="sub">Good work starts here</div>
      <Show when={store.config() && !store.config()!.models.length}>
        <A href="/settings" class="applied" style={{ 'margin-bottom': '14px', background: 'var(--bg-subtle)', color: 'var(--text-strong)' }}>
          <Icon name="gear" size={13} /> Set up a model in Settings to start
        </A>
      </Show>
      <div class="composer-tray">
        <div class="composer">
          <Show when={skill()}>
            <span class="applied">
              <Icon name="sparkle" size={13} /> {skill()!.name}
              <button onClick={() => setSkill(null)} aria-label="Remove skill">
                <Icon name="x" size={12} />
              </button>
            </span>
          </Show>
          <textarea
            ref={textarea}
            rows={3}
            placeholder={placeholder()}
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div class="composer-foot">
            <DesignSystemPicker />
            <span class="spacer" />
            <ModelPicker />
            <button class="send" disabled={!prompt().trim() || busy()} onClick={submit} aria-label="Send">
              <Icon name="arrowUp" size={18} />
            </button>
          </div>
        </div>
        <div class="tray-strip">
          <Icon name="folder" size={13} />
          A new project folder is created for this brief
          <Show when={error()}>
            <span style={{ color: 'var(--red)', 'margin-left': 'auto' }}>{error()}</span>
          </Show>
        </div>
      </div>

      <div class="chips">
        <For each={CHIPS}>
          {(c) => (
            <button class="chip" classList={{ active: chip().id === c.id && !skill() }} onClick={() => { setChip(c); setSkill(null); }}>
              <Icon name={c.icon} size={15} />
              {c.label}
            </button>
          )}
        </For>
      </div>

      <Show when={examples().length}>
        <div class="examples">
          <h3>Try an example</h3>
          <For each={examples()}>
            {(s) => (
              <button
                class="example"
                onClick={() => {
                  setSkill(s);
                  setPrompt(s.examplePrompt ?? '');
                  textarea.focus();
                }}
              >
                <div class="thumb">
                  <FrameThumb src={previewUrl(`/skills/${s.id}/example`)} />
                </div>
                <div>
                  <div class="title">✦ {s.name}</div>
                  <div class="prompt">{s.examplePrompt}</div>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function firstLine(s: string): string {
  const line = s.split('\n')[0] ?? s;
  return line.length > 90 ? line.slice(0, 88) + '…' : line;
}

export function kindForSkill(s: Skill): string {
  switch (s.mode) {
    case 'deck':
      return 'deck';
    case 'image':
    case 'video':
    case 'audio':
      return s.mode;
    case 'design-system':
      return 'brand';
    case 'template':
      return 'template';
    default:
      return 'prototype';
  }
}

export function DesignSystemPicker() {
  return (
    <label class="picker" title="Design system">
      <Icon name="palette" size={14} />
      <select
        value={store.designSystemId() ?? ''}
        onChange={(e) => store.setDesignSystemId(e.currentTarget.value || null)}
      >
        <option value="">No design system</option>
        <For each={store.designSystems() ?? []}>{(d) => <option value={d.id}>{d.name}</option>}</For>
      </select>
    </label>
  );
}

export function ModelPicker() {
  return (
    <Show when={(store.config()?.models.length ?? 0) > 0}>
      <label class="picker" title="Model">
        <Icon name="sparkle" size={14} />
        <select value={store.model()} onChange={(e) => store.setModel(e.currentTarget.value)}>
          <For each={store.config()?.models ?? []}>{(m) => <option value={m}>{m}</option>}</For>
        </select>
      </label>
    </Show>
  );
}
