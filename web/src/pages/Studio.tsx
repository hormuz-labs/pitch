import { A, useParams } from '@solidjs/router';
import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import {
  api,
  APP_NAME,
  type ChatMessage,
  type Conversation,
  newId,
  type Project,
  type ProjectFile,
  type RunEvent,
  streamRun,
  type TurnEvent,
  withToken,
} from '../api';
import { Icon } from '../components/Icon';
import { AssistantTurn } from '../components/Turn';
import { Workspace } from '../components/Workspace';
import { ModelPicker } from './Home';
import { coverFile } from './Projects';
import { store } from '../store';

/** Fold a live run frame into the persisted event list. */
function applyFrame(events: TurnEvent[], ev: RunEvent): void {
  if (ev.event !== 'agent' || !ev.data) return;
  const d = ev.data;
  const appendText = (kind: 'text' | 'thinking', delta: string) => {
    const last = events[events.length - 1];
    if (last && last.kind === kind) (last as { text: string }).text += delta;
    else events.push({ kind, text: delta });
  };
  switch (d.type) {
    case 'text_delta':
      appendText('text', d.delta ?? '');
      break;
    case 'thinking_delta':
      appendText('thinking', d.delta ?? '');
      break;
    case 'tool_use':
      events.push({ kind: 'tool_use', id: d.id, name: d.name, input: d.input ?? {}, startedAt: d.startedAt });
      break;
    case 'tool_result':
      events.push({ kind: 'tool_result', toolUseId: d.toolUseId, content: d.content ?? '', isError: d.isError, completedAt: d.completedAt });
      break;
    case 'done_key':
      events.push({ kind: 'done_key', key: d.key });
      break;
    case 'next_steps':
      for (let i = events.length - 1; i >= 0; i--) if (events[i]!.kind === 'next_steps') events.splice(i, 1);
      events.push({ kind: 'next_steps', suggestions: d.suggestions ?? [] });
      break;
    case 'artifact_focus':
      events.push({ kind: 'artifact_focus', open: d.open, show: d.show });
      break;
    case 'status':
      if (d.label === 'error') events.push({ kind: 'status', label: 'error', detail: d.detail });
      break;
  }
}

export function Studio() {
  const params = useParams();
  const [project, setProject] = createSignal<Project | null>(null);
  const [conversations, setConversations] = createSignal<Conversation[]>([]);
  const [convId, setConvId] = createSignal<string | null>(null);
  const [messages, setMessages] = createStore<ChatMessage[]>([]);
  const [files, setFiles] = createSignal<ProjectFile[]>([]);
  const [tabs, setTabs] = createSignal<string[]>([]);
  const [active, setActive] = createSignal('');
  const [versions, setVersions] = createStore<Record<string, number>>({});
  const [draft, setDraft] = createSignal('');
  const [pending, setPending] = createSignal<ProjectFile[]>([]);
  const [runId, setRunId] = createSignal<string | null>(null);
  const [error, setError] = createSignal('');
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [chatW, setChatW] = createSignal(Number(localStorage.getItem('studio:chatW')) || 460);
  let thread!: HTMLDivElement;
  let attachInput!: HTMLInputElement;
  let abort: AbortController | null = null;
  let stick = true;

  const conversation = () => conversations().find((c) => c.id === convId());
  const running = () => runId() !== null;

  async function refreshFiles() {
    const list = await api.files(params.id).catch(() => files());
    setFiles(list);
    return list;
  }

  let refreshTimer: number | undefined;
  const refreshSoon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshFiles, 250);
  };

  function openFile(path: string) {
    if (!tabs().includes(path)) setTabs([...tabs(), path]);
    setActive(path);
  }

  function closeTab(path: string) {
    const next = tabs().filter((t) => t !== path);
    setTabs(next);
    if (active() === path) setActive(next[next.length - 1] ?? '');
  }

  async function loadConversation(cid: string) {
    abort?.abort();
    setRunId(null);
    setConvId(cid);
    const list = await api.messages(params.id, cid);
    setMessages(reconcile(list));
    scrollToEnd(true);
    // Re-attach to a run that is still going.
    const live = (await api.runs({ conversationId: cid, status: 'active' }).catch(() => []))[0];
    if (live) {
      const idx = messages.findIndex((m) => m.id === live.assistantMessageId);
      if (idx >= 0) {
        setMessages(idx, produce((m) => { m.events = []; m.runStatus = 'running'; }));
        follow(live.id, live.assistantMessageId);
      }
    }
  }

  onMount(async () => {
    try {
      const [p, convs, list] = await Promise.all([api.project(params.id), api.conversations(params.id), refreshFiles()]);
      setProject(p);
      setConversations(convs);
      const first = convs[0];
      if (first) await loadConversation(first.id);
      const cover = coverFile(list);
      if (cover) openFile(cover.path);
      if (p.pendingPrompt && first && messages.length === 0) {
        const text = p.pendingPrompt;
        await api.patchProject(p.id, { pendingPrompt: null });
        send(text);
      }
    } catch (e) {
      setError((e as Error).message);
    }

    const es = new EventSource(withToken(`/api/projects/${params.id}/events`));
    es.addEventListener('file-changed', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setVersions(d.path, (v) => (v ?? 0) + 1);
      refreshSoon();
    });
    es.addEventListener('conversation-title', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setConversations((cs) => cs.map((c) => (c.id === d.conversationId ? { ...c, title: d.title } : c)));
    });
    onCleanup(() => {
      es.close();
      abort?.abort();
    });
  });

  function scrollToEnd(force = false) {
    if (!thread) return;
    if (force || stick) requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
  }

  /** Stream a run into the assistant message, batching frames per animation frame. */
  function follow(id: string, assistantId: string) {
    setRunId(id);
    abort = new AbortController();
    const queue: RunEvent[] = [];
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const frames = queue.splice(0);
      const idx = messages.findIndex((m) => m.id === assistantId);
      if (idx < 0) return;
      batch(() => {
        setMessages(
          idx,
          produce((m) => {
            for (const f of frames) {
              if (f.event === 'start') m.runStatus = 'running';
              applyFrame(m.events, f);
              if (f.event === 'agent' && f.data?.type === 'artifact_focus' && f.data.open) {
                const path = f.data.open as string;
                queueMicrotask(() => refreshFiles().then(() => openFile(path)));
              }
              if (f.event === 'error') m.events.push({ kind: 'status', label: 'error', detail: f.data?.message });
              if (f.event === 'end') {
                m.runStatus = f.data?.status ?? 'succeeded';
                m.endedAt = Date.now();
              }
            }
          }),
        );
      });
      scrollToEnd();
    };
    streamRun(id, (ev) => {
      queue.push(ev);
      if (ev.event === 'end') {
        flush();
        finish();
      } else if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }, { signal: abort.signal }).catch((e) => {
      setError((e as Error).message);
      finish();
    });

    async function finish() {
      setRunId(null);
      const cid = convId();
      if (!cid) return;
      const [list, fs, convs] = await Promise.all([
        api.messages(params.id, cid).catch(() => null),
        refreshFiles(),
        api.conversations(params.id).catch(() => null),
      ]);
      if (list) setMessages(reconcile(list));
      if (convs) setConversations(convs);
      // Open what the turn produced when nothing is open yet.
      const last = list?.[list.length - 1];
      const produced = last?.producedFiles?.map((f) => f.path) ?? [];
      if (!active() && produced.length) {
        const best = coverFile(fs.filter((f) => produced.includes(f.path)));
        if (best) openFile(best.path);
      }
      store.refreshProjects();
      scrollToEnd();
    }
  }

  async function send(textArg?: string) {
    const text = (textArg ?? draft()).trim();
    const cid = convId();
    if (!text || !cid || running()) return;
    setError('');
    const userId = newId();
    const assistantId = newId();
    const attachments = pending().map((f) => f.path);
    const now = Date.now();
    setMessages(messages.length, {
      id: userId, role: 'user', content: text, events: [], attachments: pending().map((f) => ({ path: f.path, name: f.name })),
      producedFiles: [], runId: null, runStatus: null, startedAt: null, endedAt: null, createdAt: now,
    });
    setMessages(messages.length, {
      id: assistantId, role: 'assistant', content: '', events: [], attachments: [], producedFiles: [],
      runId: null, runStatus: 'queued', startedAt: now, endedAt: null, createdAt: now + 1,
    });
    if (!textArg) setDraft('');
    setPending([]);
    stick = true;
    scrollToEnd(true);
    try {
      const run = await api.createRun({
        projectId: params.id,
        conversationId: cid,
        message: text,
        userMessageId: userId,
        assistantMessageId: assistantId,
        attachments,
        model: store.model() || undefined,
        locale: navigator.language,
      });
      follow(run.runId, assistantId);
    } catch (e) {
      setError((e as Error).message);
      const idx = messages.findIndex((m) => m.id === assistantId);
      if (idx >= 0) setMessages(idx, produce((m) => { m.runStatus = 'failed'; m.events.push({ kind: 'status', label: 'error', detail: (e as Error).message }); }));
    }
  }

  async function stop() {
    const id = runId();
    if (id) await api.cancelRun(id).catch(() => {});
  }

  async function newChat() {
    setHistoryOpen(false);
    const c = await api.createConversation(params.id);
    setConversations([c, ...conversations()]);
    await loadConversation(c.id);
  }

  async function attach(list: FileList | null) {
    const chosen = [...(list ?? [])];
    if (!chosen.length) return;
    const saved = await api.upload(params.id, chosen, 'uploads');
    setPending([...pending(), ...saved]);
    refreshFiles();
  }

  // A form is answered once a later user message starts with its answer marker.
  const answeredForms = createMemo(() => {
    const out = new Set<string>();
    messages.forEach((m, i) => {
      if (m.role === 'assistant' && messages.slice(i + 1).some((n) => n.role === 'user')) out.add(m.id);
    });
    return out;
  });

  createEffect(on(chatW, (w) => localStorage.setItem('studio:chatW', String(w))));

  function startResize(e: PointerEvent) {
    const startX = e.clientX;
    const startW = chatW();
    const move = (ev: PointerEvent) => setChatW(Math.min(720, Math.max(345, startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div class="studio">
      <header class="studio-head">
        <A href="/" class="icon-btn" title={APP_NAME}>
          <Icon name="home" size={17} />
        </A>
        <span class="title">{project()?.name ?? ''}</span>
        <Show when={running()}>
          <span class="running-dot" title="Agent is working" />
        </Show>
        <span class="spacer" />
        <A href="/projects" class="btn ghost small">
          All projects
        </A>
      </header>
      <div class="split" style={{ '--chat-w': `${chatW()}px` }}>
        <section class="chat">
          <div class="chat-head">
            <div style={{ position: 'relative' }}>
              <button class="icon-btn" title="Conversations" onClick={() => setHistoryOpen(!historyOpen())}>
                <Icon name="history" size={16} />
              </button>
              <Show when={historyOpen()}>
                <div class="menu-pop" style={{ left: 0, top: '34px' }} onMouseLeave={() => setHistoryOpen(false)}>
                  <button onClick={newChat}>
                    <Icon name="plus" size={14} /> New conversation
                  </button>
                  <div class="sep" />
                  <For each={conversations()}>
                    {(c) => (
                      <button onClick={() => { setHistoryOpen(false); loadConversation(c.id); }} style={{ 'font-weight': c.id === convId() ? '600' : '400' }}>
                        {c.title ?? 'New conversation'}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <span class="conv-title">{conversation()?.title ?? 'New conversation'}</span>
            <button class="icon-btn" title="New conversation" onClick={newChat}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div
            class="thread"
            ref={thread}
            onScroll={() => (stick = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80)}
          >
            <Show when={messages.length === 0 && !error()}>
              <div class="muted" style={{ padding: '40px 12px', 'text-align': 'center' }}>Describe what to make. The agent writes the files; they show up on the right.</div>
            </Show>
            <For each={messages}>
              {(m, i) =>
                m.role === 'user' ? (
                  <div class="msg-user">
                    <Show when={m.attachments.length}>
                      <div class="attach-row">
                        <For each={m.attachments}>{(a) => <span class="attach-chip">{a.name ?? a.path}</span>}</For>
                      </div>
                    </Show>
                    <div class="bubble">{m.content.startsWith('[form answers') ? m.content.split('\n').slice(1).join('\n') : m.content}</div>
                  </div>
                ) : (
                  <AssistantTurn
                    message={m}
                    projectId={params.id}
                    isLast={i() === messages.length - 1}
                    onSend={(t) => send(t)}
                    onOpenFile={openFile}
                    formAnswered={answeredForms().has(m.id)}
                  />
                )
              }
            </For>
            <Show when={error()}>
              <div class="err-card">{error()}</div>
            </Show>
          </div>
          <div class="chat-composer">
            <Show when={pending().length}>
              <div class="pending-attach">
                <For each={pending()}>
                  {(f) => (
                    <span class="attach-chip">
                      {f.name}{' '}
                      <button class="icon-btn" style={{ width: '16px', height: '16px' }} onClick={() => setPending(pending().filter((p) => p.path !== f.path))}>
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <textarea
              rows={2}
              placeholder={running() ? 'The agent is working…' : 'Ask for a change, or describe something new'}
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onPaste={(e) => {
                if (e.clipboardData?.files.length) {
                  e.preventDefault();
                  attach(e.clipboardData.files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div class="composer-foot">
              <input ref={attachInput} type="file" multiple hidden onChange={(e) => { attach(e.currentTarget.files); e.currentTarget.value = ''; }} />
              <button class="icon-btn" title="Attach files" onClick={() => attachInput.click()}>
                <Icon name="paperclip" size={16} />
              </button>
              <span class="spacer" />
              <ModelPicker />
              <Show
                when={running()}
                fallback={
                  <button class="send" disabled={!draft().trim()} onClick={() => send()} aria-label="Send">
                    <Icon name="arrowUp" size={18} />
                  </button>
                }
              >
                <button class="send stop" onClick={stop} aria-label="Stop">
                  <Icon name="stop" size={16} />
                </button>
              </Show>
            </div>
          </div>
        </section>
        <div class="resize" onPointerDown={startResize} />
        <Workspace
          projectId={params.id}
          files={files()}
          tabs={tabs()}
          active={active()}
          versions={versions}
          onActivate={(t) => (t ? openFile(t) : setActive(''))}
          onClose={closeTab}
          onUploaded={refreshFiles}
        />
      </div>
    </div>
  );
}
