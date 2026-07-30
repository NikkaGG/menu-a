import { useState } from "react";
import { ImageOff, Pencil, Trash2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatMoney, normalizePhotoUrl } from "@/lib/format";
import type { Dish } from "@/lib/types";

export function DishRow({
  dish,
  availabilityPending,
  onEdit,
  onAvailability,
  onDelete,
}: {
  dish: Dish;
  availabilityPending: boolean;
  onEdit: () => void;
  onAvailability: (next: boolean) => void;
  onDelete: () => Promise<boolean>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const photoUrl = normalizePhotoUrl(dish.photoUrl);

  const remove = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      if (await onDelete()) setDeleteOpen(false);
      else setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow className="menu-dish-row">
      <TableCell className="menu-dish-cell min-w-0">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted" aria-hidden="true">
            {photoUrl && !imageFailed
              ? <img src={photoUrl} alt="" className="size-full object-cover" onError={() => setImageFailed(true)} />
              : <ImageOff />}
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="font-medium">{dish.name}</p>
            {dish.description && <p className="text-sm text-muted-foreground">{dish.description}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell className="menu-dish-cell whitespace-nowrap">{formatMoney(dish.price)}</TableCell>
      <TableCell className="menu-dish-cell">
        <Badge variant={dish.isAvailable ? "secondary" : "outline"}>
          {dish.isAvailable ? "Доступно" : "Скрыто"}
        </Badge>
      </TableCell>
      <TableCell className="menu-dish-cell">
        <div data-dish-actions="true" className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
          <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={onEdit} aria-label={`Изменить блюдо «${dish.name}»`}>
            <Pencil data-icon="inline-start" />
            <span className="sm:sr-only">Изменить блюдо «{dish.name}»</span>
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label={`Удалить блюдо «${dish.name}»`}>
                <Trash2 data-icon="inline-start" />
                <span className="sm:sr-only">Удалить блюдо «{dish.name}»</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить блюдо «{dish.name}»?</AlertDialogTitle>
                <AlertDialogDescription>Блюдо исчезнет из меню. Это действие нельзя отменить.</AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось удалить блюдо</AlertTitle>
                  <AlertDescription>Попробуйте ещё раз.</AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11" disabled={deleting}>Отмена</AlertDialogCancel>
                <AlertDialogAction className="min-h-11" variant="destructive" disabled={deleting} onClick={remove}>Удалить блюдо</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
            <Switch
              className="after:-inset-y-3.5"
              checked={dish.isAvailable}
              onCheckedChange={onAvailability}
              disabled={availabilityPending}
              aria-label={`${dish.isAvailable ? "Скрыть" : "Показать"} блюдо «${dish.name}»`}
            />
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
