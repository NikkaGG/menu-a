import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "@/lib/api";
import type { Category, Dish } from "@/lib/types";
import { CategoryDialog } from "./category-dialog";
import { CategorySection } from "./category-section";
import { DishDialog } from "./dish-dialog";
import { DishRow } from "./dish-row";

const category: Category = { id: "c1", name: "Роллы", sortOrder: 0 };
const dish: Dish = {
  id: "d1",
  categoryId: category.id,
  name: "Филадельфия",
  description: null,
  price: "1000.00",
  costPrice: null,
  photoUrl: null,
  isAvailable: true,
  sortOrder: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function trackedError() {
  const error = new AdminApiError("late failure");
  const messageRead = vi.fn(() => "late failure");
  Object.defineProperty(error, "message", { configurable: true, get: messageRead });
  return { error, messageRead };
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
  HTMLElement.prototype.scrollIntoView = () => {};
});

describe.each([
  {
    name: "CategoryDialog",
    renderDialog: (onSubmit: (input: unknown) => Promise<boolean>, onOpenChange: (open: boolean) => void) =>
      render(
        <CategoryDialog
          category={null}
          open
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />,
      ),
    completeForm: async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText("Название категории"), "Новая");
      await user.click(screen.getByRole("button", { name: "Создать категорию" }));
    },
  },
  {
    name: "DishDialog",
    renderDialog: (onSubmit: (input: unknown) => Promise<boolean>, onOpenChange: (open: boolean) => void) =>
      render(
        <DishDialog
          dish={null}
          initialCategoryId={category.id}
          categories={[category]}
          open
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />,
      ),
    completeForm: async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText("Название блюда"), "Новый ролл");
      await user.type(screen.getByLabelText("Цена"), "1200");
      await user.click(screen.getByRole("button", { name: "Создать блюдо" }));
    },
  },
])("$name", ({ renderDialog, completeForm }) => {
  it.each(["resolve", "reject"] as const)("invalidates a deferred submit on unmount before late %s", async (outcome) => {
    const submission = deferred<boolean>();
    const onSubmit = vi.fn(() => submission.promise);
    const onOpenChange = vi.fn();
    const { error, messageRead } = trackedError();
    const user = userEvent.setup();
    const view = renderDialog(onSubmit, onOpenChange);

    await completeForm(user);
    expect(onSubmit).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => {
      if (outcome === "resolve") submission.resolve(true);
      else submission.reject(error);
      await Promise.allSettled([submission.promise]);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(messageRead).not.toHaveBeenCalled();
  });
});

describe.each([
  {
    name: "CategorySection",
    deleteButton: "Удалить категорию «Роллы»",
    confirmButton: "Удалить категорию",
    renderChild: (onDelete: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
      render(
        <CategorySection
          category={category}
          dishes={[]}
          pendingAvailability={new Set()}
          onAddDish={vi.fn()}
          onEditCategory={vi.fn()}
          onEditDish={vi.fn()}
          onAvailability={vi.fn()}
          onDeleteDish={vi.fn()}
          onDeleteCategory={onDelete}
        />,
      ),
  },
  {
    name: "DishRow",
    deleteButton: "Удалить блюдо «Филадельфия»",
    confirmButton: "Удалить блюдо",
    renderChild: (onDelete: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
      render(
        <table>
          <tbody>
            <DishRow
              dish={dish}
              availabilityPending={false}
              onEdit={vi.fn()}
              onAvailability={vi.fn()}
              onDelete={onDelete}
            />
          </tbody>
        </table>,
      ),
  },
])("$name", ({ deleteButton, confirmButton, renderChild }) => {
  it("does not inspect or apply a deferred successful delete after unmount", async () => {
    const deletion = deferred<{ ok: true }>();
    const okRead = vi.fn(() => true);
    const result = {} as { ok: true };
    Object.defineProperty(result, "ok", { get: okRead });
    const onDelete = vi.fn(() => deletion.promise);
    const user = userEvent.setup();
    const view = renderChild(onDelete);

    await user.click(screen.getByRole("button", { name: deleteButton }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: confirmButton }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      deletion.resolve(result);
      await deletion.promise;
    });

    expect(okRead).not.toHaveBeenCalled();
  });

  it("consumes a deferred rejected delete without post-unmount error work", async () => {
    const deletion = deferred<{ ok: true } | { ok: false; message: string }>();
    const { error, messageRead } = trackedError();
    const onDelete = vi.fn(() => deletion.promise);
    const user = userEvent.setup();
    const view = renderChild(onDelete);

    await user.click(screen.getByRole("button", { name: deleteButton }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: confirmButton }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      deletion.reject(error);
      await Promise.allSettled([deletion.promise]);
    });

    expect(messageRead).not.toHaveBeenCalled();
  });
});
