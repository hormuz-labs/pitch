import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

/** A page rendered small and inert: covers, thumbnails, example previews. */
export function FrameThumb(props: { src: string; width?: number; height?: number }) {
  let box!: HTMLDivElement;
  const [scale, setScale] = createSignal(0.2);
  const [visible, setVisible] = createSignal(false);
  const w = () => props.width ?? 1280;
  const h = () => props.height ?? 800;
  onMount(() => {
    const ro = new ResizeObserver(() => setScale(box.clientWidth / w()));
    ro.observe(box);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(box);
    onCleanup(() => {
      ro.disconnect();
      io.disconnect();
    });
  });
  return (
    <div class="frame-thumb" ref={box}>
      <Show when={visible()}>
        <iframe
          src={props.src}
          sandbox="allow-scripts allow-same-origin"
          tabindex="-1"
          aria-hidden="true"
          style={{ width: `${w()}px`, height: `${h()}px`, transform: `scale(${scale()})` }}
        />
      </Show>
    </div>
  );
}

marked.setOptions({ gfm: true, breaks: false });

export function Markdown(props: { text: string; class?: string }) {
  const html = () => DOMPurify.sanitize(marked.parse(props.text, { async: false }) as string);
  return <div class={props.class ?? 'prose'} innerHTML={html()} />;
}

const tints = ['#ffe7c2', '#d9f1ff', '#e6e1ff', '#dcf7e3', '#ffd9e1', '#f0f0d0', '#e0ecf5'];

export function Initials(props: { name: string }) {
  const letters = () =>
    props.name
      .replace(/[^A-Za-z0-9 -]/g, '')
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '•';
  const tint = () => tints[[...props.name].reduce((a, c) => a + c.charCodeAt(0), 0) % tints.length];
  return (
    <div class="initials" style={{ background: tint() }}>
      {letters()}
    </div>
  );
}

export function kindTag(kind?: string | null): { label: string; cls: string } {
  switch (kind) {
    case 'deck':
      return { label: 'Slides', cls: 'deck' };
    case 'image':
    case 'video':
    case 'audio':
      return { label: 'Media', cls: 'media' };
    case 'brand':
      return { label: 'Design System', cls: 'system' };
    case 'template':
      return { label: 'Template', cls: '' };
    default:
      return { label: 'Prototype', cls: '' };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
