import { useEffect, useId, useState } from "react";
import { ImageOff, X } from "lucide-react";

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError } from "@/lib/api";
import { normalizePhotoUrl, sortByMenuOrder } from "@/lib/format";
import type { Category, Dish, DishInput } from "@/lib/types";
import { useAsyncRevision } from "./use-async-revision";

type Errors = Partial<Record<"name" | "category" | "price" | "costPrice" | "photoUrl" | "sortOrder" | "form", string>>;
const MAX_SORT_ORDER = 2147483647;
const SORT_ORDER_ERROR = `Порядок сортировки должен быть целым числом от 0 до ${MAX_SORT_ORDER}.`;

function validSortOrder(value: string) {
  return /^\d+$/.test(value) && Number(value) <= MAX_SORT_ORDER;
}

export function DishDialog({
  dish,
  initialCategoryId,
  categories,
  open,
  onOpenChange,
  onSubmit,
}: {
  dish: Dish | null;
  initialCategoryId: string | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: DishInput) => Promise<boolean>;
}) {
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isAvailable, setIsAvailable] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const { begin, invalidate, isCurrent } = useAsyncRevision();

  useEffect(() => {
    invalidate();
    if (!open) return;
    setName(dish?.name ?? "");
    setDescription(dish?.description ?? "");
    setPrice(dish?.price ?? "");
    setCostPrice(dish?.costPrice ?? "");
    setPhotoUrl(dish?.photoUrl ?? "");
    setCategoryId(dish?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? "");
    setSortOrder(String(dish?.sortOrder ?? 0));
    setIsAvailable(dish?.isAvailable ?? true);
    setPreviewFailed(false);
    setErrors({});
    setPending(false);
  }, [categories, dish, initialCategoryId, invalidate, open]);

  const safePhotoUrl = normalizePhotoUrl(photoUrl);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors: Errors = {};
    if (!name.trim()) nextErrors.name = "Введите название блюда.";
    if (!categoryId) nextErrors.category = "Выберите категорию.";
    if (!price.trim() || !/^\d+(?:\.\d{1,2})?$/.test(price.trim()) || Number(price) < 0) {
      nextErrors.price = "Введите корректную цену больше или равную нулю.";
    }
    if (costPrice.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(costPrice.trim()) || Number(costPrice) < 0)) {
      nextErrors.costPrice = "Введите корректную себестоимость больше или равную нулю.";
    }
    if (photoUrl.trim() && !safePhotoUrl) {
      nextErrors.photoUrl = "Укажите безопасную ссылку http(s) или путь от корня сайта.";
    }
    if (!validSortOrder(sortOrder.trim())) nextErrors.sortOrder = SORT_ORDER_ERROR;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const revision = begin();
    setPending(true);
    setErrors({});
    try {
      const success = await onSubmit({
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        price: price.trim(),
        cost_price: costPrice.trim() || null,
        photo_url: safePhotoUrl,
        is_available: isAvailable,
        sort_order: Number(sortOrder),
      });
      if (isCurrent(revision) && success) onOpenChange(false);
    } catch (error) {
      if (isCurrent(revision)) {
        setErrors({
          form: error instanceof AdminApiError
            ? error.message
            : "Не удалось сохранить блюдо. Попробуйте ещё раз.",
        });
      }
    } finally {
      if (isCurrent(revision)) setPending(false);
    }
  };

  const textField = (
    key: "name" | "price" | "costPrice" | "photoUrl" | "sortOrder",
    label: string,
    value: string,
    setValue: (value: string) => void,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={id(key)}>{label}</FieldLabel>
      <Input
        id={id(key)}
        className="min-h-11"
        value={value}
        onChange={(event) => { setValue(event.target.value); if (key === "photoUrl") setPreviewFailed(false); }}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${id(key)}-error` : undefined}
        disabled={pending}
        {...props}
      />
      <FieldError id={`${id(key)}-error`}>{errors[key]}</FieldError>
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg" aria-describedby={id("description")}>
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="absolute top-2 right-2 min-h-11 min-w-11" aria-label="Закрыть">
            <X data-icon="inline-start" /><span className="sr-only">Закрыть</span>
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle className="min-w-0 pr-10 [overflow-wrap:anywhere]">{dish ? "Изменить блюдо" : "Новое блюдо"}</DialogTitle>
          <DialogDescription id={id("description")} className="min-w-0 [overflow-wrap:anywhere]">
            Заполните данные блюда. Пустые описание, себестоимость и фото будут сохранены как отсутствующие.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <FieldGroup>
            {textField("name", "Название блюда", name, setName, { autoFocus: true })}
            <Field data-invalid={Boolean(errors.category)}>
              <FieldLabel htmlFor={id("category")}>Категория</FieldLabel>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={pending}>
                <SelectTrigger id={id("category")} className="min-h-11 w-full" aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? `${id("category")}-error` : undefined}>
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sortByMenuOrder(categories).map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError id={`${id("category")}-error`}>{errors.category}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={id("description-field")}>Описание</FieldLabel>
              <Textarea id={id("description-field")} value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} />
            </Field>
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              {textField("price", "Цена", price, setPrice, { inputMode: "decimal" })}
              {textField("costPrice", "Себестоимость", costPrice, setCostPrice, { inputMode: "decimal" })}
            </div>
            {textField("photoUrl", "Ссылка на фото", photoUrl, setPhotoUrl, { type: "url" })}
            {safePhotoUrl && (
              <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-lg border" aria-live="polite">
                {previewFailed ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><ImageOff />Не удалось показать фото</p>
                ) : (
                  <img className="max-h-40 max-w-full object-contain" src={safePhotoUrl} alt={`Предпросмотр: ${name || "блюдо"}`} onError={() => setPreviewFailed(true)} />
                )}
              </div>
            )}
            {textField("sortOrder", "Порядок сортировки", sortOrder, setSortOrder, {
              type: "number",
              min: 0,
              max: MAX_SORT_ORDER,
              step: 1,
            })}
            <Field orientation="horizontal">
              <FieldLabel htmlFor={id("available")} className="min-h-11 cursor-pointer items-center">Блюдо доступно</FieldLabel>
              <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
                <Switch id={id("available")} checked={isAvailable} onCheckedChange={setIsAvailable} disabled={pending} aria-describedby={id("available-description")} />
              </span>
              <FieldDescription id={id("available-description")}>Показывать блюдо гостям в меню.</FieldDescription>
            </Field>
          </FieldGroup>
          <FieldError>{errors.form}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={pending}>Отмена</Button>
            <Button type="submit" className="min-h-11" disabled={pending}>{dish ? "Сохранить блюдо" : "Создать блюдо"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
