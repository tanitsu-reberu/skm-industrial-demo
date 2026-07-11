"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  adminDeleteServiceAction,
  adminSaveServiceAction,
  adminUploadServiceImagesAction,
} from "@/lib/service-actions";
import { serviceCategories } from "@/lib/services";
import { formatMoney } from "@/lib/utils";

type AdminServiceItem = {
  id: number;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  priceUnit: string;
  category: string;
  estimatedDuration: string;
  image: string;
  gallery: string[];
  included: string[];
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  isActive: boolean;
  sortOrder: number;
};

type Draft = {
  id: number;
  title: string;
  category: string;
  shortDescription: string;
  description: string;
  price: string;
  priceUnit: string;
  estimatedDuration: string;
  image: string;
  gallery: string[];
  included: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  isActive: boolean;
  slug: string;
};

const publicCategories = serviceCategories.filter((category) => category !== "Все");

function emptyDraft(): Draft {
  return {
    id: 0,
    title: "",
    category: publicCategories[0],
    shortDescription: "",
    description: "",
    price: "",
    priceUnit: "",
    estimatedDuration: "",
    image: "",
    gallery: [],
    included: "",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    isActive: true,
    slug: "",
  };
}

function serviceToDraft(service: AdminServiceItem): Draft {
  return {
    id: service.id,
    title: service.title,
    category: service.category,
    shortDescription: service.shortDescription,
    description: service.description,
    price: String(service.price),
    priceUnit: service.priceUnit,
    estimatedDuration: service.estimatedDuration,
    image: service.image,
    gallery: service.gallery,
    included: service.included.join("\n"),
    seoTitle: service.seoTitle,
    seoDescription: service.seoDescription,
    seoKeywords: service.seoKeywords,
    isActive: service.isActive,
    slug: service.slug,
  };
}

const fieldClass =
  "focus-ring h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-white placeholder:text-muted";
const areaClass =
  "focus-ring w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-white placeholder:text-muted";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted";

export function AdminServicesManager({ services }: { services: AdminServiceItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminServiceItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return services;
    return services.filter((service) =>
      [service.title, service.category, service.shortDescription].some((field) =>
        field.toLowerCase().includes(normalized),
      ),
    );
  }, [query, services]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (list.length === 0) return;

      setIsUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        for (const file of list) formData.append("files", file);
        const result = await adminUploadServiceImagesAction(formData);
        if (!result.ok || !result.urls) {
          setError(result.message);
          return;
        }
        setDraft((current) => {
          if (!current) return current;
          const urls = result.urls!;
          const image = current.image || urls[0];
          const gallery = [...current.gallery, ...urls.filter((url) => url !== image)].slice(0, 12);
          return { ...current, image, gallery };
        });
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const handleSave = () => {
    if (!draft) return;
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.set("id", String(draft.id));
    formData.set("title", draft.title);
    formData.set("category", draft.category);
    formData.set("shortDescription", draft.shortDescription);
    formData.set("description", draft.description);
    formData.set("price", draft.price || "0");
    formData.set("priceUnit", draft.priceUnit);
    formData.set("estimatedDuration", draft.estimatedDuration);
    formData.set("image", draft.image);
    formData.set("gallery", JSON.stringify(draft.gallery));
    formData.set("included", draft.included);
    formData.set("seoTitle", draft.seoTitle);
    formData.set("seoDescription", draft.seoDescription);
    formData.set("seoKeywords", draft.seoKeywords);
    formData.set("isActive", String(draft.isActive));
    formData.set("slug", draft.slug);

    startTransition(async () => {
      const result = await adminSaveServiceAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      setDraft(null);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const formData = new FormData();
    formData.set("id", String(deleteTarget.id));
    startTransition(async () => {
      const result = await adminDeleteServiceAction(formData);
      setMessage(result.ok ? result.message : null);
      setError(result.ok ? null : result.message);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const previewPrice = Number(draft?.price || 0);

  return (
    <section id="services-manager" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Услуги сайта</h2>
          <p className="mt-1 text-sm text-muted">
            Каталог: {services.length} услуг, скрытых: {services.filter((service) => !service.isActive).length}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск услуги…"
              className="pl-9 sm:w-56"
              aria-label="Поиск по услугам"
            />
          </div>
          <Button onClick={() => { setDraft(emptyDraft()); setError(null); setMessage(null); }}>
            <Plus className="mr-2 h-4 w-4" />
            Новая услуга
          </Button>
        </div>
      </div>

      {message ? <p className="border-b border-border px-5 py-3 text-sm text-emerald-400 md:px-6">{message}</p> : null}
      {error && !draft ? <p className="border-b border-border px-5 py-3 text-sm text-red-400 md:px-6">{error}</p> : null}

      <ul className="divide-y divide-border">
        {filtered.map((service) => (
          <li key={service.id} className="flex items-center gap-4 p-4 md:px-6">
            <div className="relative hidden h-14 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-surface sm:block">
              {service.image ? (
                <Image src={service.image || "/placeholder.svg"} alt="" fill className="object-cover" sizes="96px" />
              ) : (
                <div className="grid h-full place-items-center text-muted">
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium text-white">{service.title}</p>
                {!service.isActive ? (
                  <Badge className="border-yellow-500/40 bg-yellow-500/10 text-yellow-400">Скрыта</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {service.category} · от {formatMoney(service.price)}
                {service.priceUnit ? ` ${service.priceUnit}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setDraft(serviceToDraft(service)); setError(null); setMessage(null); }}
              >
                <Pencil className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Изменить</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(service)} aria-label={`Удалить ${service.title}`}>
                <Trash2 className="h-4 w-4 text-red-400" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
        {filtered.length === 0 ? <li className="p-6 text-center text-sm text-muted">Ничего не найдено</li> : null}
      </ul>

      {/* Редактор услуги */}
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Редактирование услуги" : "Новая услуга"}</DialogTitle>
            <DialogDescription>
              Заполните поля — предпросмотр карточки обновляется в реальном времени.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div>
                  <label htmlFor="svc-title" className={labelClass}>Название услуги</label>
                  <input id="svc-title" className={fieldClass} value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Монтаж приточной вентиляции" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="svc-category" className={labelClass}>Категория</label>
                    <select id="svc-category" className={fieldClass} value={draft.category} onChange={(event) => set("category", event.target.value)}>
                      {publicCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="svc-duration" className={labelClass}>Длительность работ</label>
                    <input id="svc-duration" className={fieldClass} value={draft.estimatedDuration} onChange={(event) => set("estimatedDuration", event.target.value)} placeholder="1-2 рабочих дня" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="svc-price" className={labelClass}>Цена «от», ₽</label>
                    <input id="svc-price" type="number" min={0} className={fieldClass} value={draft.price} onChange={(event) => set("price", event.target.value)} placeholder="85000" />
                  </div>
                  <div>
                    <label htmlFor="svc-unit" className={labelClass}>Единица измерения</label>
                    <input id="svc-unit" className={fieldClass} value={draft.priceUnit} onChange={(event) => set("priceUnit", event.target.value)} placeholder="за систему / за м²" />
                  </div>
                </div>

                <div>
                  <label htmlFor="svc-short" className={labelClass}>Краткое описание (для карточки)</label>
                  <textarea id="svc-short" rows={2} className={areaClass} value={draft.shortDescription} onChange={(event) => set("shortDescription", event.target.value)} placeholder="Одно-два предложения для карточки в каталоге" />
                </div>

                <div>
                  <label htmlFor="svc-desc" className={labelClass}>Полное описание</label>
                  <textarea id="svc-desc" rows={5} className={areaClass} value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Подробное описание услуги для её страницы" />
                </div>

                <div>
                  <label htmlFor="svc-included" className={labelClass}>Что входит (каждый пункт с новой строки)</label>
                  <textarea id="svc-included" rows={4} className={areaClass} value={draft.included} onChange={(event) => set("included", event.target.value)} placeholder={"Выезд и замеры\nМонтаж оборудования\nПусконаладка"} />
                </div>

                {/* Галерея фото */}
                <div>
                  <span className={labelClass}>Фотографии (первое — главное)</span>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Загрузить фотографии: перетащите файлы или нажмите"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
                    onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragOver(false);
                      void uploadFiles(event.dataTransfer.files);
                    }}
                    className={`focus-ring grid min-h-24 cursor-pointer place-items-center rounded-md border-2 border-dashed p-4 text-center transition-colors ${
                      isDragOver ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/50"
                    }`}
                  >
                    {isUploading ? (
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Загрузка…
                      </span>
                    ) : (
                      <span className="text-sm text-muted">
                        Перетащите фото сюда или <span className="text-primary">выберите файлы</span>
                        <br />
                        <span className="text-xs">JPEG, PNG, WebP — до 8 МБ</span>
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        if (event.target.files) void uploadFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </div>

                  {(draft.image || draft.gallery.length > 0) && (
                    <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {[draft.image, ...draft.gallery.filter((url) => url !== draft.image)]
                        .filter(Boolean)
                        .map((url, index) => (
                          <li key={url} className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-surface">
                            <Image src={url || "/placeholder.svg"} alt={index === 0 ? "Главное фото" : `Фото ${index + 1}`} fill className="object-cover" sizes="120px" />
                            {index === 0 ? (
                              <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                Главное
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const gallery = [draft.image, ...draft.gallery.filter((item) => item !== draft.image && item !== url)].filter(Boolean);
                                  set("image", url);
                                  setDraft((current) => (current ? { ...current, image: url, gallery } : current));
                                }}
                                className="absolute left-1 top-1 rounded bg-black/70 p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                                aria-label="Сделать главным фото"
                                title="Сделать главным"
                              >
                                <Star className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setDraft((current) => {
                                  if (!current) return current;
                                  if (url === current.image) {
                                    const rest = current.gallery.filter((item) => item !== url);
                                    return { ...current, image: rest[0] ?? "", gallery: rest.slice(1) };
                                  }
                                  return { ...current, gallery: current.gallery.filter((item) => item !== url) };
                                });
                              }}
                              className="absolute right-1 top-1 rounded bg-black/70 p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                              aria-label="Удалить фото"
                            >
                              <X className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                {/* SEO */}
                <details className="rounded-md border border-border bg-surface p-4">
                  <summary className="cursor-pointer text-sm font-medium text-white">SEO-настройки</summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="svc-seo-title" className={labelClass}>SEO title</label>
                      <input id="svc-seo-title" className={fieldClass} value={draft.seoTitle} onChange={(event) => set("seoTitle", event.target.value)} placeholder="По умолчанию — название услуги" />
                    </div>
                    <div>
                      <label htmlFor="svc-seo-desc" className={labelClass}>SEO description</label>
                      <textarea id="svc-seo-desc" rows={2} className={areaClass} value={draft.seoDescription} onChange={(event) => set("seoDescription", event.target.value)} placeholder="По умолчанию — краткое описание" />
                    </div>
                    <div>
                      <label htmlFor="svc-seo-keys" className={labelClass}>Keywords (через запятую)</label>
                      <input id="svc-seo-keys" className={fieldClass} value={draft.seoKeywords} onChange={(event) => set("seoKeywords", event.target.value)} placeholder="вентиляция, монтаж, чиллер" />
                    </div>
                    <div>
                      <label htmlFor="svc-slug" className={labelClass}>URL (slug)</label>
                      <input id="svc-slug" className={fieldClass} value={draft.slug} onChange={(event) => set("slug", event.target.value)} placeholder="Автоматически из названия" />
                    </div>
                  </div>
                </details>

                <label className="flex cursor-pointer items-center gap-3 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(event) => set("isActive", event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Услуга видна на сайте
                </label>

                {error ? <p className="text-sm text-red-400">{error}</p> : null}

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button onClick={handleSave} disabled={isPending || isUploading} className="sm:flex-1">
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {draft.id ? "Сохранить изменения" : "Создать услугу"}
                  </Button>
                  <Button variant="secondary" onClick={() => setDraft(null)} disabled={isPending}>
                    Отмена
                  </Button>
                </div>
              </div>

              {/* Живой предпросмотр карточки */}
              <aside aria-label="Предпросмотр карточки услуги" className="hidden lg:block">
                <p className={labelClass}>Предпросмотр карточки</p>
                <article className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface">
                    {draft.image ? (
                      <Image src={draft.image || "/placeholder.svg"} alt="" fill className="object-cover opacity-90" sizes="320px" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted">
                        <ImagePlus className="h-8 w-8" aria-hidden="true" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <Badge className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate border-primary/40 bg-black/75 text-white">
                      {draft.category}
                    </Badge>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-base font-semibold leading-snug text-white">
                      {draft.title || "Название услуги"}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                      {draft.shortDescription || "Краткое описание для карточки в каталоге."}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted">{draft.estimatedDuration || "Срок работ"}</span>
                      <span className="font-display text-base font-semibold text-white">
                        от {formatMoney(previewPrice)}
                        {draft.priceUnit ? <span className="text-xs font-normal text-muted"> {draft.priceUnit}</span> : null}
                      </span>
                    </div>
                  </div>
                </article>
                {!draft.isActive ? (
                  <p className="mt-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                    Услуга скрыта — на сайте не отображается.
                  </p>
                ) : null}
              </aside>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить услугу?</DialogTitle>
            <DialogDescription>
              «{deleteTarget?.title}» будет удалена с сайта без возможности восстановления. Лучше скрыть услугу, если она может понадобиться позже.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleDelete} disabled={isPending} className="sm:flex-1">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Удалить навсегда
            </Button>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
