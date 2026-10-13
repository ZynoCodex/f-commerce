'use client';

import { useState, useEffect } from 'react';
import { Button, Field, FormMessage, Input, Select } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/auth-guard';
import type { BusinessProfile } from '@f-commerce/contracts';

type Address = {
  street: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
};

type BusinessData = {
  name: string;
  currency: string;
  logoUrl: string | null;
  address: Address | null;
  onboardingComplete: boolean;
};

export default function SettingsPage() {
  // Gate behind authentication. All hooks below are called unconditionally
  // so hook order is stable across the ready/not-ready renders.
  const ready = useRequireAuth();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    currency: 'BDT' as BusinessProfile['currency'],
    address: {
      street: '',
      city: '',
      region: '',
      postalCode: '',
      country: 'Bangladesh',
    } as Address,
  });

  useEffect(() => {
    let cancelled = false;
    void cancelled;

    apiFetch('/api/business/me')
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || 'Failed to load business');
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          const b = data.data;
          setBusiness(b);
          setForm({
            name: b.name,
            currency: (b.currency || 'BDT') as BusinessProfile['currency'],
            address: b.address
              ? {
                  street: b.address.street,
                  city: b.address.city,
                  region: b.address.region || '',
                  postalCode: b.address.postalCode || '',
                  country: b.address.country,
                }
              : {
                  street: '',
                  city: '',
                  region: '',
                  postalCode: '',
                  country: 'Bangladesh',
                },
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <div className="p-8">Loading...</div>;

  const saveProfile = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/business/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || 'Failed to save profile');
      }

      setSuccess('Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Business profile</h1>
        <p className="mt-1 text-sm text-body">
          Your business information, billing address, and currency.
        </p>
      </div>

      {business?.logoUrl && (
        <div className="flex items-center gap-4">
          <img
            alt="Business logo"
            className="h-12 w-12 rounded object-contain"
            src={business.logoUrl}
          />
          <span className="text-sm text-muted">Logo is set via the onboarding wizard</span>
        </div>
      )}

      {error && <FormMessage id="settings-error">{error}</FormMessage>}
      {success && (
        <p className="text-sm text-success" role="status">
          {success}
        </p>
      )}

      <div className="space-y-6">
        <Field label="Business name" htmlFor="business-name">
          <Input
            id="business-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Maya Traders"
          />
        </Field>

        <Field label="Currency" htmlFor="currency">
          <Select
            id="currency"
            value={form.currency}
            onChange={(e) =>
              setForm({ ...form, currency: e.target.value as BusinessProfile['currency'] })
            }
          >
            <option value="BDT">BDT - Bangladeshi Taka</option>
            <option value="USD">USD - US Dollar</option>
            <option value="EUR">EUR - Euro</option>
            <option value="GBP">GBP - British Pound</option>
          </Select>
        </Field>

        <Field label="Street" htmlFor="street">
          <Input
            id="street"
            type="text"
            value={form.address.street}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, street: e.target.value } })
            }
            placeholder="123 Main Street"
          />
        </Field>

        <Field label="City" htmlFor="city">
          <Input
            id="city"
            type="text"
            value={form.address.city}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, city: e.target.value } })
            }
            placeholder="Dhaka"
          />
        </Field>

        <Field label="Region / State" htmlFor="region" description="Optional">
          <Input
            id="region"
            type="text"
            value={form.address.region || ''}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, region: e.target.value } })
            }
            placeholder="Dhaka Division"
          />
        </Field>

        <Field label="Postal code" htmlFor="postal-code" description="Optional">
          <Input
            id="postal-code"
            type="text"
            value={form.address.postalCode || ''}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })
            }
            placeholder="1000"
          />
        </Field>

        <Field label="Country" htmlFor="country">
          <Input
            id="country"
            type="text"
            value={form.address.country}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, country: e.target.value } })
            }
          />
        </Field>

        <Button onClick={saveProfile} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
