const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value is a canonical UUID, the id format of every stored entity. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
