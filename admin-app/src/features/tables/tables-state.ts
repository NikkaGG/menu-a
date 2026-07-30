import type { GuardSettlement, GuardToken } from "@/lib/concurrency";
import type { Table } from "@/lib/types";

export type TablesState = {
  tables: Table[];
  loading: number;
  loadRevision: number;
  mutations: Record<string, number>;
  createdIds: Set<string>;
  deleteTokens: Set<TablesMutationToken>;
  tombstones: Set<string>;
  dialogRevision: number;
  generation: number;
  error: string | null;
};

export type TablesLoadToken = GuardToken;
export type TablesMutationToken = GuardToken & { id: string };
const key = (id: string) => `tables:${id}`;

export function createTablesState(initial: Partial<Pick<TablesState, "tables">> = {}): TablesState {
  return {
    tables: initial.tables ? [...initial.tables] : [],
    loading: 0,
    loadRevision: 0,
    mutations: {},
    createdIds: new Set(),
    deleteTokens: new Set(),
    tombstones: new Set(),
    dialogRevision: 0,
    generation: 0,
    error: null,
  };
}

export function beginLoad(state: TablesState) {
  const revision = state.loadRevision + 1;
  return {
    token: { revision, generation: state.generation } satisfies TablesLoadToken,
    state: { ...state, loadRevision: revision, loading: revision },
  };
}

export function beginCreate(state: TablesState, id: string) {
  const revision = (state.mutations[key(id)] ?? 0) + 1;
  const token = { revision, generation: state.generation, id } satisfies TablesMutationToken;
  return {
    token,
    state: {
      ...state,
      mutations: { ...state.mutations, [key(id)]: revision },
    },
  };
}

export function beginDelete(state: TablesState, id: string) {
  const result = beginCreate(state, id);
  const deleteTokens = new Set(result.state.deleteTokens);
  deleteTokens.add(result.token);
  return { ...result, state: { ...result.state, deleteTokens } };
}

function current(state: TablesState, token: TablesMutationToken) {
  return token.generation === state.generation && state.mutations[key(token.id)] === token.revision;
}

export function completeLoad(state: TablesState, token: TablesLoadToken, tables: Table[]) {
  if (token.generation !== state.generation || token.revision !== state.loadRevision) return state;
  const loaded = tables.filter((item) => !state.tombstones.has(key(item.id)));
  const loadedIds = new Set(loaded.map((item) => item.id));
  const overlappingCreates = state.tables.filter((item) =>
    state.createdIds.has(item.id) && !loadedIds.has(item.id) && !state.tombstones.has(key(item.id)));
  return {
    ...state,
    tables: [...loaded, ...overlappingCreates],
    loading: 0,
    error: null,
  };
}

export function failLoad(state: TablesState, token: TablesLoadToken, error: unknown) {
  if (token.generation !== state.generation || token.revision !== state.loadRevision) return state;
  return { ...state, loading: 0, error: error instanceof Error ? error.message : String(error) };
}

export function completeCreate(state: TablesState, token: TablesMutationToken, table: Table) {
  if (!current(state, token) || state.tombstones.has(key(table.id))) return state;
  if (state.tables.some((item) => item.id === table.id)) return state;
  const createdIds = new Set(state.createdIds);
  createdIds.add(table.id);
  return { ...state, tables: [...state.tables, table], createdIds, error: null };
}

export function failMutation(state: TablesState, token: TablesMutationToken, error: unknown) {
  if (!current(state, token)) return state;
  return { ...state, error: error instanceof Error ? error.message : String(error) };
}

export function settleDelete(state: TablesState, token: TablesMutationToken, outcome: GuardSettlement) {
  if (token.generation !== state.generation || !state.deleteTokens.has(token)) return state;
  const deleteTokens = new Set(state.deleteTokens);
  deleteTokens.delete(token);
  if (outcome !== "success" || state.tombstones.has(key(token.id))) return { ...state, deleteTokens };
  const tombstones = new Set(state.tombstones);
  tombstones.add(key(token.id));
  const createdIds = new Set(state.createdIds);
  createdIds.delete(token.id);
  return {
    ...state,
    tables: state.tables.filter((item) => item.id !== token.id),
    deleteTokens,
    tombstones,
    createdIds,
    mutations: { ...state.mutations, [key(token.id)]: (state.mutations[key(token.id)] ?? token.revision) + 1 },
    loadRevision: state.loadRevision + 1,
  };
}

export function beginDialog(state: TablesState) {
  const revision = state.dialogRevision + 1;
  return {
    token: { revision, generation: state.generation } satisfies GuardToken,
    state: { ...state, dialogRevision: revision },
  };
}

export function invalidateTablesState(state: TablesState): TablesState {
  return {
    ...state,
    loading: 0,
    deleteTokens: new Set(),
    createdIds: new Set(),
    tombstones: new Set(),
    generation: state.generation + 1,
    error: null,
  };
}
