import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sortByMenuOrder } from "@/lib/format";
import type { Category, Dish } from "@/lib/types";
import { DishRow } from "./dish-row";
import { useAsyncRevision } from "./use-async-revision";

type DeleteResult = { ok: true } | { ok: false; message: string };

export function CategorySection({
  category,
  dishes,
  pendingAvailability,
  onAddDish,
  onEditCategory,
  onEditDish,
  onAvailability,
  onDeleteDish,
  onDeleteCategory,
}: {
  category: Category;
  dishes: Dish[];
  pendingAvailability: Set<string>;
  onAddDish: () => void;
  onEditCategory: () => void;
  onEditDish: (dish: Dish) => void;
  onAvailability: (dish: Dish, next: boolean) => void;
  onDeleteDish: (dish: Dish) => Promise<DeleteResult>;
  onDeleteCategory: () => Promise<DeleteResult>;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletion = useAsyncRevision();

  const removeCategory = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const revision = deletion.begin();
    try {
      const result = await onDeleteCategory();
      if (!deletion.isCurrent(revision)) return;
      if (result.ok) setDeleteOpen(false);
      else setDeleteError(result.message);
    } catch {
      if (deletion.isCurrent(revision)) {
        setDeleteError("Не удалось удалить категорию. Попробуйте ещё раз.");
      }
    } finally {
      if (deletion.isCurrent(revision)) setDeleting(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="min-w-0">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <CardTitle><h2 className="min-w-0 [overflow-wrap:anywhere]">{category.name}</h2></CardTitle>
            <CardDescription>Порядок: {category.sortOrder}</CardDescription>
          </div>
          <div data-category-actions="true" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" className="min-h-11" onClick={onAddDish} aria-label={`Добавить блюдо в категорию «${category.name}»`}>
              <Plus data-icon="inline-start" />Добавить блюдо
            </Button>
            <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={onEditCategory} aria-label={`Изменить категорию «${category.name}»`}>
              <Pencil data-icon="inline-start" /><span className="max-w-20 truncate">Изменить</span>
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label={`Удалить категорию «${category.name}»`}>
                  <Trash2 data-icon="inline-start" /><span className="max-w-20 truncate">Удалить</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="min-w-0 [overflow-wrap:anywhere]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить категорию «{category.name}»?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Категория будет удалена. Если в ней есть блюда, сервер может отклонить действие. Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <Alert variant="destructive">
                    <AlertTitle>Не удалось удалить категорию</AlertTitle>
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-11" disabled={deleting}>Отмена</AlertDialogCancel>
                  <AlertDialogAction className="min-h-11" variant="destructive" disabled={deleting} onClick={removeCategory}>Удалить категорию</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {dishes.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>В этой категории пока нет блюд</EmptyTitle>
              <EmptyDescription>Добавьте первое блюдо в эту категорию.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="menu-dishes-table table-fixed" containerProps={{ className: "overflow-x-hidden" }}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">Блюдо</TableHead>
                <TableHead>Цена</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortByMenuOrder(dishes).map((dish) => (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  availabilityPending={pendingAvailability.has(dish.id)}
                  onEdit={() => onEditDish(dish)}
                  onAvailability={(next) => onAvailability(dish, next)}
                  onDelete={() => onDeleteDish(dish)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
