'use client';

import { useState } from 'react';
import type { CategoryDto } from '@f-commerce/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { combinationLabel } from '@/lib/catalog-format';
import {
  MAX_OPTIONS,
  buildCombinations,
  combinationKey,
  parseOptionRows,
  reconcileVariants,
  validateImageFile,
  type OptionDraft,
  type ProductFormState,
  type VariantDraft,
} from '@/lib/catalog-form';

export interface ProductFieldsProps {
  mode: 'create' | 'edit';
  idPrefix: string;
  form: ProductFormState;
  onFormChange: (form: ProductFormState) => void;
  options: OptionDraft[];
  onOptionsChange: (options: OptionDraft[]) => void;
  variants: VariantDraft[];
  onVariantsChange: (variants: VariantDraft[]) => void;
  categories: CategoryDto[];
  fieldErrors: Record<string, string>;
  disabled?: boolean;
}

/**
 * Shared create/edit fields, including the option matrix builder. The option
 * rows own the matrix; variant rows are reconciled by normalized combination so
 * edits keep typed stock, SKU, and image values.
 */
export function ProductFields({
  mode,
  idPrefix,
  form,
  onFormChange,
  options,
  onOptionsChange,
  variants,
  onVariantsChange,
  categories,
  fieldErrors,
  disabled = false,
}: ProductFieldsProps) {
  const parsedOptions = parseOptionRows(options);
  const matrix = buildCombinations(options);
  const hasVariants = parsedOptions.options.length > 0;
  const matrixError = fieldErrors.options ?? matrix.error;
  const [variantImageErrors, setVariantImageErrors] = useState<Record<string, string>>({});

  const attachVariantImage = async (key: string, file: File) => {
    const error = await validateImageFile(file);
    if (error !== null) {
      setVariantImageErrors((current) => ({ ...current, [key]: `${file.name}: ${error}` }));
      return;
    }

    setVariantImageErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    onVariantsChange(
      variants.map((variant) =>
        combinationKey(variant.combination) === key ? { ...variant, imageFile: file } : variant,
      ),
    );
  };

  const updateForm = (patch: Partial<ProductFormState>) => {
    onFormChange({ ...form, ...patch });
  };

  const updateOptions = (next: OptionDraft[]) => {
    onOptionsChange(next);
    const result = buildCombinations(next);
    if (result.error === null) {
      onVariantsChange(reconcileVariants(result.combinations, variants));
    }
  };

  const updateOption = (index: number, patch: Partial<OptionDraft>) => {
    updateOptions(
      options.map((option, current) => (current === index ? { ...option, ...patch } : option)),
    );
  };

  const removeOption = (index: number) => {
    updateOptions(options.filter((_, current) => current !== index));
  };

  const updateVariant = (index: number, patch: Partial<VariantDraft>) => {
    onVariantsChange(
      variants.map((variant, current) => (current === index ? { ...variant, ...patch } : variant)),
    );
  };

  return (
    <div className="grid gap-6">
      <Field error={fieldErrors.name} htmlFor={`${idPrefix}-name`} label="Product name">
        <Input
          autoComplete="off"
          disabled={disabled}
          id={`${idPrefix}-name`}
          maxLength={120}
          onChange={(event) => updateForm({ name: event.target.value })}
          required
          value={form.name}
        />
      </Field>

      <Field
        description={
          categories.length === 0 ? 'Create a category before saving a product.' : undefined
        }
        error={fieldErrors.categoryId}
        htmlFor={`${idPrefix}-category`}
        label="Category"
      >
        <Select
          disabled={disabled || categories.length === 0}
          id={`${idPrefix}-category`}
          onChange={(event) => updateForm({ categoryId: event.target.value })}
          required
          value={form.categoryId}
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          description="Whole numbers only, in your business currency."
          error={fieldErrors.price}
          htmlFor={`${idPrefix}-price`}
          label="Price"
        >
          <Input
            disabled={disabled}
            id={`${idPrefix}-price`}
            inputMode="numeric"
            min={0}
            onChange={(event) => updateForm({ price: event.target.value })}
            required
            step={1}
            type="number"
            value={form.price}
          />
        </Field>

        <Field
          description={
            mode === 'edit'
              ? 'Optional. Leave blank to keep the current cost.'
              : 'Optional cost per item.'
          }
          error={fieldErrors.cost}
          htmlFor={`${idPrefix}-cost`}
          label="Cost"
        >
          <Input
            disabled={disabled}
            id={`${idPrefix}-cost`}
            inputMode="numeric"
            min={0}
            onChange={(event) => updateForm({ cost: event.target.value })}
            step={1}
            type="number"
            value={form.cost}
          />
        </Field>
      </div>

      <Field
        description="Stored in uppercase. Leave blank for no SKU."
        error={fieldErrors.sku}
        htmlFor={`${idPrefix}-sku`}
        label="SKU"
      >
        <Input
          autoComplete="off"
          disabled={disabled}
          id={`${idPrefix}-sku`}
          maxLength={60}
          onChange={(event) => updateForm({ sku: event.target.value })}
          value={form.sku}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          description={
            hasVariants ? 'Stock is tracked on each variant instead.' : 'Units ready to sell.'
          }
          error={fieldErrors.stockCount}
          htmlFor={`${idPrefix}-stock`}
          label="Stock count"
        >
          <Input
            disabled={disabled || hasVariants}
            id={`${idPrefix}-stock`}
            inputMode="numeric"
            min={0}
            onChange={(event) => updateForm({ stockCount: event.target.value })}
            step={1}
            type="number"
            value={hasVariants ? '0' : form.stockCount}
          />
        </Field>

        <Field
          description={
            mode === 'create'
              ? 'Defaults to 5. At or below this number, the product shows as low stock.'
              : 'Leave blank to keep the current value.'
          }
          error={fieldErrors.lowStockThreshold}
          htmlFor={`${idPrefix}-threshold`}
          label="Low stock threshold"
        >
          <Input
            disabled={disabled}
            id={`${idPrefix}-threshold`}
            inputMode="numeric"
            min={0}
            onChange={(event) => updateForm({ lowStockThreshold: event.target.value })}
            step={1}
            type="number"
            value={form.lowStockThreshold}
          />
        </Field>
      </div>

      <Field
        description="Optional. Shown to your team on the product record."
        error={fieldErrors.description}
        htmlFor={`${idPrefix}-description`}
        label="Description"
      >
        <Textarea
          disabled={disabled}
          id={`${idPrefix}-description`}
          maxLength={1000}
          onChange={(event) => updateForm({ description: event.target.value })}
          value={form.description}
        />
      </Field>

      <section aria-labelledby={`${idPrefix}-options-title`} className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink" id={`${idPrefix}-options-title`}>
              Options and variants
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-body">
              Add up to {MAX_OPTIONS} options. Separate values with commas. The full combination is
              the variant list.
            </p>
          </div>
          <Badge>{matrix.combinations.length} variants</Badge>
        </div>

        {matrixError && <Alert variant="danger">{matrixError}</Alert>}

        <div className="grid gap-4">
          {options.map((option, index) => (
            <div
              className="grid gap-4 rounded-md border border-border bg-surface-muted p-4"
              key={`${idPrefix}-option-${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Option {index + 1}</p>
                <Button
                  aria-label={`Remove option ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeOption(index)}
                  type="button"
                  variant="quiet"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  Remove
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor={`${idPrefix}-option-${index}-name`} label="Option name">
                  <Input
                    disabled={disabled}
                    id={`${idPrefix}-option-${index}-name`}
                    maxLength={30}
                    onChange={(event) => updateOption(index, { name: event.target.value })}
                    placeholder="Size"
                    value={option.name}
                  />
                </Field>

                <Field
                  description="For example: S, M, L"
                  htmlFor={`${idPrefix}-option-${index}-values`}
                  label="Values"
                >
                  <Input
                    disabled={disabled}
                    id={`${idPrefix}-option-${index}-values`}
                    onChange={(event) => updateOption(index, { valuesText: event.target.value })}
                    placeholder="S, M, L"
                    value={option.valuesText}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Button
            disabled={disabled || options.length >= MAX_OPTIONS}
            onClick={() => updateOptions([...options, { name: '', valuesText: '' }])}
            type="button"
            variant="secondary"
          >
            <Plus aria-hidden="true" size={18} />
            Add option
          </Button>
        </div>

        {!hasVariants && (
          <p className="text-sm text-body">
            No options yet. Leave this empty for a product with a single stock count.
          </p>
        )}

        {matrixError === null && matrix.combinations.length > 0 && (
          <div className="grid gap-4">
            {fieldErrors.variants && <Alert variant="danger">{fieldErrors.variants}</Alert>}
            {variants.map((variant, index) => (
              <div
                className="grid gap-4 rounded-md border border-border p-4 sm:grid-cols-2"
                key={`${idPrefix}-variant-${combinationKey(variant.combination)}`}
              >
                <div className="sm:col-span-2">
                  <h4 className="text-sm font-semibold text-ink">
                    {combinationLabel(variant.combination)}
                  </h4>
                </div>

                <Field htmlFor={`${idPrefix}-variant-${index}-sku`} label="Variant SKU">
                  <Input
                    autoComplete="off"
                    disabled={disabled}
                    id={`${idPrefix}-variant-${index}-sku`}
                    maxLength={60}
                    onChange={(event) => updateVariant(index, { sku: event.target.value })}
                    value={variant.sku}
                  />
                </Field>

                <Field htmlFor={`${idPrefix}-variant-${index}-stock`} label="Stock count">
                  <Input
                    disabled={disabled}
                    id={`${idPrefix}-variant-${index}-stock`}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => updateVariant(index, { stockCount: event.target.value })}
                    step={1}
                    type="number"
                    value={variant.stockCount}
                  />
                </Field>

                <Field
                  description="Optional. Defaults to the product price."
                  htmlFor={`${idPrefix}-variant-${index}-price`}
                  label="Price override"
                >
                  <Input
                    disabled={disabled}
                    id={`${idPrefix}-variant-${index}-price`}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => updateVariant(index, { price: event.target.value })}
                    step={1}
                    type="number"
                    value={variant.price}
                  />
                </Field>

                <Field
                  description="Optional."
                  htmlFor={`${idPrefix}-variant-${index}-cost`}
                  label="Cost override"
                >
                  <Input
                    disabled={disabled}
                    id={`${idPrefix}-variant-${index}-cost`}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => updateVariant(index, { cost: event.target.value })}
                    step={1}
                    type="number"
                    value={variant.cost}
                  />
                </Field>

                {mode === 'create' && (
                  <div className="grid gap-2 sm:col-span-2">
                    <Field
                      description="Optional. JPG, PNG, or WebP, 2 MB."
                      error={variantImageErrors[combinationKey(variant.combination)]}
                      htmlFor={`${idPrefix}-variant-${index}-image`}
                      label={`Image for ${combinationLabel(variant.combination)}`}
                    >
                      <Input
                        accept="image/jpeg,image/png,image/webp"
                        disabled={disabled}
                        id={`${idPrefix}-variant-${index}-image`}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) {
                            void attachVariantImage(combinationKey(variant.combination), file);
                          }
                        }}
                        type="file"
                      />
                    </Field>

                    {variant.imageFile && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="truncate text-body">
                          Selected: {variant.imageFile.name}
                        </span>
                        <Button
                          aria-label={`Remove image for ${combinationLabel(variant.combination)}`}
                          disabled={disabled}
                          onClick={() => updateVariant(index, { imageFile: null })}
                          type="button"
                          variant="quiet"
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
