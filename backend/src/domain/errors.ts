export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DuplicateEmailError extends DomainError {
  constructor(message: string = 'Email already exists') {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Invalid credentials') {
    super(message);
  }
}

export class InvalidTokenError extends DomainError {
  constructor(message: string = 'Invalid or expired token') {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string = 'Resource not found') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class BadRequestError extends DomainError {
  constructor(message: string = 'Invalid request') {
    super(message);
  }
}

/** Field level validation failure, reported as 400 `VALIDATION_ERROR`. */
export class ValidationError extends DomainError {
  constructor(
    public readonly fields: string[],
    message: string = 'Validation failed',
  ) {
    super(message);
  }
}

export class DuplicatePhoneError extends DomainError {
  constructor(
    public readonly existingCustomerId: string,
    public readonly archived: boolean,
    message: string = 'A customer with this phone number already exists',
  ) {
    super(message);
  }
}

export class CustomerChangedError extends DomainError {
  constructor(message: string = 'This customer was changed by someone else') {
    super(message);
  }
}

export class CustomerArchivedError extends DomainError {
  constructor(message: string = 'This customer is archived') {
    super(message);
  }
}

export class CustomerNotArchivedError extends DomainError {
  constructor(message: string = 'This customer is not archived') {
    super(message);
  }
}

export class PhoneInUseError extends DomainError {
  constructor(
    public readonly liveCustomerId: string,
    message: string = 'Another customer already uses this phone number',
  ) {
    super(message);
  }
}

// --- Product errors ---

export class ProductNotFoundError extends NotFoundError {
  constructor() {
    super('Product not found');
  }
}

export class ProductChangedError extends ConflictError {
  constructor() {
    super('This product was changed by someone else');
  }
}

export class ProductArchivedError extends ConflictError {
  constructor() {
    super('This product is archived');
  }
}

export class ProductNotArchivedError extends ConflictError {
  constructor() {
    super('This product is not archived');
  }
}

export class ProductInUseError extends ConflictError {
  constructor() {
    super('This product has been referenced by an order and cannot be deleted');
  }
}

export class DuplicateSkuError extends ConflictError {
  constructor(
    public readonly existingProductId: string,
    public readonly existingVariantId: string | null,
    public readonly archived: boolean,
    message: string = 'A product or variant with this SKU already exists in this business',
  ) {
    super(message);
  }
}

// --- Category errors ---

export class CategoryNotFoundError extends NotFoundError {
  constructor() {
    super('Category not found');
  }
}

export class CategoryChangedError extends ConflictError {
  constructor() {
    super('This category was changed by someone else');
  }
}

export class CategoryInUseError extends ConflictError {
  constructor(public readonly productCount: number) {
    super(`This category is referenced by ${productCount} products`);
  }
}

export class DuplicateCategoryError extends ConflictError {
  constructor(
    public readonly existingCategoryId: string,
    message: string = 'A category with this name already exists in this business',
  ) {
    super(message);
  }
}
