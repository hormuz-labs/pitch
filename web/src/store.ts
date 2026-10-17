import { createResource, createRoot, createSignal } from 'solid-js';
import { api, type Skill } from './api';

// App-wide data, loaded once and refreshed on demand.
export const store = createRoot(() => {
  const [config, { refetch: refreshConfig }] = createResource(() => api.config().catch(() => ({ models: [] as string[], defaultModel: '' })));
  const [skills] = createResource(() => api.skills().catch(() => [] as Skill[]));
  const [designSystems] = createResource(() => api.designSystems().catch(() => []));
  const [projects, { refetch: refreshProjects, mutate: setProjects }] = createResource(() =>
    api.projects().catch(() => []),
  );
  const [model, setModel] = createSignal<string>(load('studio:model') ?? '');
  const [designSystemId, setDesignSystemId] = createSignal<string | null>(load('studio:ds'));
  // A skill handed to the Home composer by "Try it".
  const [handoff, setHandoff] = createSignal<{ skill: Skill; prompt: string } | null>(null);
  return {
    config,
    refreshConfig,
    skills,
    designSystems,
    projects,
    refreshProjects,
    setProjects,
    model: () => model() || config()?.defaultModel || '',
    setModel: (m: string) => {
      setModel(m);
      save('studio:model', m);
    },
    designSystemId,
    setDesignSystemId: (id: string | null) => {
      setDesignSystemId(id);
      save('studio:ds', id);
    },
    handoff,
    setHandoff,
  };
});

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
