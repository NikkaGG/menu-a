export type GuardToken = { revision: number; generation: number };

type ResourceKey = string;

export function createConcurrencyGuard() {
  let generation = 0;
  const loads = new Map<ResourceKey, number>();
  const mutations = new Map<string, number>();
  const tombstones = new Set<string>();

  const key = (resource: string, id: string) => `${resource}:${id}`;
  const beginLoad = (resource: string): GuardToken => {
    const revision = (loads.get(resource) ?? 0) + 1;
    loads.set(resource, revision);
    return { revision, generation };
  };
  const beginMutation = (resource: string, id: string): GuardToken => {
    const entityKey = key(resource, id);
    const revision = (mutations.get(entityKey) ?? 0) + 1;
    mutations.set(entityKey, revision);
    const loadRevision = (loads.get(resource) ?? 0) + 1;
    loads.set(resource, loadRevision);
    return { revision, generation };
  };
  return {
    beginLoad,
    isCurrentLoad: (resource: string, token: GuardToken) =>
      token.generation === generation && loads.get(resource) === token.revision,
    beginMutation,
    isCurrentMutation: (resource: string, id: string, token: GuardToken) =>
      token.generation === generation && mutations.get(key(resource, id)) === token.revision
        && !tombstones.has(key(resource, id)),
    delete: (resource: string, id: string) => {
      const entityKey = key(resource, id);
      tombstones.add(entityKey);
      mutations.set(entityKey, (mutations.get(entityKey) ?? 0) + 1);
      loads.set(resource, (loads.get(resource) ?? 0) + 1);
    },
    isTombstoned: (resource: string, id: string) => tombstones.has(key(resource, id)),
    acceptEntity: (resource: string, id: string, exists = true) => exists && !tombstones.has(key(resource, id)),
    invalidate: () => {
      generation += 1;
      loads.clear();
      mutations.clear();
    },
  };
}

export function createDialogGuard() {
  const revisions = new Map<string, number>();
  let generation = 0;
  return {
    open: (dialog: string): GuardToken => {
      const revision = (revisions.get(dialog) ?? 0) + 1;
      revisions.set(dialog, revision);
      return { revision, generation };
    },
    isCurrent: (dialog: string, token: GuardToken) =>
      token.generation === generation && revisions.get(dialog) === token.revision,
    invalidate: () => {
      generation += 1;
    },
    generation: () => generation,
  };
}

export function createAuthGuard() {
  let generation = 0;
  let transitioned = false;
  return {
    transition: () => {
      if (transitioned) return false;
      transitioned = true;
      return true;
    },
    invalidate: () => {
      generation += 1;
      transitioned = false;
    },
    generation: () => generation,
  };
}
