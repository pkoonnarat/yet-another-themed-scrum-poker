// Tiny DOM helpers — no framework, so animations stay fully imperative.

type Props = {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  maxlength?: number;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
  attrs?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text != null) node.textContent = props.text;
  if (props.html != null) node.innerHTML = props.html;
  if (props.title != null) node.title = props.title;
  if (props.type != null) (node as HTMLInputElement).type = props.type;
  if (props.value != null) (node as HTMLInputElement).value = props.value;
  if (props.placeholder != null)
    (node as HTMLInputElement).placeholder = props.placeholder;
  if (props.maxlength != null)
    (node as HTMLInputElement).maxLength = props.maxlength;
  if (props.dataset)
    for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  if (props.attrs)
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.style) {
    for (const [k, v] of Object.entries(props.style)) {
      if (v == null) continue;
      // CSS custom properties (--foo) must go through setProperty; a plain
      // assignment / Object.assign silently drops them.
      if (k.startsWith("--")) node.style.setProperty(k, String(v));
      else (node.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
  if (props.on)
    for (const [k, fn] of Object.entries(props.on))
      node.addEventListener(k, fn as EventListener);
  for (const c of children) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(root: Element, ...nodes: Node[]): void {
  clear(root);
  root.append(...nodes);
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function raf(): Promise<number> {
  return new Promise((r) => requestAnimationFrame(r));
}

export function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
