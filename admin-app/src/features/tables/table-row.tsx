import { Download, Trash2 } from "lucide-react";
import type { Table as TableModel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow as UiTableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function TableRow({ table, deleting, downloading, deleteError, downloadError, onDelete, onDownload }: {
  table: TableModel; deleting: boolean; downloading: boolean; deleteError?: string; downloadError?: string;
  onDelete: () => Promise<boolean>; onDownload: () => void;
}) {
  const createdAt = new Date(table.createdAt);
  const createdLabel = Number.isNaN(createdAt.getTime())
    ? "Дата неизвестна"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(createdAt);
  return <UiTableRow>
    <TableCell className="max-w-64 whitespace-normal font-medium [overflow-wrap:anywhere]">{table.number}</TableCell>
    <TableCell className="whitespace-nowrap">{createdLabel}</TableCell>
    <TableCell>
      <div className="flex min-w-max flex-col items-start gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="min-h-11" disabled={downloading || deleting} aria-label={`Скачать QR-код стола «${table.number}»`} onClick={onDownload}><Download data-icon="inline-start" />Скачать QR-код</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button type="button" variant="outline" className="min-h-11" disabled={deleting || downloading} aria-label={`Удалить стол «${table.number}»`}><Trash2 data-icon="inline-start" />Удалить</Button></AlertDialogTrigger>
          <AlertDialogContent className="min-w-0 [overflow-wrap:anywhere]">
            <AlertDialogHeader><AlertDialogTitle className="min-w-0 [overflow-wrap:anywhere]">Удалить стол «{table.number}»?</AlertDialogTitle><AlertDialogDescription>Действие нельзя отменить. Стол с активной сессией или историей заказов удалить нельзя.</AlertDialogDescription></AlertDialogHeader>
            {deleteError && <p role="alert" className="text-destructive text-sm [overflow-wrap:anywhere]">{deleteError}</p>}
            <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" className="min-h-11" disabled={deleting} onClick={(event) => { event.preventDefault(); void onDelete(); }}>Удалить стол</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {downloadError && <p role="alert" className="mt-2 text-destructive text-sm [overflow-wrap:anywhere]">{downloadError}</p>}
    </TableCell>
  </UiTableRow>;
}
