import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { createStore } from 'solid-js/store';

type Option = string | { label: string; value: string; description?: string };
type Question = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Option[];
  defaultValue?: unknown;
  placeholder?: string;
  description?: string;
  maxSelections?: number;
  allowCustom?: boolean;
  min?: number;
  max?: number;
};
export type FormSpec = { id: string; title: string; questions: Question[]; submitLabel?: string };

const FORM_RE = /<(question-form|ask-question)\b([^>]*)>([\s\S]*?)<\/\1>/;

/** Split text around the first complete question form. */
export function extractForm(text: string): { before: string; form: FormSpec | null; after: string } {
  const m = FORM_RE.exec(text);
  if (!m) return { before: text, form: null, after: '' };
  const attrs = m[2] ?? '';
  const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? 'form';
  const title = /\btitle="([^"]*)"/.exec(attrs)?.[1] ?? '';
  let form: FormSpec | null = null;
  try {
    const body = JSON.parse(m[3]!.trim());
    if (Array.isArray(body?.questions)) form = { id, title, questions: body.questions, submitLabel: body.submitLabel };
  } catch {}
  return { before: text.slice(0, m.index), form, after: text.slice(m.index + m[0].length) };
}

const opt = (o: Option) => (typeof o === 'string' ? { label: o, value: o } : o);

/** The answer text the agent expects back: `[form answers — id]` + one line per question. */
export function formatAnswers(form: FormSpec, values: Record<string, unknown>): string {
  const lines = form.questions.map((q) => {
    const v = values[q.id];
    const list = Array.isArray(v) ? v : v === undefined || v === '' || v === null ? [] : [v];
    if (!list.length) return `- ${q.label}: (skipped)`;
    const shown = list.map((x) => {
      const o = q.options?.map(opt).find((o) => o.value === x);
      return o ? `${o.label} [value: ${o.value}]` : String(x);
    });
    return `- ${q.label}: ${shown.join(', ')}`;
  });
  return `[form answers — ${form.id}]\n${lines.join('\n')}`;
}

export function QuestionForm(props: { form: FormSpec; disabled?: boolean; onSubmit: (text: string) => void }) {
  const initial: Record<string, unknown> = {};
  for (const q of props.form.questions) {
    if (q.defaultValue !== undefined) initial[q.id] = q.defaultValue;
    else if (q.type === 'checkbox') initial[q.id] = [];
  }
  const [values, setValues] = createStore<Record<string, unknown>>(initial);
  const [custom, setCustom] = createStore<Record<string, string>>({});
  const [sent, setSent] = createSignal(false);

  function toggle(q: Question, value: string) {
    const cur = (values[q.id] as string[]) ?? [];
    if (cur.includes(value)) setValues(q.id, cur.filter((v) => v !== value));
    else if (!q.maxSelections || cur.length < q.maxSelections) setValues(q.id, [...cur, value]);
  }

  function submit() {
    const merged: Record<string, unknown> = { ...values };
    for (const [k, v] of Object.entries(custom)) {
      if (!v.trim()) continue;
      const cur = merged[k];
      merged[k] = Array.isArray(cur) ? [...cur, v.trim()] : v.trim();
    }
    setSent(true);
    props.onSubmit(formatAnswers(props.form, merged));
  }

  const missing = () =>
    props.form.questions.some((q) => {
      if (!q.required) return false;
      const v = values[q.id];
      return (v === undefined || v === '' || (Array.isArray(v) && !v.length)) && !custom[q.id]?.trim();
    });

  return (
    <div class="qform">
      <Show when={props.form.title}>
        <h4>{props.form.title}</h4>
      </Show>
      <For each={props.form.questions}>
        {(q) => (
          <div class="qfield">
            <label class="q">
              {q.label}
              {q.required ? ' *' : ''}
            </label>
            <Switch
              fallback={
                <input
                  type={['number', 'url', 'email', 'tel', 'date', 'time', 'datetime-local', 'color', 'range'].includes(q.type) ? q.type : 'text'}
                  placeholder={q.placeholder}
                  min={q.min}
                  max={q.max}
                  value={(values[q.id] as string) ?? ''}
                  onInput={(e) => setValues(q.id, e.currentTarget.value)}
                />
              }
            >
              <Match when={q.type === 'radio' || q.type === 'checkbox' || q.type === 'direction-cards'}>
                <div class="opts">
                  <For each={(q.options ?? []).map(opt)}>
                    {(o) => {
                      const on = () =>
                        q.type === 'checkbox' ? ((values[q.id] as string[]) ?? []).includes(o.value) : values[q.id] === o.value;
                      return (
                        <button
                          type="button"
                          class="opt"
                          classList={{ on: on() }}
                          title={o.description}
                          onClick={() => (q.type === 'checkbox' ? toggle(q, o.value) : setValues(q.id, o.value))}
                        >
                          {o.label}
                        </button>
                      );
                    }}
                  </For>
                </div>
                <Show when={q.allowCustom !== false}>
                  <input
                    type="text"
                    style={{ 'margin-top': '6px' }}
                    placeholder="Or type your own"
                    value={custom[q.id] ?? ''}
                    onInput={(e) => setCustom(q.id, e.currentTarget.value)}
                  />
                </Show>
              </Match>
              <Match when={q.type === 'select'}>
                <select value={(values[q.id] as string) ?? ''} onChange={(e) => setValues(q.id, e.currentTarget.value)}>
                  <option value="">Choose…</option>
                  <For each={(q.options ?? []).map(opt)}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </select>
              </Match>
              <Match when={q.type === 'textarea'}>
                <textarea rows={3} placeholder={q.placeholder} value={(values[q.id] as string) ?? ''} onInput={(e) => setValues(q.id, e.currentTarget.value)} />
              </Match>
              <Match when={q.type === 'switch'}>
                <button type="button" class="opt" classList={{ on: !!values[q.id] }} onClick={() => setValues(q.id, !values[q.id])}>
                  {values[q.id] ? 'Yes' : 'No'}
                </button>
              </Match>
            </Switch>
            <Show when={q.description}>
              <div class="hint">{q.description}</div>
            </Show>
          </div>
        )}
      </For>
      <div class="actions">
        <button class="btn dark" disabled={props.disabled || sent() || missing()} onClick={submit}>
          {sent() ? 'Sent' : props.form.submitLabel ?? 'Continue'}
        </button>
      </div>
    </div>
  );
}
