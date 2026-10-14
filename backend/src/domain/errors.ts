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
