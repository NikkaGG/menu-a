import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/lib/api";
import type { Category, CategoryInput } from "@/lib/types";

const MAX_SORT_ORDER = 2147483647;
const SORT_ORDER_ERROR = `Порядок сортировки должен быть целым числом от 0 до ${MAX_SORT_ORDER}.`;

function validSortOrder(value: string) {
  return /^\d+$/.test(value) && Number(value) <= MAX_SORT_ORDER;
}

export function CategoryDialog({
  category,
  open,
  onOpenChange,
  onSubmit,
}: {
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CategoryInput) => Promise<boolean>;
}) {
  const nameId = useId();
  const orderId = useId();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [errors, setErrors] = useState<{ name?: string; sortOrder?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const submissionRevision = useRef(0);

  useEffect(() => {
    if (!open) return;
    submissionRevision.current += 1;
    setName(category?.name ?? "");
    setSortOrder(String(category?.sortOrder ?? 0));
    setErrors({});
    setPending(false);
  }, [category, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "Введите название категории.";
    if (!validSortOrder(sortOrder.trim())) nextErrors.sortOrder = SORT_ORDER_ERROR;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const revision = ++submissionRevision.current;
    setPending(true);
    setErrors({});
    try {
      const success = await onSubmit({ name: name.trim(), sort_order: Number(sortOrder) });
      if (revision === submissionRevision.current && success) onOpenChange(false);
    } catch (error) {
      if (revision === submissionRevision.current) {
        setErrors({
          form: error instanceof AdminApiError
            ? error.message
            : "Не удалось сохранить категорию. Попробуйте ещё раз.",
        });
      }
    } finally {
      if (revision === submissionRevision.current) setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} aria-describedby={`${nameId}-description`}>
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="absolute top-2 right-2 min-h-11 min-w-11" aria-label="Закрыть">
            <X data-icon="inline-start" /><span className="sr-only">Закрыть</span>
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle className="min-w-0 pr-10 [overflow-wrap:anywhere]">{category ? "Изменить категорию" : "Новая категория"}</DialogTitle>
          <DialogDescription id={`${nameId}-description`} className="min-w-0 [overflow-wrap:anywhere]">
            Укажите название и порядок отображения категории.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={nameId}>Название категории</FieldLabel>
              <Input
                id={nameId}
                className="min-h-11"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${nameId}-error` : undefined}
                disabled={pending}
                autoFocus
              />
              <FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.sortOrder)}>
              <FieldLabel htmlFor={orderId}>Порядок сортировки</FieldLabel>
              <Input
                id={orderId}
                className="min-h-11"
                type="number"
                min="0"
                max={MAX_SORT_ORDER}
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                aria-invalid={Boolean(errors.sortOrder)}
                aria-describedby={errors.sortOrder ? `${orderId}-error` : undefined}
                disabled={pending}
              />
              <FieldError id={`${orderId}-error`}>{errors.sortOrder}</FieldError>
            </Field>
          </FieldGroup>
          <FieldError>{errors.form}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {category ? "Сохранить категорию" : "Создать категорию"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
