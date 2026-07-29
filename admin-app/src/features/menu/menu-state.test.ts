import { describe, expect, it } from "vitest";

import type { Category, Dish } from "../../lib/types";
import {
  beginDialog,
  beginLoad,
  beginMutation,
  completeCreate,
  completeDelete,
  completeLoad,
  completeMutation,
  createMenuState,
  failMutation,
  invalidateMenuState,
} from "./menu-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const category = (id: string, name = id, sortOrder = 0): Category => ({ id, name, sortOrder });
const dish = (id: string, isAvailable = true): Dish => ({
  id,
  categoryId: "cat-1",
  name: id,
  description: null,
  price: "100.00",
  costPrice: null,
  photoUrl: null,
  isAvailable,
  sortOrder: 0,
});

describe("guarded menu state", () => {
  it("ignores older same-dish availability success and failure", async () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const olderRequest = deferred<Dish>();
    const newerRequest = deferred<Dish>();
    const older = beginMutation(state, "dishes", "dish-1");
    state = older.state;
    const newer = beginMutation(state, "dishes", "dish-1");
    state = newer.state;

    newerRequest.resolve(dish("dish-1", true));
    state = completeMutation(state, newer.token, await newerRequest.promise);
    olderRequest.resolve(dish("dish-1", false));
    state = completeMutation(state, older.token, await olderRequest.promise);
    expect(state.dishes[0].isAvailable).toBe(true);

    const staleFailure = deferred<never>();
    staleFailure.reject(new Error("Старая ошибка"));
    await staleFailure.promise.catch((error) => {
      state = failMutation(state, older.token, error);
    });
    expect(state.error).toBeNull();
  });

  it("does not let an older pending reload overwrite a successful mutation", async () => {
    let state = createMenuState({ categories: [category("cat-1", "Старое")] });
    const reload = deferred<Category[]>();
    const loading = beginLoad(state, "categories");
    state = loading.state;
    const mutation = beginMutation(state, "categories", "cat-1");
    state = mutation.state;
    state = completeMutation(state, mutation.token, category("cat-1", "Новое"));
    reload.resolve([category("cat-1", "Старое")]);
    state = completeLoad(state, loading.token, await reload.promise);
    expect(state.categories[0].name).toBe("Новое");
  });

  it("uses tombstones so reloads and creates cannot resurrect deletions", async () => {
    let state = createMenuState({
      categories: [category("cat-1")],
      dishes: [dish("dish-1")],
    });
    const categoryLoad = beginLoad(state, "categories");
    state = categoryLoad.state;
    const dishCreate = beginMutation(state, "dishes", "dish-1");
    state = dishCreate.state;
    state = completeDelete(state, "categories", "cat-1");
    state = completeDelete(state, "dishes", "dish-1");

    state = completeLoad(state, categoryLoad.token, [category("cat-1")]);
    state = completeMutation(state, dishCreate.token, dish("dish-1"));
    expect(state.categories).toEqual([]);
    expect(state.dishes).toEqual([]);
  });

  it("applies a late edit to a reloaded same-ID entity but not an absent entity", () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const edit = beginMutation(state, "dishes", "dish-1");
    state = edit.state;
    const reload = beginLoad(state, "dishes");
    state = reload.state;
    state = completeLoad(state, reload.token, [dish("dish-1")]);
    state = completeMutation(state, edit.token, { ...dish("dish-1"), name: "Обновлено" });
    expect(state.dishes[0].name).toBe("Обновлено");

    const absentEdit = beginMutation(state, "dishes", "missing");
    state = absentEdit.state;
    state = completeMutation(state, absentEdit.token, dish("missing"));
    expect(state.dishes.some(({ id }) => id === "missing")).toBe(false);
  });

  it("completed delete wins over edits, availability, and late dialog submission", () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const edit = beginMutation(state, "dishes", "dish-1");
    state = edit.state;
    const availability = beginMutation(state, "dishes", "dish-1");
    state = availability.state;
    const firstDialog = beginDialog(state, "dish");
    state = firstDialog.state;
    const secondDialog = beginDialog(state, "dish");
    state = secondDialog.state;
    state = completeDelete(state, "dishes", "dish-1");
    state = completeMutation(state, edit.token, { ...dish("dish-1"), name: "Поздно" }, firstDialog.token);
    state = completeMutation(state, availability.token, dish("dish-1", false), firstDialog.token);
    expect(state.dishes).toEqual([]);
    expect(state.dialogs.dish).toBe(secondDialog.token.revision);
  });

  it("route changes and sign-out invalidate pending loads quietly", () => {
    let state = createMenuState();
    const categories = beginLoad(state, "categories");
    state = categories.state;
    state = invalidateMenuState(state);
    state = completeLoad(state, categories.token, [category("cat-1")]);
    expect(state.categories).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("does not apply a create completed after invalidation", () => {
    let state = createMenuState();
    const create = beginMutation(state, "categories", "cat-new");
    state = invalidateMenuState(create.state);
    state = completeCreate(state, create.token, category("cat-new"));
    expect(state.categories).toEqual([]);
  });

  it("clears loading when a mutation supersedes a pending reload", () => {
    let state = createMenuState();
    const load = beginLoad(state, "dishes");
    state = beginMutation(load.state, "dishes", "dish-1").state;
    expect(state.loading.dishes).toBe(0);
  });

  it("does not accept an old dialog token after invalidation", () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const dialog = beginDialog(state, "dish");
    state = invalidateMenuState(dialog.state);
    const edit = beginMutation(state, "dishes", "dish-1");
    state = completeMutation(edit.state, edit.token, { ...dish("dish-1"), name: "Поздно" }, dialog.token);
    expect(state.dishes[0].name).toBe("dish-1");
  });
});
