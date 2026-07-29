import type { Category, Dish } from "../../lib/types";
import type { GuardToken } from "../../lib/concurrency";

export type MenuResource = "categories" | "dishes";
export type MenuState = {
  categories: Category[];
  dishes: Dish[];
  loading: Record<MenuResource, number>;
  loads: Record<MenuResource, number>;
  mutations: Record<string, number>;
  tombstones: Set<string>;
  dialogs: Record<string, number>;
  generation: number;
  error: string | null;
};

type Entity = Category | Dish;
export type MenuLoadToken = GuardToken & { resource: MenuResource };
export type MenuMutationToken = GuardToken & { resource: MenuResource; id: string };

const entityKey = (resource: MenuResource, id: string) => `${resource}:${id}`;

export function createMenuState(initial: Partial<Pick<MenuState, "categories" | "dishes">> = {}): MenuState {
  return {
    categories: initial.categories ? [...initial.categories] : [],
    dishes: initial.dishes ? [...initial.dishes] : [],
    loading: { categories: 0, dishes: 0 },
    loads: { categories: 0, dishes: 0 },
    mutations: {},
    tombstones: new Set(),
    dialogs: {},
    generation: 0,
    error: null,
  };
}

export function beginLoad(state: MenuState, resource: MenuResource) {
  const revision = state.loads[resource] + 1;
  return {
    token: { revision, generation: state.generation, resource } satisfies MenuLoadToken,
    state: { ...state, loads: { ...state.loads, [resource]: revision }, loading: { ...state.loading, [resource]: revision } },
  };
}

export function beginMutation(state: MenuState, resource: MenuResource, id: string) {
  const key = entityKey(resource, id);
  const revision = (state.mutations[key] ?? 0) + 1;
  return {
    token: { revision, generation: state.generation, resource, id } satisfies MenuMutationToken,
    state: {
      ...state,
      loads: { ...state.loads, [resource]: state.loads[resource] + 1 },
      loading: { ...state.loading, [resource]: 0 },
      mutations: { ...state.mutations, [key]: revision },
    },
  };
}

function current(state: MenuState, resource: MenuResource, id: string, token: GuardToken): boolean {
  return token.generation === state.generation
    && state.mutations[entityKey(resource, id)] === token.revision
    && !state.tombstones.has(entityKey(resource, id));
}

function replaceEntity<T extends Entity>(items: T[], entity: T): T[] {
  return items.map((item) => item.id === entity.id ? entity : item);
}

export function completeLoad<T extends Entity[]>(state: MenuState, token: MenuLoadToken, entities: T): MenuState {
  const resource = token.resource;
  if (token.generation !== state.generation || state.loads[resource] !== token.revision) return state;
  const filtered = entities.filter((entity) => !state.tombstones.has(entityKey(resource, entity.id)));
  return {
    ...state,
    [resource]: filtered,
    loading: { ...state.loading, [resource]: 0 },
    error: null,
  } as MenuState;
}

export function failLoad(state: MenuState, token: MenuLoadToken, error: unknown): MenuState {
  if (token.generation !== state.generation || state.loads[token.resource] !== token.revision) return state;
  return {
    ...state,
    loading: { ...state.loading, [token.resource]: 0 },
    error: error instanceof Error ? error.message : String(error),
  };
}

export function completeMutation<T extends Entity>(
  state: MenuState,
  token: MenuMutationToken,
  entity: T,
  dialogToken?: GuardToken,
): MenuState {
  const resource: MenuResource = "categoryId" in entity ? "dishes" : "categories";
  if (!current(state, resource, entity.id, token)) return state;
  if (dialogToken && (
    dialogToken.generation !== state.generation
    || state.dialogs[resource === "dishes" ? "dish" : "category"] !== dialogToken.revision
  )) return state;
  const items = state[resource] as T[];
  if (!items.some((item) => item.id === entity.id)) return state;
  return { ...state, [resource]: replaceEntity(items, entity), error: null } as MenuState;
}

export function completeCreate<T extends Entity>(state: MenuState, token: MenuMutationToken, entity: T): MenuState {
  const resource = token.resource;
  if (!current(state, resource, token.id, token)) return state;
  if (state.tombstones.has(entityKey(resource, entity.id))) return state;
  const items = state[resource] as T[];
  return items.some((item) => item.id === entity.id)
    ? state
    : { ...state, [resource]: [...items, entity] } as MenuState;
}

export function failMutation(state: MenuState, token: MenuMutationToken, error: unknown): MenuState {
  const message = error instanceof Error ? error.message : String(error);
  return current(state, token.resource, token.id, token) ? { ...state, error: message } : state;
}

export function completeDelete(state: MenuState, resource: MenuResource, id: string): MenuState {
  const key = entityKey(resource, id);
  if (state.tombstones.has(key)) return state;
  const tombstones = new Set(state.tombstones);
  tombstones.add(key);
  return {
    ...state,
    [resource]: (state[resource] as Entity[]).filter((entity) => entity.id !== id),
    tombstones,
    mutations: { ...state.mutations, [key]: (state.mutations[key] ?? 0) + 1 },
    loads: { ...state.loads, [resource]: state.loads[resource] + 1 },
    loading: { ...state.loading, [resource]: 0 },
  } as MenuState;
}

export function beginDialog(state: MenuState, dialog: string) {
  const revision = (state.dialogs[dialog] ?? 0) + 1;
  return {
    token: { revision, generation: state.generation } satisfies GuardToken,
    state: { ...state, dialogs: { ...state.dialogs, [dialog]: revision } },
  };
}

export function invalidateMenuState(state: MenuState): MenuState {
  return {
    ...state,
    loading: { categories: 0, dishes: 0 },
    tombstones: new Set(),
    generation: state.generation + 1,
    error: null,
  };
}
