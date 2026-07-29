import { describe, expect, it } from "vitest";

import {
  createAuthGuard,
  createConcurrencyGuard,
  createDialogGuard,
} from "./concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("menu concurrency guards", () => {
  it("rejects older same-dish availability responses", () => {
    const guard = createConcurrencyGuard();
    const older = guard.beginMutation("dishes", "dish-1");
    const newer = guard.beginMutation("dishes", "dish-1");
    expect(guard.isCurrentMutation("dishes", "dish-1", newer)).toBe(true);
    expect(guard.isCurrentMutation("dishes", "dish-1", older)).toBe(false);
  });

  it("rejects an older reload after a successful mutation", () => {
    const guard = createConcurrencyGuard();
    const load = guard.beginLoad("categories");
    const mutation = guard.beginMutation("categories", "cat-1");
    expect(guard.isCurrentLoad("categories", load)).toBe(false);
    expect(guard.isCurrentMutation("categories", "cat-1", mutation)).toBe(true);
  });

  it("keeps deletion tombstones against late reload and create results", () => {
    const guard = createConcurrencyGuard();
    const deletion = guard.beginDelete("categories", "cat-1");
    guard.delete("categories", "cat-1", deletion);
    expect(guard.isTombstoned("categories", "cat-1")).toBe(true);
    expect(guard.acceptEntity("categories", "cat-1")).toBe(false);
    expect(guard.acceptEntity("categories", "cat-2")).toBe(true);
  });

  it("accepts a delayed late edit only when the entity still exists", async () => {
    const guard = createConcurrencyGuard();
    const request = deferred<boolean>();
    const token = guard.beginMutation("dishes", "dish-1");
    request.resolve(true);
    expect(await request.promise).toBe(true);
    expect(guard.acceptEntity("dishes", "dish-1", true)).toBe(true);
    expect(guard.isCurrentMutation("dishes", "dish-1", token)).toBe(true);
    expect(guard.acceptEntity("dishes", "dish-1", true)).toBe(true);
    const deletion = guard.beginDelete("dishes", "dish-2");
    guard.delete("dishes", "dish-2", deletion);
    expect(guard.acceptEntity("dishes", "dish-2", false)).toBe(false);
  });

  it("makes completed deletion invalidate delayed intervening edits and availability", async () => {
    const guard = createConcurrencyGuard();
    const edit = guard.beginMutation("dishes", "dish-1");
    const availability = guard.beginMutation("dishes", "dish-1");
    const deletion = guard.beginDelete("dishes", "dish-1");
    const lateEdit = deferred<typeof edit>();
    const lateAvailability = deferred<typeof availability>();
    guard.delete("dishes", "dish-1", deletion);
    lateEdit.resolve(edit);
    lateAvailability.reject(new Error("Старая ошибка"));
    await lateEdit.promise;
    await lateAvailability.promise.catch(() => availability);
    expect(guard.isCurrentMutation("dishes", "dish-1", edit)).toBe(false);
    expect(guard.isCurrentMutation("dishes", "dish-1", availability)).toBe(false);
  });

  it("does not let a late dialog submission close a new editor instance", () => {
    const dialog = createDialogGuard();
    const first = dialog.open("dish");
    const second = dialog.open("dish");
    expect(dialog.isCurrent("dish", first)).toBe(false);
    expect(dialog.isCurrent("dish", second)).toBe(true);
  });

  it("invalidates open dialog tokens across generations and accepts later instances", () => {
    const dialog = createDialogGuard();
    const first = dialog.open("dish");
    dialog.invalidate();
    expect(dialog.generation()).toBe(1);
    expect(dialog.isCurrent("dish", first)).toBe(false);
    const second = dialog.open("dish");
    expect(dialog.isCurrent("dish", second)).toBe(true);
    expect(dialog.isCurrent("dish", first)).toBe(false);
  });

  it("keeps repeated deletion races stale", async () => {
    const guard = createConcurrencyGuard();
    const first = guard.beginMutation("dishes", "dish-1");
    const second = guard.beginMutation("dishes", "dish-1");
    const deletionToken = guard.beginDelete("dishes", "dish-1");
    const deletion = deferred<void>();
    guard.delete("dishes", "dish-1", deletionToken);
    deletion.resolve();
    await deletion.promise;
    expect(guard.isCurrentMutation("dishes", "dish-1", first)).toBe(false);
    expect(guard.isCurrentMutation("dishes", "dish-1", second)).toBe(false);
    guard.delete("dishes", "dish-1", deletionToken);
    expect(guard.isTombstoned("dishes", "dish-1")).toBe(true);
  });

  it("ignores a delete completion from an invalidated generation", async () => {
    const guard = createConcurrencyGuard();
    const response = deferred<void>();
    const deletion = guard.beginDelete("dishes", "dish-1");
    guard.invalidate();
    expect(guard.acceptEntity("dishes", "dish-1")).toBe(true);

    response.resolve();
    await response.promise;
    guard.delete("dishes", "dish-1", deletion);

    expect(guard.acceptEntity("dishes", "dish-1")).toBe(true);
    expect(guard.isTombstoned("dishes", "dish-1")).toBe(false);
  });

  it("lets a same-generation delete win over mutations started afterward", () => {
    const guard = createConcurrencyGuard();
    const deletion = guard.beginDelete("dishes", "dish-1");
    const edit = guard.beginMutation("dishes", "dish-1");
    guard.delete("dishes", "dish-1", deletion);

    expect(guard.isTombstoned("dishes", "dish-1")).toBe(true);
    expect(guard.isCurrentMutation("dishes", "dish-1", edit)).toBe(false);
  });

  it("rejects a fabricated delete token", () => {
    const guard = createConcurrencyGuard();
    const deletion = guard.beginDelete("dishes", "dish-1");
    const fabricated = { ...deletion };
    guard.delete("dishes", "dish-1", fabricated);

    expect(guard.isTombstoned("dishes", "dish-1")).toBe(false);
  });

  it.each(["failure", "cancelled"] as const)("retires a delete token after %s", (outcome) => {
    const guard = createConcurrencyGuard();
    const deletion = guard.beginDelete("dishes", "dish-1");

    expect(guard.settle("dishes", "dish-1", deletion, outcome)).toBe(true);
    expect(guard.settle("dishes", "dish-1", deletion, "success")).toBe(false);
    expect(guard.isTombstoned("dishes", "dish-1")).toBe(false);
  });

  it("allows a fresh delete retry after a failed delete", () => {
    const guard = createConcurrencyGuard();
    const failed = guard.beginDelete("dishes", "dish-1");
    guard.settle("dishes", "dish-1", failed, "failure");
    const retry = guard.beginDelete("dishes", "dish-1");

    expect(guard.settle("dishes", "dish-1", retry, "success")).toBe(true);
    expect(guard.isTombstoned("dishes", "dish-1")).toBe(true);
  });

  it("invalidates pending loads on route changes and sign-out", () => {
    const guard = createConcurrencyGuard();
    const load = guard.beginLoad("dishes");
    guard.invalidate();
    expect(guard.isCurrentLoad("dishes", load)).toBe(false);
    const nextLoad = guard.beginLoad("dishes");
    guard.invalidate();
    expect(guard.isCurrentLoad("dishes", nextLoad)).toBe(false);
  });

  it("resets deletion tombstones when the generation is invalidated", () => {
    const guard = createConcurrencyGuard();
    const deletion = guard.beginDelete("categories", "cat-1");
    guard.delete("categories", "cat-1", deletion);
    expect(guard.acceptEntity("categories", "cat-1")).toBe(false);
    guard.invalidate();
    expect(guard.isTombstoned("categories", "cat-1")).toBe(false);
    expect(guard.acceptEntity("categories", "cat-1")).toBe(true);
  });

  it("only emits one centralized auth transition per generation", () => {
    const auth = createAuthGuard();
    expect(auth.transition()).toBe(true);
    expect(auth.transition()).toBe(false);
    auth.invalidate();
    expect(auth.transition()).toBe(true);
  });

  it("does not re-emit auth transition for a stale rejected response", async () => {
    const auth = createAuthGuard();
    const response = deferred<never>();
    response.reject(new Error("Unauthorized"));
    expect(await response.promise.catch(() => auth.transition())).toBe(true);
    expect(auth.transition()).toBe(false);
    auth.invalidate();
    expect(auth.transition()).toBe(true);
  });
});
