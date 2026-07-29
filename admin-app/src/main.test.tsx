import { readFileSync } from "node:fs";
import path from "node:path";

import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("admin app scaffold", () => {
  it("mounts React into root with the configured admin base and shadcn Button", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("./main");

    await waitFor(() =>
      expect(document.getElementById("root")).toContainElement(
        document.querySelector("[data-admin-app]"),
      ),
    );
    const viteConfig = readFileSync(
      path.resolve(process.cwd(), "admin-app/vite.config.ts"),
      "utf8",
    );
    expect(viteConfig).toMatch(/base:\s*["']\/admin-dist\/["']/);
    expect(Button).toBeTypeOf("function");
  });
});
