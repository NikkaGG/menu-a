import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Utensils } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AdminApiError, createAdminApi, type AdminApi } from "@/lib/api";
import { pluralizeRussian, sortByMenuOrder } from "@/lib/format";
import type { Category, CategoryInput, Dish, DishInput } from "@/lib/types";
import { CategoryDialog } from "./category-dialog";
import { CategorySection } from "./category-section";
import { DishDialog } from "./dish-dialog";
import {
  beginDelete,
  beginDialog,
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
  type MenuState,
} from "./menu-state";

type DialogEditor<T> = { entity: T | null; token: { revision: number; generation: number } };
type DeleteResult = { ok: true } | { ok: false; message: string };

export function MenuPage({ api: injectedApi }: { api?: AdminApi }) {
  const [api] = useState(() => injectedApi ?? createAdminApi());
  const stateRef = useRef<MenuState>(createMenuState());
  const mountedRef = useRef(true);
  const [state, setRenderedState] = useState(stateRef.current);
  const [loadError, setLoadError] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState<DialogEditor<Category> | null>(null);
  const [dishEditor, setDishEditor] = useState<(DialogEditor<Dish> & { categoryId: string | null }) | null>(null);
  const [pendingAvailability, setPendingAvailability] = useState<Set<string>>(new Set());
  const [availabilityError, setAvailabilityError] = useState(false);
  const lastDialogTrigger = useRef<HTMLElement | null>(null);
  const availabilityRevisions = useRef(new Map<string, number>());

  const commit = useCallback((next: MenuState | ((current: MenuState) => MenuState)) => {
    const value = typeof next === "function" ? next(stateRef.current) : next;
    stateRef.current = value;
    if (mountedRef.current) setRenderedState(value);
    return value;
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const categoriesLoad = beginLoad(stateRef.current, "categories");
    commit(categoriesLoad.state);
    const dishesLoad = beginLoad(stateRef.current, "dishes");
    commit(dishesLoad.state);

    const [categoriesResult, dishesResult] = await Promise.allSettled([
      api.categories.list(),
      api.dishes.list(),
    ]);
    let failed = false;
    if (categoriesResult.status === "fulfilled") {
      commit((current) => completeLoad(current, categoriesLoad.token, categoriesResult.value));
    } else {
      const before = stateRef.current;
      const next = failLoad(before, categoriesLoad.token, categoriesResult.reason);
      commit(next);
      failed ||= next !== before;
    }
    if (dishesResult.status === "fulfilled") {
      commit((current) => completeLoad(current, dishesLoad.token, dishesResult.value));
    } else {
      const before = stateRef.current;
      const next = failLoad(before, dishesLoad.token, dishesResult.reason);
      commit(next);
      failed ||= next !== before;
    }
    if (failed && mountedRef.current) setLoadError(true);
  }, [api, commit]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      stateRef.current = invalidateMenuState(stateRef.current);
    };
  }, [load]);

  const openCategory = (category: Category | null) => {
    lastDialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opened = beginDialog(stateRef.current, "category");
    commit(opened.state);
    setCategoryEditor({ entity: category, token: opened.token });
  };

  const openDish = (dish: Dish | null, categoryId: string | null) => {
    lastDialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opened = beginDialog(stateRef.current, "dish");
    commit(opened.state);
    setDishEditor({ entity: dish, categoryId, token: opened.token });
  };

  const dialogIsCurrent = (key: "category" | "dish", editor: DialogEditor<unknown>) =>
    mountedRef.current
    && editor.token.generation === stateRef.current.generation
    && stateRef.current.dialogs[key] === editor.token.revision;

  const submitCategory = async (input: CategoryInput) => {
    const editor = categoryEditor;
    if (!editor) return false;
    const id = editor.entity?.id ?? `new-category-${editor.token.revision}`;
    const mutation = beginMutation(stateRef.current, "categories", id);
    commit(mutation.state);
    const isCurrent = () => mountedRef.current && stateRef.current.generation === mutation.token.generation;
    try {
      const result = editor.entity
        ? await api.categories.update(editor.entity.id, input)
        : await api.categories.create(input);
      const currentBefore = dialogIsCurrent("category", editor);
      commit((current) => editor.entity
        ? completeMutation(current, mutation.token, result, editor.token)
        : completeCreate(current, mutation.token, result));
      const currentAfter = currentBefore && dialogIsCurrent("category", editor);
      if (currentAfter) toast.success(editor.entity ? "Категория обновлена." : "Категория создана.");
      return currentAfter;
    } catch (error) {
      commit((current) => failMutation(current, mutation.token, error));
      if (!isCurrent()) return false;
      throw error;
    }
  };

  const submitDish = async (input: DishInput) => {
    const editor = dishEditor;
    if (!editor) return false;
    const id = editor.entity?.id ?? `new-dish-${editor.token.revision}`;
    const mutation = beginMutation(stateRef.current, "dishes", id);
    commit(mutation.state);
    const isCurrent = () => mountedRef.current && stateRef.current.generation === mutation.token.generation;
    try {
      const result = editor.entity
        ? await api.dishes.update(editor.entity.id, input)
        : await api.dishes.create(input);
      const currentBefore = dialogIsCurrent("dish", editor);
      commit((current) => editor.entity
        ? completeMutation(current, mutation.token, result, editor.token)
        : completeCreate(current, mutation.token, result));
      const currentAfter = currentBefore && dialogIsCurrent("dish", editor);
      if (currentAfter) toast.success(editor.entity ? "Блюдо обновлено." : "Блюдо создано.");
      return currentAfter;
    } catch (error) {
      commit((current) => failMutation(current, mutation.token, error));
      if (!isCurrent()) return false;
      throw error;
    }
  };

  const toggleAvailability = async (dish: Dish, next: boolean) => {
    const mutation = beginMutation(stateRef.current, "dishes", dish.id);
    const isCurrent = () => mountedRef.current && stateRef.current.generation === mutation.token.generation;
    const optimistic = {
      ...mutation.state,
      dishes: mutation.state.dishes.map((item) => item.id === dish.id ? { ...item, isAvailable: next } : item),
    };
    commit(optimistic);
    setAvailabilityError(false);
    availabilityRevisions.current.set(dish.id, mutation.token.revision);
    setPendingAvailability((current) => new Set(current).add(dish.id));
    try {
      const result = await api.dishes.setAvailability(dish.id, next);
      commit((current) => completeMutation(current, mutation.token, result));
      if (
        isCurrent()
        && availabilityRevisions.current.get(dish.id) === mutation.token.revision
        && stateRef.current.mutations[`dishes:${dish.id}`] === mutation.token.revision
      ) {
        toast.success(next ? "Блюдо показано в меню." : "Блюдо скрыто из меню.");
      }
    } catch (error) {
      const before = stateRef.current;
      const failed = failMutation(before, mutation.token, error);
      if (failed !== before) {
        commit({
          ...failed,
          dishes: failed.dishes.map((item) => item.id === dish.id ? dish : item),
        });
        setAvailabilityError(true);
        toast.error("Не удалось изменить доступность блюда.");
      }
    } finally {
      if (isCurrent() && availabilityRevisions.current.get(dish.id) === mutation.token.revision) {
        availabilityRevisions.current.delete(dish.id);
        setPendingAvailability((current) => {
          const nextPending = new Set(current);
          nextPending.delete(dish.id);
          return nextPending;
        });
      }
    }
  };

  const deleteEntity = async (resource: "categories" | "dishes", id: string): Promise<DeleteResult> => {
    const deletion = beginDelete(stateRef.current, resource, id);
    commit(deletion.state);
    const isCurrent = () => mountedRef.current && stateRef.current.generation === deletion.token.generation;
    try {
      if (resource === "categories") await api.categories.delete(id);
      else await api.dishes.delete(id);
      if (!isCurrent()) return { ok: false, message: "" };
      commit((current) => completeDelete(current, deletion.token));
      toast.success(resource === "categories" ? "Категория удалена." : "Блюдо удалено.");
      return { ok: true };
    } catch (error) {
      if (!isCurrent()) return { ok: false, message: "" };
      commit((current) => settleDelete(current, deletion.token, "failure"));
      return {
        ok: false,
        message: error instanceof AdminApiError
          ? error.message
          : resource === "categories"
            ? "Не удалось удалить категорию. Попробуйте ещё раз."
            : "Не удалось удалить блюдо. Попробуйте ещё раз.",
      };
    }
  };

  const categories = useMemo(() => sortByMenuOrder(state.categories), [state.categories]);
  const initialLoading = state.loading.categories > 0 && state.loading.dishes > 0
    && state.categories.length === 0 && state.dishes.length === 0;
  const availableCount = state.dishes.filter((dish) => dish.isAvailable).length;

  return (
    <section data-menu-page="true" className="flex min-w-0 max-w-full flex-col gap-6">
      <Toaster />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2" aria-label="Сводка меню">
          <Badge variant="secondary">{state.categories.length} {pluralizeRussian(state.categories.length, "категория")}</Badge>
          <Badge variant="secondary">{state.dishes.length} {pluralizeRussian(state.dishes.length, "блюдо")}</Badge>
          <Badge variant="outline">{availableCount} доступно</Badge>
        </div>
        <Button type="button" className="min-h-11" onClick={() => openCategory(null)}>
          <Plus data-icon="inline-start" />Добавить категорию
        </Button>
      </div>

      {availabilityError && (
        <Alert variant="destructive">
          <AlertTitle>Доступность не изменена</AlertTitle>
          <AlertDescription>Не удалось изменить доступность блюда. Попробуйте ещё раз.</AlertDescription>
        </Alert>
      )}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Меню не загружено</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            Не удалось загрузить меню. Попробуйте ещё раз.
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void load()}>
              <RefreshCw data-icon="inline-start" />Повторить
            </Button>
          </AlertDescription>
        </Alert>
      ) : initialLoading ? (
        <div className="grid min-w-0 gap-4">
          {[0, 1].map((item) => (
            <Card key={item}>
              <CardHeader>
                <CardTitle><Skeleton className="h-5 w-40" /></CardTitle>
                <CardDescription><Skeleton className="h-4 w-24" /></CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Utensils /></EmptyMedia>
            <EmptyTitle>Категорий пока нет</EmptyTitle>
            <EmptyDescription>Создайте первую категорию, чтобы добавить блюда.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" className="min-h-11" onClick={() => openCategory(null)}>
              <Plus data-icon="inline-start" />Добавить категорию
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid min-w-0 gap-5">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              dishes={state.dishes.filter((dish) => dish.categoryId === category.id)}
              pendingAvailability={pendingAvailability}
              onAddDish={() => openDish(null, category.id)}
              onEditCategory={() => openCategory(category)}
              onEditDish={(dish) => openDish(dish, dish.categoryId)}
              onAvailability={(dish, next) => void toggleAvailability(dish, next)}
              onDeleteDish={(dish) => deleteEntity("dishes", dish.id)}
              onDeleteCategory={() => deleteEntity("categories", category.id)}
            />
          ))}
        </div>
      )}

      <CategoryDialog
        category={categoryEditor?.entity ?? null}
        open={Boolean(categoryEditor)}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryEditor(null);
            queueMicrotask(() => lastDialogTrigger.current?.focus());
          }
        }}
        onSubmit={submitCategory}
      />
      <DishDialog
        dish={dishEditor?.entity ?? null}
        initialCategoryId={dishEditor?.categoryId ?? null}
        categories={categories}
        open={Boolean(dishEditor)}
        onOpenChange={(open) => {
          if (!open) {
            setDishEditor(null);
            queueMicrotask(() => lastDialogTrigger.current?.focus());
          }
        }}
        onSubmit={submitDish}
      />
    </section>
  );
}
