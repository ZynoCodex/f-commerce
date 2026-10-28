'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { CurrencyEnum, TimezoneSchema } from '@f-commerce/contracts';
import { apiFetch, getAuth, subscribeToAuth } from '@/lib/auth-client';
import {
  readBusinessSettingsCache,
  writeBusinessSettingsCache,
} from '@/lib/business-settings-cache';
import { DEFAULT_TIME_ZONE } from '@/lib/timezone';

export interface BusinessSettings {
  currency: string;
  timezone: string;
}

/** A save response is untrusted, so the provider validates both fields on write. */
export interface BusinessSettingsInput {
  currency: unknown;
  timezone: unknown;
}

interface BusinessSettingsSnapshot extends BusinessSettings {
  /** The business these settings belong to, or `''` when signed out. */
  businessId: string;
  /** False on the server and the hydration render, true once client storage is read. */
  mounted: boolean;
}

interface BusinessSettingsContextValue extends BusinessSettingsSnapshot {
  /**
   * Persist settings for the business that owned the save. Pass the id captured
   * before the request so a sign out or a switch in flight drops the commit.
   */
  updateSettings: (settings: BusinessSettingsInput, targetBusinessId: string) => void;
}

const FALLBACK_SETTINGS: BusinessSettings = {
  currency: '',
  timezone: DEFAULT_TIME_ZONE,
};

const SERVER_SNAPSHOT: BusinessSettingsSnapshot = {
  ...FALLBACK_SETTINGS,
  businessId: '',
  mounted: false,
};

/**
 * Settings fetched or saved during this app load. It wins over the cache while
 * it belongs to the active business; a sign out or a business switch drops it.
 */
let liveSnapshot: (BusinessSettings & { businessId: string }) | null = null;
let snapshot: BusinessSettingsSnapshot = SERVER_SNAPSHOT;
let snapshotKey = '';

const listeners = new Set<() => void>();

function settingsKey(settings: BusinessSettings): string {
  return `${settings.currency}|${settings.timezone}`;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop settings that belong to a business other than the active one. */
function pruneLiveSnapshot(businessId: string): void {
  if (liveSnapshot && liveSnapshot.businessId !== businessId) liveSnapshot = null;
}

function computeSnapshot(): BusinessSettingsSnapshot {
  const auth = getAuth();
  if (!auth) return { ...FALLBACK_SETTINGS, businessId: '', mounted: true };

  pruneLiveSnapshot(auth.businessId);

  const base =
    liveSnapshot && liveSnapshot.businessId === auth.businessId
      ? liveSnapshot
      : (readBusinessSettingsCache(auth.businessId) ?? FALLBACK_SETTINGS);

  return {
    currency: base.currency,
    timezone: base.timezone,
    businessId: auth.businessId,
    mounted: true,
  };
}

function getSnapshot(): BusinessSettingsSnapshot {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;

  const next = computeSnapshot();
  const nextKey = `${next.businessId}|${next.currency}|${next.timezone}|${next.mounted}`;
  if (nextKey !== snapshotKey) {
    snapshotKey = nextKey;
    snapshot = next;
  }
  return snapshot;
}

function getServerSnapshot(): BusinessSettingsSnapshot {
  return SERVER_SNAPSHOT;
}

/** Read the two settings from a profile response without trusting the rest. */
function settingsFromProfile(payload: unknown): BusinessSettings | null {
  if (!payload || typeof payload !== 'object') return null;

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const currency = CurrencyEnum.safeParse(record.currency);
  const timezone = TimezoneSchema.safeParse(record.timezone);

  return {
    currency: currency.success ? currency.data : '',
    timezone: timezone.success ? timezone.data : DEFAULT_TIME_ZONE,
  };
}

/** Persist one business's settings and notify every consumer. */
function commitSettings(businessId: string, settings: BusinessSettings): void {
  liveSnapshot = { businessId, ...settings };
  writeBusinessSettingsCache(businessId, settings);
  emit();
}

/**
 * Keep the last valid value for any field a caller got wrong. The profile
 * fetch and the cache read already validate; this does the same for a write,
 * so one bad field in a 200 response cannot blank the badge or poison the cache
 * while the other field from the same save still lands.
 */
function sanitizeSettings(
  next: BusinessSettingsInput,
  fallback: BusinessSettings,
): BusinessSettings {
  const currency = CurrencyEnum.safeParse(next.currency);
  const timezone = TimezoneSchema.safeParse(next.timezone);
  return {
    currency: currency.success ? currency.data : fallback.currency,
    timezone: timezone.success ? timezone.data : fallback.timezone,
  };
}

function subscribeToAuthChanges(listener: () => void): () => void {
  return subscribeToAuth(() => {
    // setAuth and clearAuth both change the active business, so a value that
    // came from a fetch or save for the previous one must not survive.
    liveSnapshot = null;
    listener();
  });
}

function subscribeToSettings(listener: () => void): () => void {
  const unsubscribeSettings = subscribe(listener);
  const unsubscribeAuth = subscribeToAuthChanges(listener);
  return () => {
    unsubscribeSettings();
    unsubscribeAuth();
  };
}

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | null>(null);

export function BusinessSettingsProvider({ children }: { children: React.ReactNode }) {
  const current = useSyncExternalStore(subscribeToSettings, getSnapshot, getServerSnapshot);
  const businessId = current.businessId;

  useEffect(() => {
    if (businessId === '') return;

    let cancelled = false;

    const load = () => {
      const auth = getAuth();
      // An auth listener can fire before React runs this effect's cleanup, so
      // its captured business may already be stale. Skip that duplicate; the
      // effect for the new business makes the one request that matters.
      if (!auth || auth.businessId !== businessId) return;
      const targetBusinessId = auth.businessId;

      apiFetch('/api/business/me')
        .then(async (response) => {
          if (!response.ok) return;
          const payload: unknown = await response.json();
          const next = settingsFromProfile(payload);
          if (!next || cancelled) return;

          // A sign out or a switch while the request was in flight must win.
          const active = getAuth();
          if (!active || active.businessId !== targetBusinessId) return;
          if (settingsKey(next) === settingsKey(getSnapshot())) return;

          commitSettings(targetBusinessId, next);
        })
        .catch(() => {
          // Keep the cache or the fallback; the page handles its own errors.
        });
    };

    load();
    const unsubscribe = subscribeToAuth(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [businessId]);

  const updateSettings = useCallback((next: BusinessSettingsInput, targetBusinessId: string) => {
    const auth = getAuth();
    // A sign out or a switch while the save was in flight must win.
    if (!auth || auth.businessId !== targetBusinessId) return;
    // Validate at the write path so every caller is protected, not each call site.
    commitSettings(targetBusinessId, sanitizeSettings(next, getSnapshot()));
  }, []);

  const value = useMemo<BusinessSettingsContextValue>(
    () => ({
      currency: current.currency,
      timezone: current.timezone,
      businessId: current.businessId,
      mounted: current.mounted,
      updateSettings,
    }),
    [current.businessId, current.currency, current.mounted, current.timezone, updateSettings],
  );

  return (
    <BusinessSettingsContext.Provider value={value}>{children}</BusinessSettingsContext.Provider>
  );
}

export function useBusinessSettings(): BusinessSettingsContextValue {
  const context = useContext(BusinessSettingsContext);

  if (!context) {
    throw new Error('useBusinessSettings must be used within BusinessSettingsProvider');
  }

  return context;
}
