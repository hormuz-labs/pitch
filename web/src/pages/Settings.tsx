import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { api, type ModelSettings } from '../api';
import { Icon } from '../components/Icon';
import { store } from '../store';

const PROVIDERS: { id: ModelSettings['protocol']; label: string; hint: string }[] = [
  { id: 'gemini', label: 'Google Gemini', hint: 'Uses Google’s OpenAI-compatible endpoint. Leave the URL empty.' },
  { id: 'openai', label: 'OpenAI-compatible', hint: 'Any endpoint that speaks /v1/chat/completions: OpenAI, a model proxy, vLLM, Ollama.' },
  { id: 'anthropic', label: 'Anthropic', hint: 'The Messages API. Leave the URL empty for api.anthropic.com.' },
];

export function Settings() {
  const [saved, { mutate }] = createResource(() => api.settings());
  const [protocol, setProtocol] = createSignal<ModelSettings['protocol'] | null>(null);
  const [baseUrl, setBaseUrl] = createSignal<string | null>(null);
  const [apiKey, setApiKey] = createSignal('');
  const [model, setModel] = createSignal<string | null>(null);
  const [picked, setPicked] = createSignal<string[] | null>(null);
  const [available, setAvailable] = createSignal<string[]>([]);
  const [filter, setFilter] = createSignal('');
  const [busy, setBusy] = createSignal<'' | 'models' | 'save'>('');
  const [note, setNote] = createSignal<{ ok: boolean; text: string } | null>(null);

  // Edits shadow the saved values until saved.
  const p = () => protocol() ?? saved()?.protocol ?? 'gemini';
  const url = () => baseUrl() ?? saved()?.baseUrl ?? '';
  const def = () => model() ?? saved()?.model ?? '';
  const inPicker = () => picked() ?? saved()?.models ?? [];
  const provider = () => PROVIDERS.find((x) => x.id === p())!;
  const shown = createMemo(() => {
    const f = filter().toLowerCase();
    const list = available().length ? available() : inPicker();
    return list.filter((m) => !f || m.toLowerCase().includes(f));
  });

  async function loadModels() {
    setBusy('models');
    setNote(null);
    try {
      const { models } = await api.providerModels({ protocol: p(), baseUrl: url() || undefined, apiKey: apiKey() || undefined });
      setAvailable(models);
      if (!models.length) setNote({ ok: false, text: 'The provider returned no models.' });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  function toggle(m: string) {
    const cur = inPicker();
    setPicked(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
    if (!def()) setModel(m);
  }

  async function save() {
    setBusy('save');
    setNote(null);
    try {
      const models = inPicker().includes(def()) || !def() ? inPicker() : [def(), ...inPicker()];
      const next = await api.saveSettings({
        protocol: p(),
        baseUrl: url() || null,
        model: def(),
        models,
        ...(apiKey() ? { apiKey: apiKey() } : {}),
      });
      mutate(next);
      setApiKey('');
      setPicked(null);
      setModel(null);
      store.refreshConfig();
      if (!store.model() || !next.models.includes(store.model())) store.setModel(next.model);
      setNote({ ok: true, text: 'Saved. New runs use these settings.' });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  return (
    <div class="page" style={{ 'max-width': '820px' }}>
      <div class="page-head">
        <h1>Settings</h1>
      </div>
      <div class="ds-detail" style={{ 'min-height': 'auto' }}>
        <h2 style={{ 'font-size': '18px' }}>Model</h2>
        <p class="muted" style={{ 'margin-top': '4px' }}>The agent runs on this provider. Your key stays on this machine.</p>

        <div class="section-label">Provider</div>
        <div class="seg">
          <For each={PROVIDERS}>
            {(x) => (
              <button classList={{ on: p() === x.id }} onClick={() => { setProtocol(x.id); setAvailable([]); }}>
                {x.label}
              </button>
            )}
          </For>
        </div>
        <p class="muted" style={{ 'font-size': '12.5px' }}>{provider().hint}</p>

        <div class="section-label">Endpoint URL</div>
        <input
          class="input"
          placeholder={p() === 'openai' ? 'https://models.example.com' : 'Default endpoint'}
          value={url()}
          onInput={(e) => setBaseUrl(e.currentTarget.value)}
        />

        <div class="section-label">API key</div>
        <input
          class="input"
          type="password"
          autocomplete="off"
          placeholder={saved()?.hasKey ? 'A key is saved — type to replace it' : 'Paste your key'}
          value={apiKey()}
          onInput={(e) => setApiKey(e.currentTarget.value)}
        />

        <div class="section-label" style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          Models
          <button class="btn small" disabled={busy() !== ''} onClick={loadModels}>
            <Icon name="refresh" size={12} /> {busy() === 'models' ? 'Loading…' : 'Load from provider'}
          </button>
        </div>
        <p class="muted" style={{ 'font-size': '12.5px', 'margin-top': 0 }}>
          Tick the models to offer in the picker; the starred one is the default.
        </p>
        <input class="input" placeholder="Filter, or type a model id and press Enter" value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filter().trim()) {
              const id = filter().trim();
              if (!inPicker().includes(id)) setPicked([...inPicker(), id]);
              if (!def()) setModel(id);
              setFilter('');
            }
          }}
          style={{ 'margin-bottom': '8px' }}
        />
        <div style={{ 'max-height': '300px', overflow: 'auto', border: '1px solid var(--border-soft)', 'border-radius': '10px' }}>
          <Show when={shown().length} fallback={<div class="muted" style={{ padding: '14px' }}>No models yet. Load them from the provider or type an id above.</div>}>
            <For each={shown()}>
              {(m) => (
                <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: '6px 12px', 'border-top': '1px solid var(--border-soft)' }}>
                  <input type="checkbox" checked={inPicker().includes(m)} onChange={() => toggle(m)} />
                  <span class="mono" style={{ flex: 1, 'font-size': '12.5px' }}>{m}</span>
                  <button class="icon-btn" title="Make default" onClick={() => { setModel(m); if (!inPicker().includes(m)) setPicked([...inPicker(), m]); }}>
                    <span style={{ color: def() === m ? 'var(--amber)' : 'var(--text-faint)' }}>★</span>
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div style={{ display: 'flex', 'align-items': 'center', gap: '12px', 'margin-top': '20px' }}>
          <button class="btn dark" disabled={busy() !== '' || !def()} onClick={save}>
            {busy() === 'save' ? 'Saving…' : 'Save'}
          </button>
          <Show when={note()}>
            <span style={{ 'font-size': '13px', color: note()!.ok ? 'var(--green)' : 'var(--red)' }}>{note()!.text}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}
