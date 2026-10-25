'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Archive, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { CategoryDto, ProductDto, VariantDto } from '@f-commerce/contracts';
import { ProductUpdateSchema } from '@f-commerce/contracts';
import { AppShell } from '@/components/shell/shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  RecordCard,
  Sheet,
  Skeleton,
} from '@/components/ui/primitives';
import { ProductFields } from '@/components/catalog/product-form';
import { StockBadge } from '@/components/catalog/stock-badge';
import { useBusinessSettings } from '@/components/business/business-settings-provider';
import { isTimeoutError } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/auth-guard';
import {
  CatalogApiError,
  archiveProduct,
  deleteProduct,
  getProduct,
  removeProductImage,
  restoreProduct,
  updateProduct,
  uploadProductImages,
  uploadVariantImage,
} from '@/lib/catalog-client';
import {
  catalogMessage,
  duplicateSkuFromError,
  fieldErrorsFromIssues,
  fieldErrorsFromServer,
  type DuplicateSkuNotice,
} from '@/lib/catalog-errors';
import { combinationLabel, formatDateTime, formatMoney } from '@/lib/catalog-format';
import {
  MAX_PRODUCT_IMAGES,
  buildCombinations,
  combinationKey,
  formFromProduct,
  toUpdateInput,
  validateImageFile,
  type OptionDraft,
  type ProductFormState,
  type VariantDraft,
} from '@/lib/catalog-form';
import { listCategories } from '@/lib/catalog-client';

function VariantImageControl({
  productName,
  variant,
  index,
  archived,
  busy,
  onUpload,
  onRemove,
}: {
  productName: string;
  variant: VariantDto;
  index: number;
  archived: boolean;
  busy: boolean;
  onUpload: (index: number, file: File) => void;
  onRemove: (index: number) => void;
}) {
  const label = combinationLabel(variant.combination);

  return (
    <div className="flex items-center gap-3">
      {variant.imageUrl ? (
        <Image
          alt={`${productName}, ${label}`}
          className="size-12 rounded-md border border-border object-cover"
          height={48}
          src={variant.imageUrl}
          unoptimized
          width={48}
        />
      ) : (
        <span className="grid size-12 place-items-center rounded-md border border-dashed border-border bg-surface-muted text-muted">
          <Upload aria-hidden="true" size={16} />
        </span>
      )}

      {!archived && (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-semibold text-sky underline-offset-4 hover:underline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky">
          <Upload aria-hidden="true" size={16} />
          {busy ? 'Uploading…' : variant.imageUrl ? 'Replace' : 'Add image'}
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Upload image for ${label}`}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onUpload(index, file);
            }}
            type="file"
          />
        </label>
      )}

      {!archived && variant.imageUrl !== null && (
        <Button
          aria-label={`Remove image for ${label}`}
          disabled={busy}
          onClick={() => onRemove(index)}
          type="button"
          variant="quiet"
        >
          Remove
        </Button>
      )}
    </div>
  );
}

export default function ProductDetailPage() {
  const ready = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { currency } = useBusinessSettings();

  const [product, setProduct] = useState<ProductDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'archive' | 'restore' | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>({
    name: '',
    categoryId: '',
    price: '',
    cost: '',
    sku: '',
    stockCount: '0',
    lowStockThreshold: '5',
    description: '',
  });
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateSkuNotice | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [variantImageBusy, setVariantImageBusy] = useState<number | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getProduct(id)
      .then((next) => {
        if (cancelled) return;
        setProduct(next);
        setNotFound(false);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof CatalogApiError && error.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(catalogMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((next) => {
        if (!cancelled) {
          setCategories(next);
          setCategoryError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setCategoryError(catalogMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reloadProduct = useCallback(async () => {
    try {
      const next = await getProduct(id);
      setProduct(next);
      setNotFound(false);
      setLoadError(null);
    } catch (error) {
      if (error instanceof CatalogApiError && error.status === 404) {
        setProduct(null);
        setNotFound(true);
        setLoadError(null);
      } else {
        setLoadError(catalogMessage(error));
      }
    }
  }, [id]);

  const retryLoad = () => {
    setIsLoading(true);
    void reloadProduct().finally(() => setIsLoading(false));
  };

  const refreshCategories = async () => {
    try {
      const next = await listCategories();
      setCategories(next);
      setCategoryError(null);
    } catch (error) {
      setCategoryError(catalogMessage(error));
    }
  };

  const openEdit = () => {
    if (!product) return;
    const initial = formFromProduct(product);
    setForm(initial.form);
    setOptions(initial.options);
    setVariants(initial.variants);
    setFieldErrors({});
    setFormError(null);
    setDuplicate(null);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setFieldErrors({});
    setFormError(null);
    setDuplicate(null);
  };

  const submitEdit = async () => {
    if (!product) return;

    const required: Record<string, string> = {};
    if (form.name.trim() === '') required.name = 'Enter a product name.';
    if (form.categoryId === '') required.categoryId = 'Choose a category.';
    if (form.price.trim() === '') required.price = 'Enter a price.';
    if (Object.keys(required).length > 0) {
      setFieldErrors(required);
      setFormError('Check the highlighted fields.');
      return;
    }

    const matrix = buildCombinations(options);
    if (matrix.error !== null) {
      setFieldErrors({ options: matrix.error });
      setFormError('Fix the option matrix before saving.');
      return;
    }

    const parsed = ProductUpdateSchema.safeParse(
      toUpdateInput(form, options, variants, product.version),
    );
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFormError('Check the highlighted fields.');
      return;
    }

    setSavingEdit(true);
    setFormError(null);
    setDuplicate(null);

    try {
      const updated = await updateProduct(product.id, parsed.data);
      setProduct(updated);
      setEditOpen(false);
      setNotice('Product updated');
      setActionError(null);
    } catch (error) {
      if (error instanceof CatalogApiError) {
        const duplicateNotice = duplicateSkuFromError(error);
        if (duplicateNotice !== null) {
          setDuplicate(duplicateNotice);
        } else if (error.code === 'PRODUCT_CHANGED' || error.code === 'PRODUCT_ARCHIVED') {
          setEditOpen(false);
          setActionError(`${error.message} The latest product has been loaded.`);
          await reloadProduct();
          return;
        } else if (error.status === 400) {
          setFieldErrors(fieldErrorsFromServer(error.fields));
        }
      }

      if (isTimeoutError(error)) {
        setFormError(
          'The request timed out. Close this panel and reload the product to confirm whether the changes saved.',
        );
      } else {
        setFormError(catalogMessage(error));
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const runTransition = async (kind: 'archive' | 'restore') => {
    if (!product) return;
    setActionBusy(kind);
    setActionError(null);
    setNotice(null);

    try {
      const updated =
        kind === 'archive'
          ? await archiveProduct(product.id, product.version)
          : await restoreProduct(product.id, product.version);
      setProduct(updated);
      setNotice(kind === 'archive' ? 'Product archived' : 'Product restored');
    } catch (error) {
      if (isTimeoutError(error)) {
        setActionError(
          'The request timed out. Reloading the latest product to confirm the change.',
        );
        await reloadProduct();
      } else if (
        error instanceof CatalogApiError &&
        (error.code === 'PRODUCT_CHANGED' ||
          error.code === 'PRODUCT_ARCHIVED' ||
          error.code === 'PRODUCT_NOT_ARCHIVED')
      ) {
        setActionError(`${error.message} The latest product has been loaded.`);
        await reloadProduct();
      } else {
        setActionError(catalogMessage(error));
      }
    } finally {
      setActionBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!product) return;
    setDeleteBusy(true);
    setDeleteError(null);

    try {
      await deleteProduct(product.id, product.version);
      router.push('/products');
    } catch (error) {
      if (isTimeoutError(error)) {
        setDeleteOpen(false);
        setActionError('The delete request timed out. Reloading the latest product.');
        await reloadProduct();
      } else if (error instanceof CatalogApiError && error.code === 'PRODUCT_IN_USE') {
        setDeleteError(error.message);
      } else if (
        error instanceof CatalogApiError &&
        (error.code === 'PRODUCT_CHANGED' || error.code === 'PRODUCT_NOT_ARCHIVED')
      ) {
        setDeleteOpen(false);
        setActionError(`${error.message} The latest product has been loaded.`);
        await reloadProduct();
      } else if (error instanceof CatalogApiError && error.status === 404) {
        router.push('/products');
      } else {
        setDeleteError(catalogMessage(error));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const addImages = async (files: File[]) => {
    if (!product || files.length === 0) return;
    setImageError(null);

    const remaining = MAX_PRODUCT_IMAGES - product.images.length;
    if (files.length > remaining) {
      setImageError(`You can add ${remaining} more image${remaining === 1 ? '' : 's'}.`);
      return;
    }

    const errors: string[] = [];
    for (const file of files) {
      const error = await validateImageFile(file);
      if (error !== null) errors.push(`${file.name}: ${error}`);
    }
    if (errors.length > 0) {
      setImageError(errors.join(' '));
      return;
    }

    setImageBusy(true);
    try {
      const updated = await uploadProductImages(product.id, files, product.version);
      setProduct(updated);
      setNotice('Images updated');
    } catch (error) {
      if (isTimeoutError(error)) {
        setImageError('The upload timed out. Reloading the product to check the images.');
        await reloadProduct();
      } else if (
        error instanceof CatalogApiError &&
        (error.code === 'PRODUCT_ARCHIVED' || error.code === 'PRODUCT_CHANGED')
      ) {
        setImageError(error.message);
        await reloadProduct();
      } else {
        setImageError(catalogMessage(error));
      }
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = async (index: number) => {
    if (!product) return;
    setImageBusy(true);
    setImageError(null);

    try {
      const updated = await removeProductImage(product.id, index, product.version);
      setProduct(updated);
      setNotice('Image removed');
    } catch (error) {
      if (isTimeoutError(error)) {
        setImageError('The request timed out. Reloading the product to check the images.');
        await reloadProduct();
      } else if (
        error instanceof CatalogApiError &&
        (error.status === 400 ||
          error.code === 'PRODUCT_ARCHIVED' ||
          error.code === 'PRODUCT_CHANGED')
      ) {
        setImageError(error.message);
        await reloadProduct();
      } else {
        setImageError(catalogMessage(error));
      }
    } finally {
      setImageBusy(false);
    }
  };

  const uploadVariant = async (index: number, file: File) => {
    if (!product) return;
    setImageError(null);
    const validation = await validateImageFile(file);
    if (validation !== null) {
      setImageError(`${file.name}: ${validation}`);
      return;
    }

    setVariantImageBusy(index);
    try {
      const updated = await uploadVariantImage(product.id, index, file, product.version);
      setProduct(updated);
      setNotice('Variant image updated');
    } catch (error) {
      if (isTimeoutError(error)) {
        setImageError('The upload timed out. Reloading the product to check the image.');
        await reloadProduct();
      } else if (
        error instanceof CatalogApiError &&
        (error.code === 'PRODUCT_ARCHIVED' || error.code === 'PRODUCT_CHANGED')
      ) {
        setImageError(error.message);
        await reloadProduct();
      } else {
        setImageError(catalogMessage(error));
      }
    } finally {
      setVariantImageBusy(null);
    }
  };

  const removeVariantImage = async (index: number) => {
    if (!product) return;
    setImageError(null);
    setVariantImageBusy(index);

    try {
      const variants = product.variants.map((variant, variantIndex) => ({
        combination: variant.combination,
        sku: variant.sku ?? undefined,
        price: variant.price ?? undefined,
        cost: variant.cost ?? undefined,
        stockCount: variant.stockCount,
        imageUrl: variantIndex === index ? null : (variant.imageUrl ?? undefined),
      }));
      const updated = await updateProduct(product.id, {
        version: product.version,
        description: product.description ?? null,
        sku: product.sku ?? null,
        variants,
      });
      setProduct(updated);
      setNotice('Variant image removed');
    } catch (error) {
      if (isTimeoutError(error)) {
        setImageError('The request timed out. Reloading the product to check the image.');
        await reloadProduct();
      } else if (
        error instanceof CatalogApiError &&
        (error.code === 'PRODUCT_ARCHIVED' || error.code === 'PRODUCT_CHANGED')
      ) {
        setImageError(error.message);
        await reloadProduct();
      } else {
        setImageError(catalogMessage(error));
      }
    } finally {
      setVariantImageBusy(null);
    }
  };

  if (!ready || isLoading) {
    return (
      <AppShell>
        <div className="grid gap-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="grid gap-6">
          <Link
            className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-sky underline-offset-4 hover:underline"
            href="/products"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            Back to products
          </Link>
          <EmptyState>
            <div>
              <p className="font-semibold text-ink">Product not found</p>
              <p className="mt-1 text-sm text-body">
                It may have been deleted, or it belongs to another business.
              </p>
            </div>
          </EmptyState>
        </div>
      </AppShell>
    );
  }

  if (loadError !== null && product === null) {
    return (
      <AppShell>
        <div className="grid gap-6">
          <Link
            className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-sky underline-offset-4 hover:underline"
            href="/products"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            Back to products
          </Link>
          <ErrorState onRetry={retryLoad}>{loadError}</ErrorState>
        </div>
      </AppShell>
    );
  }

  if (product === null) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  const remainingImages = MAX_PRODUCT_IMAGES - product.images.length;

  return (
    <AppShell>
      <div className="grid gap-8">
        <div>
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky underline-offset-4 hover:underline"
            href="/products"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            Back to products
          </Link>
        </div>

        <header className="grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-sky-strong">
                {product.categoryName ?? 'Uncategorized'}
              </p>
              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-ink">
                {product.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StockBadge status={product.stockStatus} />
                {product.variants.length > 0 && <Badge>{product.variants.length} variants</Badge>}
                {product.isArchived && (
                  <Badge className="bg-warning-soft text-warning">Archived</Badge>
                )}
                <span className="font-mono text-xs text-muted">{product.sku ?? 'No SKU'}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!product.isArchived && (
                <Button onClick={openEdit} type="button" variant="secondary">
                  <Pencil aria-hidden="true" size={18} />
                  Edit product
                </Button>
              )}

              {product.isArchived ? (
                <>
                  <Button
                    disabled={actionBusy !== null}
                    onClick={() => void runTransition('restore')}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={18} />
                    {actionBusy === 'restore' ? 'Restoring…' : 'Restore product'}
                  </Button>
                  <Button
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                    type="button"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={18} />
                    Delete product
                  </Button>
                </>
              ) : (
                <Button
                  disabled={actionBusy !== null}
                  onClick={() => void runTransition('archive')}
                  type="button"
                  variant="secondary"
                >
                  <Archive aria-hidden="true" size={18} />
                  {actionBusy === 'archive' ? 'Archiving…' : 'Archive product'}
                </Button>
              )}
            </div>
          </div>

          {product.isArchived && (
            <Alert variant="neutral">
              This product is archived. It is hidden from the default catalog and its stock is not
              counted in active selling. Restore it to edit the product or upload images.
            </Alert>
          )}

          {loadError && <ErrorState onRetry={retryLoad}>{loadError}</ErrorState>}

          {actionError && (
            <Alert variant="danger">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{actionError}</span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setActionError(null);
                      void reloadProduct();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Reload
                  </Button>
                  <Button onClick={() => setActionError(null)} type="button" variant="quiet">
                    Dismiss
                  </Button>
                </span>
              </div>
            </Alert>
          )}

          {notice && (
            <Alert variant="success">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{notice}</span>
                <Button onClick={() => setNotice(null)} type="button" variant="quiet">
                  Dismiss
                </Button>
              </div>
            </Alert>
          )}
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <h2 className="text-base font-semibold text-ink">Price</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted">Selling price</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">
                  {formatMoney(product.price, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Cost</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">
                  {formatMoney(product.cost, currency)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-ink">Stock</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted">Available</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">{product.availableStock}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Low stock at</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">{product.lowStockThreshold}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted">Status</dt>
                <dd className="mt-2">
                  <StockBadge status={product.stockStatus} />
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-ink">Record</h2>
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="text-muted">SKU</dt>
                <dd className="mt-1 font-mono text-ink">{product.sku ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-muted">Category</dt>
                <dd className="mt-1 text-ink">{product.categoryName ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-muted">Version</dt>
                <dd className="mt-1 font-mono text-ink">{product.version}</dd>
              </div>
              <div>
                <dt className="text-muted">Updated</dt>
                <dd className="mt-1 text-ink">{formatDateTime(product.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <Card>
          <h2 className="text-base font-semibold text-ink">Description</h2>
          <p className="mt-3 whitespace-pre-wrap text-body">
            {product.description ?? 'No description yet.'}
          </p>
        </Card>

        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Images</h2>
              <p className="mt-1 text-sm text-body">
                {product.images.length} of {MAX_PRODUCT_IMAGES} images. JPG, PNG, or WebP, 2 MB
                each.
              </p>
            </div>
          </div>

          {imageError && (
            <div className="mt-4">
              <Alert variant="danger">{imageError}</Alert>
            </div>
          )}

          {product.images.length === 0 ? (
            <div className="mt-4">
              <EmptyState>
                <div>
                  <p className="font-semibold text-ink">No images yet</p>
                  <p className="mt-1 text-sm text-body">
                    {product.isArchived
                      ? 'Restore the product to add images.'
                      : 'Add a clear photo so this product is easy to recognize.'}
                  </p>
                </div>
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {product.images.map((image, index) => (
                <li
                  className="overflow-hidden rounded-md border border-border bg-surface-muted"
                  key={`${image}-${index}`}
                >
                  <Image
                    alt={`${product.name} image ${index + 1}`}
                    className="aspect-square w-full object-cover"
                    height={240}
                    src={image}
                    unoptimized
                    width={240}
                  />
                  {!product.isArchived && (
                    <Button
                      aria-label={`Remove image ${index + 1}`}
                      className="w-full rounded-none"
                      disabled={imageBusy}
                      onClick={() => void removeImage(index)}
                      type="button"
                      variant="quiet"
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!product.isArchived && remainingImages > 0 && (
            <div className="mt-4 max-w-md">
              <Field
                description={`${remainingImages} image slot${remainingImages === 1 ? '' : 's'} left.`}
                htmlFor="product-image-upload"
                label="Add images"
              >
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageBusy}
                  id="product-image-upload"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    void addImages(files);
                  }}
                  type="file"
                />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Variants</h2>
              <p className="mt-1 text-sm text-body">
                Each combination carries its own SKU, stock, and optional price overrides.
              </p>
            </div>
            {!product.isArchived && (
              <Button onClick={openEdit} type="button" variant="secondary">
                <Pencil aria-hidden="true" size={16} />
                Edit variants
              </Button>
            )}
          </div>

          {product.variants.length === 0 ? (
            <div className="mt-4">
              <EmptyState>
                <div>
                  <p className="font-semibold text-ink">This product has no variants</p>
                  <p className="mt-1 text-sm text-body">
                    It uses the single stock count shown above. Add options to track combinations
                    separately.
                  </p>
                </div>
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 font-semibold" scope="col">
                        Variant
                      </th>
                      <th className="px-3 py-3 font-semibold" scope="col">
                        SKU
                      </th>
                      <th className="px-3 py-3 font-semibold" scope="col">
                        Price
                      </th>
                      <th className="px-3 py-3 font-semibold" scope="col">
                        Stock
                      </th>
                      <th className="px-3 py-3 font-semibold" scope="col">
                        Image
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {product.variants.map((variant, index) => (
                      <tr className="text-body" key={combinationKey(variant.combination)}>
                        <td className="px-3 py-4">
                          <p className="font-semibold text-ink">
                            {combinationLabel(variant.combination)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted">Variant {index + 1}</p>
                        </td>
                        <td className="px-3 py-4 font-mono">{variant.sku ?? '—'}</td>
                        <td className="px-3 py-4 font-mono">
                          {formatMoney(variant.price ?? product.price, currency)}
                          {variant.price === null && (
                            <span className="mt-1 block font-sans text-xs text-muted">
                              Product price
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">{variant.stockCount}</span>
                            <StockBadge status={variant.stockStatus} />
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <VariantImageControl
                            archived={product.isArchived}
                            busy={variantImageBusy === index}
                            index={index}
                            onUpload={(variantIndex, file) =>
                              void uploadVariant(variantIndex, file)
                            }
                            onRemove={(variantIndex) => void removeVariantImage(variantIndex)}
                            productName={product.name}
                            variant={variant}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 md:hidden">
                {product.variants.map((variant, index) => (
                  <RecordCard key={combinationKey(variant.combination)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">
                          {combinationLabel(variant.combination)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted">
                          {variant.sku ?? 'No SKU'} · Variant {index + 1}
                        </p>
                      </div>
                      <StockBadge status={variant.stockStatus} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                      <div>
                        <p className="text-muted">Stock</p>
                        <p className="mt-1 font-mono text-ink">{variant.stockCount}</p>
                      </div>
                      <div>
                        <p className="text-muted">Price</p>
                        <p className="mt-1 font-mono text-ink">
                          {formatMoney(variant.price ?? product.price, currency)}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <VariantImageControl
                        archived={product.isArchived}
                        busy={variantImageBusy === index}
                        index={index}
                        onUpload={(variantIndex, file) => void uploadVariant(variantIndex, file)}
                        onRemove={(variantIndex) => void removeVariantImage(variantIndex)}
                        productName={product.name}
                        variant={variant}
                      />
                    </div>
                  </RecordCard>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Sheet onClose={closeEdit} open={editOpen} title="Edit product">
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
        >
          {categoryError && (
            <Alert variant="danger">
              <div className="grid gap-3">
                <p>Categories could not be loaded. {categoryError}</p>
                <Button onClick={() => void refreshCategories()} type="button" variant="secondary">
                  Try again
                </Button>
              </div>
            </Alert>
          )}

          {formError && <Alert variant="danger">{formError}</Alert>}

          {duplicate && (
            <Alert variant="danger">
              <div className="grid gap-3">
                <p className="font-semibold text-ink">
                  {duplicate.archived
                    ? 'That SKU belongs to an archived product'
                    : 'That SKU is already in use'}
                </p>
                <p>{duplicate.message}</p>
                <Link
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                  href={`/products/${duplicate.existingProductId}`}
                >
                  Open the existing product
                </Link>
                {duplicate.archived && (
                  <p className="text-sm">
                    Restore that product before reusing its SKU, or choose a different SKU.
                  </p>
                )}
              </div>
            </Alert>
          )}

          <ProductFields
            categories={categories}
            disabled={savingEdit}
            fieldErrors={fieldErrors}
            form={form}
            idPrefix="edit-product"
            mode="edit"
            onFormChange={setForm}
            onOptionsChange={setOptions}
            onVariantsChange={setVariants}
            options={options}
            variants={variants}
          />

          <div className="flex flex-wrap gap-3">
            <Button disabled={savingEdit || categories.length === 0} type="submit">
              {savingEdit ? 'Saving…' : 'Save changes'}
            </Button>
            <Button onClick={closeEdit} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      </Sheet>

      <Dialog
        description={
          deleteError ? undefined : 'This permanently removes the archived product record.'
        }
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        open={deleteOpen}
        title="Delete product?"
      >
        <div className="grid gap-5">
          <p className="text-body">
            <span className="font-semibold text-ink">{product.name}</span> and its variants will be
            removed. Products referenced by any order cannot be deleted.
          </p>

          {deleteError && <Alert variant="danger">{deleteError}</Alert>}

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
              type="button"
              variant="danger"
            >
              <Trash2 aria-hidden="true" size={18} />
              {deleteBusy ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button
              onClick={() => {
                setDeleteOpen(false);
                setDeleteError(null);
              }}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
