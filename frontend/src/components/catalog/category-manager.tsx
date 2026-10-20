'use client';

import { useState, type FormEvent } from 'react';
import type { CategoryDto } from '@f-commerce/contracts';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Sheet,
  Textarea,
} from '@/components/ui/primitives';
import {
  CatalogApiError,
  createCategory,
  deleteCategory,
  updateCategory,
} from '@/lib/catalog-client';
import { catalogMessage } from '@/lib/catalog-errors';
import { isTimeoutError } from '@/lib/auth-client';

export interface CategoryManagerProps {
  onClose: () => void;
  categories: CategoryDto[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}

function fieldMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    map[field] = 'Check this value.';
  }
  return map;
}

/**
 * The category surface: create, inline rename, and delete. Deletion is
 * confirmed in place because the category list already lives in a sheet.
 */
export function CategoryManager({
  onClose,
  categories,
  onRefresh,
  onNotice,
}: CategoryManagerProps) {
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFields, setCreateFields] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingCategory, setDeletingCategory] = useState<CategoryDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateFields({});

    try {
      await createCategory({
        name: createName,
        description: createDescription.trim() === '' ? undefined : createDescription,
      });
      setCreateName('');
      setCreateDescription('');
      await onRefresh();
      onNotice('Category created');
    } catch (error) {
      if (error instanceof CatalogApiError) {
        if (error.code === 'DUPLICATE_CATEGORY') {
          setCreateFields({ name: 'A category with this name already exists.' });
        } else if (error.fields.length > 0) {
          setCreateFields(fieldMap(error.fields));
        }
      }
      setCreateError(catalogMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (category: CategoryDto) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? '');
    setEditError(null);
    setEditFields({});
    setDeletingCategory(null);
    setDeleteError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
    setEditFields({});
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>, category: CategoryDto) => {
    event.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    setEditFields({});

    try {
      await updateCategory(category.id, {
        version: category.version,
        name: editName,
        description: editDescription,
      });
      setEditingId(null);
      await onRefresh();
      onNotice('Category updated');
    } catch (error) {
      if (error instanceof CatalogApiError) {
        if (error.code === 'DUPLICATE_CATEGORY') {
          setEditFields({ name: 'A category with this name already exists.' });
          return;
        } else if (error.code === 'CATEGORY_CHANGED') {
          setEditError('This category changed somewhere else. Reloading the latest list.');
          setEditingId(null);
          await onRefresh();
          return;
        } else if (error.fields.length > 0) {
          setEditFields(fieldMap(error.fields));
          return;
        }
      }

      setEditError(catalogMessage(error));
      if (isTimeoutError(error)) {
        setEditingId(null);
        await onRefresh();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async (category: CategoryDto) => {
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteCategory(category.id);
      setDeletingCategory(null);
      await onRefresh();
      onNotice('Category deleted');
    } catch (error) {
      if (error instanceof CatalogApiError && error.code === 'CATEGORY_IN_USE') {
        const count = error.body.productCount ?? 0;
        setDeleteError(
          `${category.name} still has ${count} product${count === 1 ? '' : 's'}. Archive and delete those products first.`,
        );
      } else if (error instanceof CatalogApiError && error.status === 404) {
        setDeletingCategory(null);
        await onRefresh();
        onNotice('That category was already gone');
      } else {
        setDeleteError(catalogMessage(error));
        if (isTimeoutError(error)) {
          setDeletingCategory(null);
          await onRefresh();
        }
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet onClose={onClose} open title="Categories">
      <div className="grid gap-6">
        <Card>
          <form className="grid gap-4" onSubmit={(event) => void submitCreate(event)}>
            <div>
              <h3 className="text-base font-semibold text-ink">New category</h3>
              <p className="mt-1 text-sm text-body">
                Group products so the catalog stays easy to scan.
              </p>
            </div>

            {createError && <Alert variant="danger">{createError}</Alert>}

            <Field error={createFields.name} htmlFor="category-new-name" label="Category name">
              <Input
                autoComplete="off"
                id="category-new-name"
                maxLength={80}
                onChange={(event) => setCreateName(event.target.value)}
                required
                value={createName}
              />
            </Field>

            <Field
              error={createFields.description}
              htmlFor="category-new-description"
              label="Description (optional)"
            >
              <Textarea
                id="category-new-description"
                maxLength={500}
                onChange={(event) => setCreateDescription(event.target.value)}
                value={createDescription}
              />
            </Field>

            <div>
              <Button disabled={creating} type="submit">
                <Plus aria-hidden="true" size={18} />
                {creating ? 'Creating…' : 'Create category'}
              </Button>
            </div>
          </form>
        </Card>

        <section aria-labelledby="category-list-title" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink" id="category-list-title">
              Your categories
            </h3>
            <span className="font-mono text-xs text-muted">{categories.length}</span>
          </div>

          {categories.length === 0 && (
            <EmptyState>
              <div>
                <p className="font-semibold text-ink">No categories yet</p>
                <p className="mt-1 text-sm text-body">
                  Create one above before adding your first product.
                </p>
              </div>
            </EmptyState>
          )}

          {categories.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {categories.map((category) => {
                const isEditing = editingId === category.id;
                const isDeleting = deletingCategory?.id === category.id;

                return (
                  <li className="grid gap-3 p-4" key={category.id}>
                    {isEditing ? (
                      <form
                        className="grid gap-3"
                        onSubmit={(event) => void submitEdit(event, category)}
                      >
                        {editError && <Alert variant="danger">{editError}</Alert>}

                        <Field
                          error={editFields.name}
                          htmlFor={`category-edit-name-${category.id}`}
                          label="Category name"
                        >
                          <Input
                            autoComplete="off"
                            id={`category-edit-name-${category.id}`}
                            maxLength={80}
                            onChange={(event) => setEditName(event.target.value)}
                            required
                            value={editName}
                          />
                        </Field>

                        <Field
                          error={editFields.description}
                          htmlFor={`category-edit-description-${category.id}`}
                          label="Description (optional)"
                        >
                          <Textarea
                            id={`category-edit-description-${category.id}`}
                            maxLength={500}
                            onChange={(event) => setEditDescription(event.target.value)}
                            value={editDescription}
                          />
                        </Field>

                        <div className="flex flex-wrap gap-2">
                          <Button disabled={savingEdit} type="submit">
                            {savingEdit ? 'Saving…' : 'Save category'}
                          </Button>
                          <Button onClick={cancelEdit} type="button" variant="secondary">
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{category.name}</p>
                            <p className="mt-1 text-sm text-body">
                              {category.description ?? 'No description'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <Button
                              aria-label={`Rename ${category.name}`}
                              onClick={() => beginEdit(category)}
                              type="button"
                              variant="quiet"
                            >
                              <Pencil aria-hidden="true" size={16} />
                              Rename
                            </Button>
                            <Button
                              aria-label={`Delete ${category.name}`}
                              onClick={() => {
                                setDeletingCategory(category);
                                setDeleteError(null);
                              }}
                              type="button"
                              variant="quiet"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                              Delete
                            </Button>
                          </div>
                        </div>

                        {isDeleting && (
                          <div className="grid gap-3 rounded-md border border-danger/30 bg-danger-soft p-4">
                            <p className="font-semibold text-ink">Delete “{category.name}”?</p>
                            <p className="text-sm text-body">
                              This cannot be undone. A category with products cannot be deleted.
                            </p>
                            {deleteError && <Alert variant="danger">{deleteError}</Alert>}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={deleting}
                                onClick={() => void confirmDelete(category)}
                                type="button"
                                variant="danger"
                              >
                                {deleting ? 'Deleting…' : 'Delete category'}
                              </Button>
                              <Button
                                onClick={() => {
                                  setDeletingCategory(null);
                                  setDeleteError(null);
                                }}
                                type="button"
                                variant="secondary"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}
