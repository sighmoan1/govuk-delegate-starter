import type { NavigationItem } from "./config";

export type ConnectedNavigationProps = {
  links: NavigationItem[];
  activeId?: NavigationItem["id"];
  id?: string;
  label?: string;
};

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}[char]!));

export function renderConnectedNavigation({ links, activeId, id = "connected-navigation", label = "Delegate prototype services" }: ConnectedNavigationProps) {
  const titleId = `${id}-title`;
  const items = links.map((item) => {
    const current = item.id === activeId ? ' aria-current="page"' : "";
    const target = item.external ? ' rel="noopener"' : "";
    return `<li><a class="connected-nav__link" href="${escapeHtml(item.href)}"${current}${target}><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.description)}</small></a></li>`;
  }).join("");
  return `<nav class="connected-nav-root" aria-label="${escapeHtml(label)}">
  <details class="connected-nav" data-connected-nav>
    <summary class="connected-nav__toggle">Menu</summary>
    <span class="connected-nav__scrim" data-connected-nav-scrim aria-hidden="true"></span>
    <div class="connected-nav__panel" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(titleId)}">
      <div class="connected-nav__head">
        <h2 id="${escapeHtml(titleId)}">Delegate services</h2>
        <button class="connected-nav__close" type="button" data-connected-nav-close>Close</button>
      </div>
      <ul class="connected-nav__list">${items}</ul>
    </div>
  </details>
</nav>`;
}
