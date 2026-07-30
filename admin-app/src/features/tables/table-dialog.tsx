import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { AdminApiError } from "@/lib/api";
import type { Table, TableInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const MAX_LENGTH = 32;

export function TableDialog({ table, existingNumbers, open, onOpenChange, onSubmit }: {
  table: Table | null; existingNumbers: string[]; open: boolean;
  onOpenChange: (open: boolean) => void; onSubmit: (input: TableInput) => Promise<boolean>;
}) {
  const id = useId();
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!open) return;
    revision.current += 1;
    setNumber(table?.number ?? "");
    setError("");
    setPending(false);
  }, [open, table]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const value = number.trim();
    const duplicate = existingNumbers.some((item) => item === value && item !== table?.number);
    if (!value) return setError("Введите номер стола.");
    if (value.length > MAX_LENGTH) return setError(`Номер стола должен быть не длиннее ${MAX_LENGTH} символов.`);
    if (duplicate) return setError("Стол с таким номером уже существует.");
    const current = ++revision.current;
    setPending(true); setError("");
    try {
      if (await onSubmit({ number: value }) && current === revision.current) onOpenChange(false);
    } catch (reason) {
      if (current === revision.current) setError(reason instanceof AdminApiError ? reason.message : "Не удалось сохранить стол. Попробуйте ещё раз.");
    } finally {
      if (current === revision.current) setPending(false);
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} aria-describedby={`${id}-description`}>
      <DialogClose asChild><Button type="button" variant="ghost" className="absolute top-2 right-2 min-h-11 min-w-11" aria-label="Закрыть"><X data-icon="inline-start" /><span className="sr-only">Закрыть</span></Button></DialogClose>
      <DialogHeader><DialogTitle>{table ? "Изменить стол" : "Новый стол"}</DialogTitle><DialogDescription id={`${id}-description`}>Укажите номер или название стола.</DialogDescription></DialogHeader>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldGroup><Field data-invalid={Boolean(error)}><FieldLabel htmlFor={id}>Номер стола</FieldLabel><Input id={id} className="min-h-11 [overflow-wrap:anywhere]" value={number} onChange={(event) => setNumber(event.target.value)} aria-invalid={Boolean(error)} disabled={pending} autoFocus /><FieldError>{error}</FieldError></Field></FieldGroup>
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={pending}>Отмена</Button><Button type="submit" className="min-h-11" disabled={pending}>{table ? "Сохранить стол" : "Создать стол"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
