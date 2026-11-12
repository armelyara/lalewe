// Minimal hash router. Hash routing keeps the app working on any static host
// (GitHub Pages sub-path included) without server rewrites.
export function createRouter(routes, resolveGuard, onChange) {
  let cleanup = null;
  const current = () => location.hash.replace(/^#/, '') || '/';

  function match(path) {
    const parts = path.split('/').filter(Boolean);
    for (const route of routes) {
      const segs = route.path.split('/').filter(Boolean);
      if (segs.length !== parts.length) continue;
      const params = {};
      const ok = segs.every((seg, i) => {
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
          return true;
        }
        return seg === parts[i];
      });
      if (ok) return { route, params };
    }
    return null;
  }

  async function render() {
    const path = current();
    const redirect = resolveGuard(path);
    if (redirect && redirect !== path) {
      location.hash = redirect;
      return;
    }
    const found = match(path);
    if (!found) {
      location.hash = '/';
      return;
    }
    if (typeof cleanup === 'function') cleanup();
    const root = document.getElementById('view');
    root.innerHTML = '';
    cleanup = await found.route.mount(root, found.params);
    onChange?.(path);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  return {
    render,
    current,
    // Navigating to the current path still re-renders (e.g. after a mode switch).
    go(path) {
      if (path === current()) render();
      else location.hash = path;
    },
  };
}
