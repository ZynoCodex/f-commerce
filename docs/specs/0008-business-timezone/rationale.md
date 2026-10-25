# Rationale for 0008. Business timezone for delivery dates and timestamps

## Context

The console already stores a promised delivery date on each order as a plain calendar day, and it shows timestamps such as the order creation time and the status history. The promised date is stored safely: `orders.delivery_deadline` is a nullable PostgreSQL `date` in string mode, so `2026-11-05` is stored and returned as exactly that day. The weak point is interpretation. `frontend/src/lib/catalog-format.ts` builds `localToday()` from the viewer's browser clock, and the `Overdue` badge and the past date warning compare against it. Two people in different timezones can therefore disagree about the same promise near midnight. The gap was recorded in spec 0007 as a follow up.

The product is a mobile first order desk for small sellers, with multiple users in one business and a first audience in Bangladesh. The business profile owns the name, currency, logo, and address, but it has no timezone. The order record owns the promise but no day boundary. Reports, the dashboard, and future notifications will need a stable business day, and none of them exist yet.

The design must decide four things: what the timezone governs, how it is stored, how a business gets it, and what happens to old orders when it changes. It must also decide how the browser learns the value without adding a request to every page or causing a hydration mismatch. The cost of not deciding is a console that quietly disagrees with itself, and a report layer that later invents its own day rule.

## Options considered

### Option 1: One business timezone, IANA ID, current zone for old orders (chosen)

Store one IANA timezone ID on `businesses`, default existing rows to `Asia/Dhaka`, require the value at onboarding, and let the owner change it in settings. The delivery date stays a plain calendar day. Timestamps and the Overdue comparison use the current business zone, so old orders follow the current zone. One client provider reads the profile once per app load and per auth change and caches it per business.

**Pros**:

- One value decides every console date, so viewers agree.
- IANA IDs handle daylight saving and future zone changes without a new column.
- No order snapshot means changing the zone is one profile write.
- The same rule can serve reports and the dashboard later.

**Cons**:

- Changing the zone moves the Overdue badge for historical orders.
- A required onboarding field adds a step and can be set wrongly.
- The day changes with the current setting, not with the promise's original setting.

### Option 2: Fixed UTC offset on the business

Store an offset such as `+06:00` and compare the promise against that fixed offset.

**Pros**:

- Simple to compare and simple to display.
- No dependency on the runtime timezone database.

**Cons**:

- The offset is wrong after a daylight saving change, so the business day drifts for part of the year.
- A seller who moves or works across a region must edit the offset by hand.
- The value is not a real place, so future reports and scheduling cannot use it.

### Option 3: Snapshot the timezone on each order

Store the business timezone that was active when each order was created, or when its deadline was set, and compare the promise against that stored zone.

**Pros**:

- An old promise keeps the day boundary it was promised under.
- A zone change has no effect on historical orders.

**Cons**:

- Adds an order column, a backfill, and a rule for orders with no deadline.
- The seller sees two order lists under two day rules after a change.
- The product has no requirement for historical day boundaries, and the business profile already owns the current day.

### Option 4: Keep the browser day, add the timezone later

Leave the current behavior and revisit the problem when reports arrive.

**Pros**:

- No migration, no contract change, no onboarding step.
- Nothing in the current order flow moves.

**Cons**:

- Two users in different places still disagree near midnight.
- The business has no day boundary for reports, so the next feature invents one.
- The known gap in spec 0007 stays open after the product already has multiple users.

## Rationale

Option 1 fits the forces. The timezone is a property of the business, not of an order or a person, so the business row is the natural owner. An IANA ID is the only shape that survives daylight saving and a seller who changes region. A fixed offset is smaller, but it is wrong for part of the year and has no meaning for reports.

The promise stays a calendar day because that is how a seller speaks it. The stored `YYYY-MM-DD` value must never move. Only the question "is that day before today" needs a zone, and the business zone answers it. Keeping the order free of a snapshot is the deliberate simplicity tradeoff. If a seller changes the zone, the promise text does not change; only the badge that compares it to today changes. The seller confirmed that old orders should follow the current zone. A snapshot would preserve a historical boundary the product does not yet need, at the cost of a column, a backfill, and a second rule for orders without a deadline.

Onboarding is the right moment to ask. The seller is already naming the business, choosing a currency, and setting an address. A browser prefill keeps the step short, and a required value prevents a silent default from becoming permanent. Settings remains the place to correct it. Existing businesses get `Asia/Dhaka` because that is the first audience and it keeps the current behavior correct for them on day one. A new business also gets the database default at registration, then overwrites it during onboarding with the explicit choice.

The shared provider is a response to a real cost. Five screens already call `GET /api/business/me` just to decorate money, and adding a second call for timezone would double that. One provider per app load and per auth change gives every screen the same value and removes the duplicate calls. The cache is keyed by business id and removed by `clearAuth`, so a shared device cannot show another business's zone. The server and hydration render use the fallback, then the cache applies, which avoids a hydration warning while still avoiding a network wait after the first visit. The auth client notifies the provider from `setAuth` and `clearAuth` because the root layout does not remount on a client side login redirect; without that signal the first session after login would stay on the fallback.

The server helper is included now because the user chose server day boundaries as part of the scope. No endpoint uses it today, so it adds no behavior and no API surface. It exists to stop the next report or dashboard from slicing a localized string or using the server's own zone. The client and server copies are small and both tested against the same examples, including a daylight saving change and two zones on different days at one instant.

The confirmation dialog is deliberate friction. A timezone change can move the Overdue badge for many historical orders, and the seller should see that consequence before saving. The default is not audited because no business profile edit is audited today, and adding one field to an audit system the profile does not use would be a wider decision. The follow up records the option.

The fallback to `Asia/Dhaka` is a recovery rule, not a second default. A missing or corrupted stored value should not blank the console or block an order screen. The API still returns what is stored, and the reader treats an unreadable value as the known business default.

## Smaller decisions

| Question                                           | Answer                                                                                                                                           | Why                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| What does the timezone govern?                     | Delivery deadline checks, every displayed timestamp, and future server day boundaries                                                            | One rule for every date the console shows, so a report and a screen cannot disagree                               |
| Where is it set?                                   | Required in onboarding, changeable in settings                                                                                                   | Onboarding is where the business identity is created; settings is the correction path                             |
| Is it required at onboarding?                      | Yes, with an inline message when missing                                                                                                         | A silent default would become permanent for a seller outside Dhaka                                                |
| What is the default?                               | `Asia/Dhaka` for existing rows, the database default at registration, and the read fallback                                                      | Keeps current behavior correct for the first audience and never leaves a null                                     |
| What happens to old orders?                        | They follow the current business zone                                                                                                            | No per order snapshot until a requirement needs historical day boundaries                                         |
| Which API carries it?                              | Business profile read, update, onboarding, and draft only                                                                                        | Order DTOs, totals, and status rules stay unchanged                                                               |
| Is the stored value normalized?                    | Yes, `TimezoneSchema` stores the canonical `resolvedOptions().timeZone`                                                                          | Case and alias variants would break the select comparison and the badge                                           |
| Which value updates the provider after onboarding? | The `PUT /api/business/onboarding` response `data`                                                                                               | The response is authoritative and already canonical                                                               |
| How is the zone picked?                            | One grouped native select from `Intl.supportedValuesOf('timeZone')`, with a short fallback list                                                  | Native mobile pickers and a small bundle, with no new dependency                                                  |
| Where is the zone visible?                         | One shell badge, `Asia/Dhaka · BDT`, plus the business day in the header                                                                         | A single marker avoids repeating the zone on every timestamp                                                      |
| What shows on first paint?                         | The fallback on the server and hydration render, then the cached value, then the fetched value                                                   | No hydration warning and no network wait on a repeat visit                                                        |
| What happens with a bad zone?                      | The reader falls back to `Asia/Dhaka`, settings shows the fallback as the baseline, and the next save persists it                                | A corrupt value must not blank or crash a page, and a normal save should repair it without a false change warning |
| How does the provider learn about login?           | `setAuth` and `clearAuth` notify an auth subscription the provider reads                                                                         | A client side login redirect does not remount the root layout                                                     |
| What is cached?                                    | `f-commerce:business-settings:v1:<businessId>` holding `{ currency, timezone }`, validated per field                                             | A repeat visit paints the right zone and currency before the profile request resolves                             |
| What about another tab?                            | It keeps the old value until its next render                                                                                                     | No cross tab listener or timer is added in this slice                                                             |
| Is a change announced?                             | A confirmation dialog names the new zone and the overdue consequence                                                                             | The change can move the Overdue badge for historical orders                                                       |
| Is a change audited?                               | No, for now                                                                                                                                      | The profile has no audit trail, so adding one field would be a wider decision                                     |
| Is there a server day helper?                      | Yes, `todayInTimeZone`, tested now with no caller                                                                                                | The next report or dashboard must not invent its own day rule                                                     |
| Where does the day helper live?                    | A backend copy in `backend/src/domain/timezone.ts` and a frontend copy in `frontend/src/lib/timezone.ts`, tested against the same fixed instants | `packages/contracts` only exports DTOs, schemas, enums, and error types, so a date helper does not belong there   |
| Are there references?                              | No                                                                                                                                               | The reasoning rests on the product requirement and the runtime timezone data, so no external source is cited      |
