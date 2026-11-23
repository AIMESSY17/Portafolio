// Bus de eventos entre módulos. Los eventos válidos están en la tabla de CLAUDE.md (sección 8).
export function createBus() {
  const listeners = new Map();
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => this.off(name, fn);
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    emit(name, data) {
      listeners.get(name)?.forEach((fn) => {
        try { fn(data); } catch (err) { console.error(`[bus] error en "${name}"`, err); }
      });
    },
  };
}
