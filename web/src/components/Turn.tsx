import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js';
import { type ChatMessage, type ProjectFile, rawUrl, type TurnEvent } from '../api';
import { FrameThumb, Markdown } from './bits';
import { Icon } from './Icon';
import { extractForm, QuestionForm } from './QuestionForm';

const HOST_MARKERS = /<od-title>[\s\S]*?<\/od-title>|<od-next\b[^>]*\/>|<od-focus\b[^>]*\/>/g;
// A marker that is still streaming in: hide it until it is complete.
const PARTIAL_TAIL = /<(?:o(?:d(?:-[a-z]*)?)?)?(?:\s[^>]*)?$|<od-title>[^<]*$/;

export function cleanText(text: string, live: boolean): string {
  let t = text.replace(HOST_MARKERS, '');
  if (live) t = t.replace(PARTIAL_TAIL, '');
  return t;
}

type Row =
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown>; result?: { content: string; isError?: boolean }; startedAt?: number; completedAt?: number }
  | { type: 'thinking'; text: string }
  | { type: 'narration'; text: string };

type Todo = { content: string; status: string };

function toolTitle(name: string): { icon: string; label: string } {
  switch (name) {
    case 'write_file':
      return { icon: 'file', label: 'Write' };
    case 'edit_file':
      return { icon: 'edit', label: 'Edit' };
    case 'read_file':
      return { icon: 'read', label: 'Read' };
    case 'delete_file':
      return { icon: 'trash', label: 'Delete' };
    case 'list_files':
      return { icon: 'list', label: 'List files' };
    case 'search_files':
      return { icon: 'search', label: 'Search' };
    case 'web_fetch':
      return { icon: 'globe', label: 'Fetch' };
    case 'download_asset':
      return { icon: 'download', label: 'Download' };
    case 'directions':
      return { icon: 'palette', label: 'Direction' };
    case 'design_system_read':
      return { icon: 'palette', label: 'Design system' };
    case 'load_skill':
      return { icon: 'sparkle', label: 'Skill' };
    default:
      return { icon: 'bolt', label: name.replace(/_/g, ' ') };
  }
}

function toolTarget(input: Record<string, unknown>): string {
  const v = input.path ?? input.url ?? input.id ?? input.pattern ?? input.name;
  return typeof v === 'string' ? v : '';
}

/** Split a turn's events into the execution log and the answer. */
function buildTurn(events: TurnEvent[], live: boolean) {
  const key = events.find((e) => e.kind === 'done_key') as { key: string } | undefined;
  const marker = key ? `<od-done key="${key.key}"/>` : null;
  const rows: Row[] = [];
  const toolIndex = new Map<string, number>();
  let todos: Todo[] | null = null;
  let text = '';
  let textSinceTool = '';
  let afterDone = '';
  let doneSeen = false;
  let nextSteps: string[] = [];
  let lastTool = -1;

  for (const ev of events) {
    switch (ev.kind) {
      case 'text': {
        text += ev.text;
        if (doneSeen) {
          afterDone += ev.text;
          break;
        }
        textSinceTool += ev.text;
        if (marker && textSinceTool.includes(marker)) {
          const [before, after] = textSinceTool.split(marker, 2) as [string, string];
          if (before.trim()) rows.push({ type: 'narration', text: before });
          afterDone = after;
          textSinceTool = '';
          doneSeen = true;
        }
        break;
      }
      case 'thinking':
        if (ev.text.trim()) rows.push({ type: 'thinking', text: ev.text });
        break;
      case 'tool_use':
        if (textSinceTool.trim()) rows.push({ type: 'narration', text: textSinceTool });
        textSinceTool = '';
        if (ev.name === 'todo_write' && Array.isArray(ev.input.todos)) {
          todos = ev.input.todos as Todo[];
        } else {
          toolIndex.set(ev.id, rows.length);
          lastTool = rows.length;
          rows.push({ type: 'tool', id: ev.id, name: ev.name, input: ev.input, startedAt: ev.startedAt });
        }
        break;
      case 'tool_result': {
        const i = toolIndex.get(ev.toolUseId);
        if (i !== undefined) {
          const row = rows[i] as Extract<Row, { type: 'tool' }>;
          rows[i] = { ...row, result: { content: ev.content, isError: ev.isError }, completedAt: ev.completedAt };
        }
        break;
      }
      case 'next_steps':
        nextSteps = ev.suggestions;
        break;
    }
  }
  // No done marker: the text after the last tool call is the answer.
  let answer = doneSeen ? afterDone : textSinceTool;
  if (!doneSeen && live) answer = textSinceTool;
  if (!doneSeen && lastTool === -1 && !live) answer = text;
  const narration = rows.filter((r) => r.type === 'narration').map((r) => (r as { text: string }).text);
  if (!doneSeen && lastTool === -1) {
    // A plain answer with no tools: nothing goes in the panel but thinking.
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.type === 'narration') rows.splice(i, 1);
    answer = text;
  }
  return { rows, todos, answer: cleanText(answer, live), nextSteps, hasWork: rows.length > 0 || !!todos, narration };
}

function useNow(active: () => boolean) {
  const [now, setNow] = createSignal(Date.now());
  const t = setInterval(() => active() && setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(t));
  return now;
}

function secs(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function AssistantTurn(props: {
  message: ChatMessage;
  projectId: string;
  isLast: boolean;
  onSend: (text: string) => void;
  onOpenFile: (path: string) => void;
  formAnswered: boolean;
}) {
  const live = () => props.message.runStatus === 'running' || props.message.runStatus === 'queued';
  const turn = createMemo(() => buildTurn(props.message.events, live()));
  const [open, setOpen] = createSignal(false);
  const now = useNow(live);
  const elapsed = () => {
    const start = props.message.startedAt ?? props.message.createdAt;
    const end = props.message.endedAt ?? (live() ? now() : start);
    return secs(end - start);
  };
  const failed = () => props.message.runStatus === 'failed';
  const canceled = () => props.message.runStatus === 'canceled';
  const errorText = () =>
    [...props.message.events].reverse().find((e) => e.kind === 'status' && e.label === 'error') as { detail?: string } | undefined;
  const parts = createMemo(() => extractForm(turn().answer));
  const label = () => {
    if (live()) {
      const last = [...turn().rows].reverse().find((r) => r.type === 'tool') as Extract<Row, { type: 'tool' }> | undefined;
      if (last && !last.result) return `${toolTitle(last.name).label} ${toolTarget(last.input)}`.trim();
      return props.message.events.length > 1 ? 'Working' : 'Thinking';
    }
    if (failed()) return 'Failed';
    if (canceled()) return 'Stopped';
    return 'Done';
  };

  return (
    <div class="msg-assistant">
      <div class="who">
        <span class="avatar">◆</span>
        Studio
      </div>
      <Show when={turn().hasWork || live()}>
        <div class="exec">
          <button class="exec-head" onClick={() => setOpen(!open())} aria-expanded={open()}>
            <Show when={live()} fallback={<Icon name={failed() ? 'x' : 'check'} size={14} />}>
              <span class="spinner" />
            </Show>
            <span class="lbl" classList={{ live: live() }}>
              {label()}
            </span>
            <span class="muted" style={{ 'font-size': '12px' }}>{elapsed()}</span>
            <Icon name="chevronDown" size={14} />
          </button>
          <Show when={turn().todos}>
            <div class="todos" style={{ 'border-top': '1px solid var(--border-soft)' }}>
              <For each={turn().todos!}>
                {(t) => (
                  <div class="todo" classList={{ done: t.status === 'completed', doing: t.status === 'in_progress' }}>
                    <span class="box">{t.status === 'completed' ? '✓' : ''}</span>
                    <span>{t.content}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={open() || (live() && turn().rows.length > 0)}>
            <div class="exec-body">
              <For each={open() ? turn().rows : turn().rows.slice(-6)}>
                {(r) => (
                  <Switch>
                    <Match when={r.type === 'tool' && r}>
                      {(row) => {
                        const t = toolTitle(row().name);
                        const target = toolTarget(row().input);
                        const isFile = ['write_file', 'edit_file', 'read_file', 'download_asset'].includes(row().name) && target;
                        return (
                          <div class="tool-row" classList={{ err: !!row().result?.isError }} title={row().result?.content}>
                            <span class="ico">
                              <Show when={row().result || !live()} fallback={<span class="spinner" />}>
                                <Icon name={t.icon} size={14} />
                              </Show>
                            </span>
                            <span class="t">{t.label}</span>
                            <span class="file" classList={{ link: !!isFile }} onClick={() => isFile && props.onOpenFile(target)}>
                              {target}
                            </span>
                            <span class="r">
                              {row().result?.isError
                                ? 'failed'
                                : row().completedAt && row().startedAt
                                  ? secs(row().completedAt! - row().startedAt!)
                                  : ''}
                            </span>
                          </div>
                        );
                      }}
                    </Match>
                    <Match when={r.type === 'thinking' && r}>{(row) => <div class="thought">{row().text}</div>}</Match>
                    <Match when={r.type === 'narration' && r}>
                      {(row) => <Markdown class="prose narration" text={cleanText(row().text, live())} />}
                    </Match>
                  </Switch>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={parts().before.trim()}>
        <Markdown text={parts().before} />
      </Show>
      <Show when={parts().form}>
        <Show
          when={!props.formAnswered}
          fallback={<div class="answered">Answered “{parts().form!.title || 'the brief'}”.</div>}
        >
          <QuestionForm form={parts().form!} disabled={live()} onSubmit={props.onSend} />
        </Show>
      </Show>
      <Show when={parts().after.trim()}>
        <Markdown text={parts().after} />
      </Show>

      <Show when={(failed() || canceled()) && errorText()?.detail}>
        <div class="err-card">{errorText()!.detail}</div>
      </Show>

      <Show when={!live() && props.message.producedFiles.length}>
        <FileCards files={props.message.producedFiles} projectId={props.projectId} onOpen={props.onOpenFile} />
      </Show>

      <Show when={!live() && props.message.runStatus}>
        <div class="done-foot">
          <Show when={props.message.runStatus === 'succeeded'}>
            <span class="ok">✓ Done</span>
          </Show>
          <span>{elapsed()}</span>
        </div>
      </Show>

      <Show when={props.isLast && !live() && turn().nextSteps.length}>
        <div class="next-steps">
          <For each={turn().nextSteps}>
            {(s) => (
              <button onClick={() => props.onSend(s)}>
                <Icon name="external" size={13} />
                {s}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function FileCards(props: { files: ProjectFile[]; projectId: string; onOpen: (p: string) => void }) {
  const shown = () => {
    const pages = props.files.filter((f) => ['html', 'image', 'text', 'sketch', 'video', 'pdf'].includes(f.kind));
    return (pages.length ? pages : props.files).slice(0, 4);
  };
  return (
    <div class="file-cards">
      <For each={shown()}>
        {(f) => (
          <button class="file-card" onClick={() => props.onOpen(f.path)}>
            <div class="thumb">
              <Switch fallback={<div style={{ display: 'grid', 'place-items': 'center', height: '100%' }}><Icon name="file" /></div>}>
                <Match when={f.kind === 'html'}>
                  <FrameThumb src={rawUrl(props.projectId, f.path, f.mtime)} />
                </Match>
                <Match when={f.kind === 'image' || (f.kind === 'sketch' && f.path.endsWith('.svg'))}>
                  <img src={rawUrl(props.projectId, f.path, f.mtime)} alt="" style={{ width: '100%', height: '100%', 'object-fit': 'cover' }} />
                </Match>
              </Switch>
            </div>
            <div>
              <div class="fn">{f.path}</div>
              <div class="muted" style={{ 'font-size': '12px' }}>{f.artifactManifest?.kind === 'deck' ? 'Slide deck' : f.kind}</div>
            </div>
          </button>
        )}
      </For>
    </div>
  );
}
