import { CategoryCreateRequest, CategoryUpdateRequest } from '@f-commerce/contracts';
import { Category } from '../../domain/entities/product.entity.js';
import {
  CategoryUpdateData,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.js';
import {
  CategoryChangedError,
  CategoryInUseError,
  DuplicateCategoryError,
  NotFoundError,
} from '../../domain/errors.js';
import { isUniqueViolation } from './database-errors.js';

function toDto(category: Category) {
  return {
    id: category.id,
    name: category.name,
    description: category.description ?? null,
    version: category.version,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export class CategoryService {
  constructor(private readonly repository: ICategoryRepository) {}

  async create(input: CategoryCreateRequest) {
    const existing = await this.repository.findByName(input.name);
    if (existing) {
      throw new DuplicateCategoryError(existing.id);
    }

    try {
      const created = await this.repository.insert({
        id: '',
        businessId: '',
        name: input.name,
        description: input.description,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return toDto(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const holder = await this.repository.findByName(input.name);
        if (holder) throw new DuplicateCategoryError(holder.id);
        throw error;
      }
      throw error;
    }
  }

  async list() {
    const categories = await this.repository.list();
    return categories.map(toDto);
  }

  async update(id: string, input: CategoryUpdateRequest) {
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundError('Category not found');
    }

    if (input.version !== category.version) {
      throw new CategoryChangedError();
    }

    const changes: CategoryUpdateData = {};
    if (input.name !== undefined && input.name !== category.name) {
      changes.name = input.name;
    }

    if (input.description !== undefined) {
      if (input.description === null) {
        if (category.description !== undefined) changes.description = null;
      } else if (input.description !== category.description) {
        changes.description = input.description;
      }
    }

    if (Object.keys(changes).length === 0) {
      return toDto(category);
    }

    if (changes.name !== undefined) {
      const holder = await this.repository.findByName(changes.name, id);
      if (holder) {
        throw new DuplicateCategoryError(holder.id);
      }
    }

    try {
      const updated = await this.repository.update(
        id,
        category.version,
        changes,
        category.version + 1,
      );
      if (!updated) {
        throw new CategoryChangedError();
      }
      return toDto(updated);
    } catch (error) {
      if (isUniqueViolation(error) && changes.name !== undefined) {
        const holder = await this.repository.findByName(changes.name, id);
        if (holder) throw new DuplicateCategoryError(holder.id);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.deleteWithGuard(id);
    if (result.status === 'notFound') {
      throw new NotFoundError('Category not found');
    }
    if (result.status === 'inUse') {
      throw new CategoryInUseError(result.productCount);
    }
  }
}
