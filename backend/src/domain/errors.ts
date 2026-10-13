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
