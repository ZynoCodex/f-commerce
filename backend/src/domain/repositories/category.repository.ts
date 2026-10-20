import { Category } from '../entities/product.entity.js';

export interface CategoryUpdateData {
  name?: string;
  description?: string | null;
}

export type CategoryDeleteResult =
  { status: 'deleted' } | { status: 'inUse'; productCount: number } | { status: 'notFound' };

export interface ICategoryRepository {
  findById(id: string): Promise<Category | null>;
  /** Any category with this name ignoring case, used for duplicate checks. */
  findByName(name: string, excludeId?: string): Promise<Category | null>;
  list(): Promise<Category[]>;
  insert(data: Category): Promise<Category>;
  update(
    id: string,
    expectedVersion: number,
    changes: CategoryUpdateData,
    nextVersion: number,
  ): Promise<Category | null>;
  /** Delete only when no product in the business references the category. */
  deleteWithGuard(id: string): Promise<CategoryDeleteResult>;
}
