import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminApiError, createAdminApi, type AdminApi } from "@/lib/api";
import { pluralizeRussian } from "@/lib/format";
import type { Table as TableModel, TableInput } from "@/lib/types";
import { TableDialog } from "./table-dialog";
import { TableRow as ManagedTableRow } from "./table-row";
import { beginCreate, beginDelete, beginDialog, beginLoad, completeCreate, completeLoad, createTablesState, failLoad, failMutation, invalidateTablesState, settleDelete, type TablesState } from "./tables-state";

const safeMessage = (error: unknown, fallback: string) => error instanceof AdminApiError ? error.message : fallback;

export function TablesPage({ api: injectedApi }: { api?: AdminApi }) {
  const [api] = useState(() => injectedApi ?? createAdminApi());
  const stateRef = useRef<TablesState>(createTablesState());
  const mountedRef = useRef(true);
  const [state, renderState] = useState(stateRef.current);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<{ table: TableModel | null; revision: number; generation: number } | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingQr, setPendingQr] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const lastDialogTrigger = useRef<HTMLElement | null>(null);
  const commit = useCallback((next: TablesState | ((current: TablesState) => TablesState)) => {
    const value = typeof next === "function" ? next(stateRef.current) : next;
    stateRef.current = value; renderState(value); return value;
  }, []);
  const load = useCallback(async () => {
    setLoadError(false);
    const begun = beginLoad(stateRef.current); commit(begun.state);
    try { const tables = await api.tables.list(); commit((current) => completeLoad(current, begun.token, tables)); }
    catch (error) { const before = stateRef.current; const next = failLoad(before, begun.token, error); commit(next); if (next !== before) setLoadError(true); }
  }, [api, commit]);
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      stateRef.current = invalidateTablesState(stateRef.current);
    };
  }, [load]);
  const openCreate = () => {
    lastDialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opened = beginDialog(stateRef.current);
    commit(opened.state);
    setEditor({ table: null, ...opened.token });
  };
  const submit = async (input: TableInput) => {
    if (!editor) return false;
    const mutation = beginCreate(stateRef.current, `new-table-${editor.revision}`); commit(mutation.state);
    try {
      const result = await api.tables.create(input);
      const current = stateRef.current.generation === editor.generation && stateRef.current.dialogRevision === editor.revision;
      commit((next) => completeCreate(next, mutation.token, result));
      if (current) toast.success("Стол создан.");
      return current;
    } catch (error) { commit((next) => failMutation(next, mutation.token, error)); throw error; }
  };
  const remove = async (table: TableModel) => {
    if (pendingDeletes.has(table.id)) return false;
    const deletion = beginDelete(stateRef.current, table.id); commit(deletion.state);
    const actionGeneration = deletion.token.generation;
    const isCurrent = () => mountedRef.current && stateRef.current.generation === actionGeneration;
    setPendingDeletes((items) => new Set(items).add(table.id));
    try {
      await api.tables.delete(table.id);
      if (!isCurrent()) return false;
      commit((next) => settleDelete(next, deletion.token, "success"));
      toast.success("Стол удалён.");
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      commit((next) => settleDelete(next, deletion.token, "failure"));
      setActionErrors((items) => ({ ...items, [table.id]: safeMessage(error, "Не удалось удалить стол. Попробуйте ещё раз.") }));
      return false;
    } finally {
      if (isCurrent()) setPendingDeletes((items) => { const next = new Set(items); next.delete(table.id); return next; });
    }
  };
  const download = async (table: TableModel) => {
    if (pendingQr.has(table.id)) return;
    const actionGeneration = stateRef.current.generation;
    const isCurrent = () => mountedRef.current && stateRef.current.generation === actionGeneration;
    setPendingQr((items) => new Set(items).add(table.id)); setActionErrors((items) => { const next = { ...items }; delete next[`qr:${table.id}`]; return next; });
    try {
      await api.tables.downloadQr(table.id, table.number);
      if (isCurrent()) toast.success("QR-код скачан.");
    } catch (error) {
      if (isCurrent()) setActionErrors((items) => ({ ...items, [`qr:${table.id}`]: safeMessage(error, "Не удалось скачать QR-код. Попробуйте ещё раз.") }));
    } finally {
      if (isCurrent()) setPendingQr((items) => { const next = new Set(items); next.delete(table.id); return next; });
    }
  };
  const numbers = useMemo(() => state.tables.map((table) => table.number), [state.tables]);
  const initialLoading = state.loading > 0 && state.tables.length === 0;
  return <section data-tables-page="true" className="flex min-w-0 max-w-full flex-col gap-6">
    <Toaster />
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap gap-2" aria-label="Сводка столов"><Badge variant="secondary">{state.tables.length} {pluralizeRussian(state.tables.length, "стол")}</Badge></div><Button type="button" className="min-h-11" onClick={openCreate}><Plus data-icon="inline-start" />Добавить стол</Button></div>
    {loadError ? <Alert variant="destructive"><AlertTitle>Столы не загружены</AlertTitle><AlertDescription className="flex flex-col items-start gap-3">Не удалось загрузить столы. Попробуйте ещё раз.<Button type="button" variant="outline" className="min-h-11" onClick={() => void load()}><RefreshCw data-icon="inline-start" />Повторить</Button></AlertDescription></Alert>
      : initialLoading ? <Card><CardHeader><CardTitle><Skeleton className="h-6 w-40" /></CardTitle></CardHeader><CardContent><Skeleton className="h-14 w-full" /><Skeleton className="mt-3 h-14 w-full" /></CardContent></Card>
      : state.tables.length === 0 ? <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><QrCode /></EmptyMedia><EmptyTitle>Столов пока нет</EmptyTitle><EmptyDescription>Создайте стол, чтобы скачать QR-код.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" className="min-h-11" onClick={openCreate}><Plus data-icon="inline-start" />Добавить стол</Button></EmptyContent></Empty>
      : <div data-table-scroll="true" data-table-scroll-region="true" className="min-w-0 max-w-full overflow-x-auto rounded-lg border"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Стол</TableHead><TableHead>Создан</TableHead><TableHead>Действия</TableHead></TableRow></TableHeader><TableBody>{state.tables.map((table) => <ManagedTableRow key={table.id} table={table} deleting={pendingDeletes.has(table.id)} downloading={pendingQr.has(table.id)} deleteError={actionErrors[table.id]} downloadError={actionErrors[`qr:${table.id}`]} onDelete={() => remove(table)} onDownload={() => void download(table)} />)}</TableBody></Table></div>}
    <TableDialog table={editor?.table ?? null} existingNumbers={numbers} open={Boolean(editor)} onOpenChange={(open) => {
      if (!open) {
        setEditor(null);
        queueMicrotask(() => lastDialogTrigger.current?.focus());
      }
    }} onSubmit={submit} />
  </section>;
}
