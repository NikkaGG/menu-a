import { describe, expect, it } from "vitest";

import type { Table } from "@/lib/types";
import {
  beginCreate,
  beginDelete,
  beginDialog,
  beginLoad,
  completeCreate,
  completeLoad,
  createTablesState,
  failLoad,
  failMutation,
  invalidateTablesState,
  settleDelete,
} from "./tables-state";

const table = (id: string, number = id): Table => ({ id, number, createdAt: "2026-07-30T10:00:00Z" });

describe("tables state", () => {
  it("accepts only the latest load revision", () => {
    const first = beginLoad(createTablesState());
    const second = beginLoad(first.state);
    const afterSecond = completeLoad(second.state, second.token, [table("2")]);
    expect(completeLoad(afterSecond, first.token, [table("1")])).toBe(afterSecond);
    expect(afterSecond.tables).toEqual([table("2")]);
  });

  it("merges an overlapping load with the server-generated create id", () => {
    const load = beginLoad(createTablesState());
    const create = beginCreate(load.state, "new-1");
    const created = completeCreate(create.state, create.token, table("server-id", "12"));
    const loaded = completeLoad(created, load.token, [table("existing", "4")]);
    expect(loaded.tables).toEqual([table("existing", "4"), table("server-id", "12")]);
  });

  it("allows an initial load to settle after an overlapping create fails", () => {
    const load = beginLoad(createTablesState());
    const create = beginCreate(load.state, "new-1");
    const failed = failMutation(create.state, create.token, new Error("failed"));
    expect(completeLoad(failed, load.token, [table("existing")]).tables).toEqual([table("existing")]);
  });

  it("uses tombstones so successful deletion wins intervening work and repeated deletes", () => {
    const initial = createTablesState({ tables: [table("1")] });
    const first = beginDelete(initial, "1");
    const second = beginDelete(first.state, "1");
    const afterFirst = settleDelete(second.state, first.token, "success");
    expect(afterFirst.tables).toEqual([]);
    expect(afterFirst.tombstones.has("tables:1")).toBe(true);
    const afterSecond = settleDelete(afterFirst, second.token, "success");
    expect(afterSecond.tables).toEqual([]);
    expect(settleDelete(afterSecond, second.token, "success")).toBe(afterSecond);
  });

  it("settles each delete token once on success, failure, and cancel", () => {
    for (const outcome of ["success", "failure", "cancel"] as const) {
      const deletion = beginDelete(createTablesState({ tables: [table("1")] }), "1");
      const settled = settleDelete(deletion.state, deletion.token, outcome);
      expect(settled.deleteTokens.size).toBe(0);
      expect(settleDelete(settled, deletion.token, outcome)).toBe(settled);
    }
  });

  it("ignores old-generation load, create, delete, and errors after route/signout invalidation", () => {
    const load = beginLoad(createTablesState());
    const create = beginCreate(load.state, "new");
    const deletion = beginDelete(create.state, "1");
    const invalid = invalidateTablesState(deletion.state);
    expect(completeLoad(invalid, load.token, [table("1")])).toBe(invalid);
    expect(failLoad(invalid, load.token, new Error("old"))).toBe(invalid);
    expect(completeCreate(invalid, create.token, table("2"))).toBe(invalid);
    expect(failMutation(invalid, create.token, new Error("old"))).toBe(invalid);
    expect(settleDelete(invalid, deletion.token, "success")).toBe(invalid);
  });

  it("does not allow a late table dialog to be current after a newer one opens", () => {
    const first = beginDialog(createTablesState());
    const second = beginDialog(first.state);
    expect(first.token.revision).toBe(1);
    expect(second.token.revision).toBe(2);
    expect(second.state.dialogRevision).toBe(2);
  });
});
