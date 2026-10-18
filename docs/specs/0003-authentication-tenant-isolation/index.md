# 0003. Authentication and tenant isolation

**Date**: 2026-09-11
**Status**: Accepted

> **Note (2026-10-18)**: Tenant isolation no longer uses a global Mongoose plugin. The request's `businessId` still travels through `AsyncLocalStorage` (`drizzle/context.ts`), but each Drizzle repository filters on it explicitly. Repository entry points also reject non-UUID ids, so a malformed id returns 404 instead of a database error.

## Summary

This design establishes the authentication flow and tenant isolation mechanism for the F-commerce platform. It introduces a `User` identity, an independent `Business` tenant, and a `BusinessMember` mapping collection with role-based access. Multi-tenant isolation is strictly enforced at the database level using a global Mongoose plugin and Node.js `AsyncLocalStorage`.

## Requirements

**User stories**:

- As a business owner, I want to securely log in via Email or OAuth so that I can access my account.
- As a business owner, I want to invite staff members to my business so that they can help manage operations.
- As a business, I want absolute certainty that no other business can access my data.

**Acceptance criteria**:

- **AC-1**: Users can register and log in using Email+Password, Google, or Facebook.
- **AC-2**: Upon login, the system issues a short-lived JWT and an HttpOnly refresh token.
- **AC-3**: The `BusinessMember` collection accurately maps a `User` to a `Business` with a specific role (`OWNER` or `STAFF`).
- **AC-4**: A Mongoose global plugin intercepts all database queries and automatically injects `{ businessId: context.businessId }`, guaranteeing strict tenant isolation.
- **AC-5**: Only users with the `OWNER` role can invite new staff members to their business.
- **AC-6**: OAuth email collisions link to the existing account rather than failing.

## Decision

**Chosen option**: Option 2: Global Mongoose plugin with AsyncLocalStorage

We will enforce tenant isolation at the Mongoose driver layer using a global plugin hooked into `AsyncLocalStorage`. Users authenticate via JWTs (Email/Password or OAuth), and the backend automatically scopes their permissions to the appropriate `BusinessMember` role.

## Rationale

See [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

- **User**: `_id`, `email` (unique), `passwordHash`, `name`, `oauth` (array of `providerId`), `createdAt`
- **Business**: `_id`, `name`, `createdAt`
- **BusinessMember**: `_id`, `businessId` (FK), `userId` (FK), `role` (enum: OWNER, STAFF), `status` (ACTIVE, INVITED)
- **RefreshToken**: `_id`, `userId` (FK), `token`, `expiresAt`, `revoked` (boolean)

**API surface**:

| Endpoint                    | Method | Key inputs                          | Key outputs              | Auth   | Key errors            |
| :-------------------------- | :----- | :---------------------------------- | :----------------------- | :----- | :-------------------- |
| `/api/auth/register`        | POST   | email, password, name, businessName | JWT, refreshToken        | none   | 409 (Email exists)    |
| `/api/auth/login`           | POST   | email, password                     | JWT, refreshToken        | none   | 401 (Invalid creds)   |
| `/api/auth/oauth/:provider` | POST   | OAuth token/code                    | JWT, refreshToken        | none   | 401 (OAuth fail)      |
| `/api/auth/refresh`         | POST   | refreshToken (cookie)               | JWT, refreshToken        | none   | 401 (Revoked/Expired) |
| `/api/auth/logout`          | POST   | refreshToken (cookie)               | success status           | bearer | 401                   |
| `/api/auth/me`              | GET    | none                                | User profile, businesses | bearer | 401                   |

**Value sourcing**:

| Action               | Value produced / displayed             | Source                                                          |
| :------------------- | :------------------------------------- | :-------------------------------------------------------------- |
| `register`           | User, Business, BusinessMember records | Client input + backend generated defaults                       |
| `login`              | JWT and Refresh Token                  | Backend generated, signed with secret                           |
| `query interception` | `{ businessId }` filter                | Derived from `AsyncLocalStorage` context set by Auth Middleware |

## Build plan

- **Task 1**: Implement `AsyncLocalStorage` context manager and Mongoose global plugin (AC-4).
- **Task 2**: Create `User`, `Business`, `BusinessMember`, and `RefreshToken` schemas (AC-3).
- **Task 3**: Implement `/register`, `/login`, `/refresh`, and `/logout` endpoints for Email+Password (AC-1, AC-2).
- **Task 4**: Implement Google/Facebook OAuth endpoints with account linking (AC-1, AC-6).
- **Task 5**: Implement role-based middleware for route protection (AC-5).

## Consequences

**Positive**:

- Ironclad tenant isolation protects customer data.
- Standardized authentication flow.
- Separation of `User` and `BusinessMember` provides flexibility for multi-business users.

**Negative / tradeoffs**:

- `AsyncLocalStorage` can be tricky to debug if context is lost in asynchronous callbacks.
- Global plugins mean background jobs or admin scripts must intentionally bypass or set the context.

## Follow-up

- Ensure background workers (BullMQ) have a way to securely execute cross-tenant or specific-tenant operations by injecting the correct context.
