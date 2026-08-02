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
  return <UiTableRow data-table-card-row className="grid grid-cols-[minmax(0,1fr)_auto] rounded-lg border bg-card md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent">
    <TableCell data-table-number headers="tables-number-heading" className="block min-w-0 whitespace-normal p-3 font-medium [overflow-wrap:anywhere] md:table-cell md:max-w-64 md:p-2"><span aria-hidden="true" className="block text-xs text-muted-foreground md:hidden">Стол</span><span>{table.number}</span></TableCell>
    <TableCell data-table-created headers="tables-created-heading" className="block min-w-0 whitespace-nowrap p-3 text-right md:table-cell md:p-2 md:text-left"><span aria-hidden="true" className="block text-xs text-muted-foreground md:hidden">Создан</span><span>{createdLabel}</span></TableCell>
    <TableCell data-table-actions headers="tables-actions-heading" className="col-span-2 block min-w-0 border-t p-2 md:table-cell md:border-t-0">
      <div className="grid grid-cols-2 gap-2 md:flex md:min-w-max md:flex-row md:items-start">
        <Button type="button" variant="outline" className="min-h-11 min-w-11 w-full md:w-auto" disabled={downloading || deleting} aria-label={`Скачать QR-код стола «${table.number}»`} onClick={onDownload}><Download data-icon="inline-start" /><span className="md:hidden">Скачать QR</span><span className="hidden md:inline">Скачать QR-код</span></Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button type="button" variant="outline" className="min-h-11 min-w-11 w-full md:w-auto" disabled={deleting || downloading} aria-label={`Удалить стол «${table.number}»`}><Trash2 data-icon="inline-start" />Удалить</Button></AlertDialogTrigger>
          <AlertDialogContent className="min-w-0 [overflow-wrap:anywhere]">
            <AlertDialogHeader><AlertDialogTitle className="min-w-0 [overflow-wrap:anywhere]">Удалить стол «{table.number}»?</AlertDialogTitle><AlertDialogDescription>Действие нельзя отменить. Стол с активной сессией или историей заказов удалить нельзя.</AlertDialogDescription></AlertDialogHeader>
            {deleteError && <p role="alert" className="text-destructive text-sm [overflow-wrap:anywhere]">{deleteError}</p>}
            <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" className="min-h-11" disabled={deleting} onClick={(event) => { event.preventDefault(); void onDelete(); }}>Удалить стол</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {downloadError && <p role="alert" className="mt-2 min-w-0 text-destructive text-sm [overflow-wrap:anywhere]">{downloadError}</p>}
    </TableCell>
  </UiTableRow>;
}
