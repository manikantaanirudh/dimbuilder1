// Test environment polyfills: the markup tests render components with
// renderToStaticMarkup under the "node" environment, where browser globals
// like localStorage and matchMedia don't exist. Provide minimal shims so
// components that read them during render don't throw.

class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const globalRef = globalThis as Record<string, unknown>;

if (typeof globalRef.localStorage === "undefined") {
  globalRef.localStorage = new MemoryStorage();
}

if (typeof globalRef.matchMedia === "undefined") {
  globalRef.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  });
}

// Some components read `window.matchMedia` / `window.localStorage` directly
// (e.g. the theme hook). Expose a window that resolves to these shims.
if (typeof globalRef.window === "undefined") {
  globalRef.window = globalThis;
}
