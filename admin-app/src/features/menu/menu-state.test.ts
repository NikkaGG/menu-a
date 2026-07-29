import { describe, expect, it } from "vitest";

import type { Category, Dish } from "../../lib/types";
import {
  beginDialog,
  beginDelete,
  beginLoad,
  beginMutation,
  completeCreate,
  completeDelete,
  completeLoad,
  completeMutation,
  createMenuState,
  failLoad,
  failMutation,
  invalidateMenuState,
  settleDelete,
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
    const categoryDelete = beginDelete(state, "categories", "cat-1");
    state = categoryDelete.state;
    state = completeDelete(state, categoryDelete.token);
    const dishDelete = beginDelete(state, "dishes", "dish-1");
    state = dishDelete.state;
    state = completeDelete(state, dishDelete.token);

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

  it("applies a delayed edit to a reloaded entity without mutating stale state", async () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const editResponse = deferred<Dish>();
    const edit = beginMutation(state, "dishes", "dish-1");
    const reload = beginLoad(edit.state, "dishes");
    state = completeLoad(reload.state, reload.token, [dish("dish-1")]);
    editResponse.resolve({ ...dish("dish-1"), name: "Позднее обновление" });
    state = completeMutation(state, edit.token, await editResponse.promise);
    expect(state.dishes[0].name).toBe("Позднее обновление");

    const absent = beginMutation(state, "dishes", "missing");
    const before = absent.state;
    state = completeMutation(before, absent.token, dish("missing"));
    expect(state).toBe(before);
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
    const deletion = beginDelete(state, "dishes", "dish-1");
    state = completeDelete(deletion.state, deletion.token);
    state = completeMutation(state, edit.token, { ...dish("dish-1"), name: "Поздно" }, firstDialog.token);
    state = completeMutation(state, availability.token, dish("dish-1", false), firstDialog.token);
    expect(state.dishes).toEqual([]);
    expect(state.dialogs.dish).toBe(secondDialog.token.revision);
  });

  it("keeps a repeated delayed delete ahead of rejected edit and availability responses", async () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const edit = beginMutation(state, "dishes", "dish-1");
    const availability = beginMutation(edit.state, "dishes", "dish-1");
    const deletion = beginDelete(availability.state, "dishes", "dish-1");
    const editResponse = deferred<Dish>();
    const availabilityResponse = deferred<Dish>();
    state = completeDelete(deletion.state, deletion.token);
    const afterDelete = state;
    state = completeDelete(state, deletion.token);
    expect(state).toBe(afterDelete);

    editResponse.resolve({ ...dish("dish-1"), name: "Поздно" });
    availabilityResponse.reject(new Error("Старая ошибка"));
    state = completeMutation(state, edit.token, await editResponse.promise);
    await availabilityResponse.promise.catch((error) => {
      state = failMutation(state, availability.token, error);
    });
    expect(state).toBe(afterDelete);
    expect(state.dishes).toEqual([]);
    expect(state.error).toBeNull();
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

  it("does not apply a delayed create completed after invalidation", async () => {
    let state = createMenuState();
    const response = deferred<Category>();
    const create = beginMutation(state, "categories", "cat-new");
    state = invalidateMenuState(create.state);
    const invalidated = state;
    response.resolve(category("cat-new"));
    state = completeCreate(state, create.token, await response.promise);
    expect(state).toBe(invalidated);
    expect(state.categories).toEqual([]);
  });

  it("retains a delayed create when the server returns a generated ID", async () => {
    let state = createMenuState();
    const response = deferred<Category>();
    const create = beginMutation(state, "categories", "provisional-category");
    state = create.state;
    response.resolve(category("postgres-category-42", "Серверная категория"));
    state = completeCreate(state, create.token, await response.promise);
    expect(state.categories).toEqual([category("postgres-category-42", "Серверная категория")]);
  });

  it("resets deletion tombstones after generation invalidation", () => {
    let state = createMenuState({ categories: [category("cat-1")] });
    const deletion = beginDelete(state, "categories", "cat-1");
    state = completeDelete(deletion.state, deletion.token);
    state = invalidateMenuState(state);
    const load = beginLoad(state, "categories");
    state = completeLoad(load.state, load.token, [category("cat-1", "Заново загружено")]);
    expect(state.categories).toEqual([category("cat-1", "Заново загружено")]);
  });

  it("ignores a delete completion from an invalidated generation", async () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const response = deferred<void>();
    const deletion = beginDelete(state, "dishes", "dish-1");
    state = invalidateMenuState(deletion.state);
    const load = beginLoad(state, "dishes");
    state = completeLoad(load.state, load.token, [{ ...dish("dish-1"), name: "Fresh" }]);

    response.resolve();
    await response.promise;
    const before = state;
    state = completeDelete(state, deletion.token);

    expect(state).toBe(before);
    expect(state.dishes).toEqual([{ ...dish("dish-1"), name: "Fresh" }]);
    expect(state.tombstones.has("dishes:dish-1")).toBe(false);
  });

  it("lets category and dish deletes win after intervening mutations", () => {
    let state = createMenuState({
      categories: [category("cat-1")],
      dishes: [dish("dish-1")],
    });
    const categoryDelete = beginDelete(state, "categories", "cat-1");
    const categoryEdit = beginMutation(categoryDelete.state, "categories", "cat-1");
    const dishDelete = beginDelete(categoryEdit.state, "dishes", "dish-1");
    const dishAvailability = beginMutation(dishDelete.state, "dishes", "dish-1");
    state = completeDelete(dishAvailability.state, dishDelete.token);
    state = completeDelete(state, categoryDelete.token);
    state = completeMutation(state, categoryEdit.token, category("cat-1", "Late"));
    state = completeMutation(state, dishAvailability.token, dish("dish-1", false));

    expect(state.categories).toEqual([]);
    expect(state.dishes).toEqual([]);
    expect(state.tombstones).toEqual(new Set(["categories:cat-1", "dishes:dish-1"]));
  });

  it("rejects a fabricated delete token", () => {
    const state = createMenuState({ categories: [category("cat-1")] });
    const deletion = beginDelete(state, "categories", "cat-1");
    const fabricated = { ...deletion.token };

    expect(completeDelete(deletion.state, fabricated)).toBe(deletion.state);
  });

  it.each(["failure", "cancelled"] as const)("immutably retires a delete token after %s", (outcome) => {
    const initial = createMenuState({ categories: [category("cat-1")] });
    const deletion = beginDelete(initial, "categories", "cat-1");
    const pendingTokens = deletion.state.deleteTokens;

    const settled = settleDelete(deletion.state, deletion.token, outcome);

    expect(settled).not.toBe(deletion.state);
    expect(settled.deleteTokens).not.toBe(pendingTokens);
    expect(settled.deleteTokens.has(deletion.token)).toBe(false);
    expect(deletion.state.deleteTokens.has(deletion.token)).toBe(true);
    expect(settled.categories).toEqual([category("cat-1")]);
    expect(completeDelete(settled, deletion.token)).toBe(settled);
  });

  it("retires successful delete tokens and permits a fresh retry after failure", () => {
    let state = createMenuState({ categories: [category("cat-1")] });
    const failed = beginDelete(state, "categories", "cat-1");
    state = settleDelete(failed.state, failed.token, "failure");
    const retry = beginDelete(state, "categories", "cat-1");
    state = completeDelete(retry.state, retry.token);

    expect(state.deleteTokens.has(failed.token)).toBe(false);
    expect(state.deleteTokens.has(retry.token)).toBe(false);
    expect(state.categories).toEqual([]);
    expect(completeDelete(state, retry.token)).toBe(state);
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

  it("keeps a newly opened dialog when an older delayed submission resolves", async () => {
    let state = createMenuState({ dishes: [dish("dish-1")] });
    const response = deferred<Dish>();
    const firstDialog = beginDialog(state, "dish");
    const edit = beginMutation(firstDialog.state, "dishes", "dish-1");
    const secondDialog = beginDialog(edit.state, "dish");
    state = secondDialog.state;
    response.resolve({ ...dish("dish-1"), name: "Старый редактор" });
    const before = state;
    state = completeMutation(state, edit.token, await response.promise, firstDialog.token);
    expect(state).toBe(before);
    expect(state.dialogs.dish).toBe(secondDialog.token.revision);
  });

  it("ignores a stale rejected reload without mutating state", async () => {
    let state = createMenuState({ categories: [category("cat-1")] });
    const response = deferred<Category[]>();
    const staleLoad = beginLoad(state, "categories");
    const currentLoad = beginLoad(staleLoad.state, "categories");
    state = currentLoad.state;
    response.reject(new Error("Старая ошибка загрузки"));
    const before = state;
    await response.promise.catch((error) => {
      state = failLoad(state, staleLoad.token, error);
    });
    expect(state).toBe(before);
    expect(state.error).toBeNull();
  });
});
