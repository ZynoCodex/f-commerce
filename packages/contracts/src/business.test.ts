import { describe, expect, it } from 'vitest';
import { BusinessResponseSchema, OnboardingDraftSchema } from './index.js';

function baseResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      name: 'Maya Traders',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
      logoUrl: null,
      address: { street: '1 Main Rd', city: 'Dhaka', country: 'Bangladesh' },
      onboardingComplete: false,
      ...overrides,
    },
    message: 'Business profile retrieved',
  };
}

describe('business response contract', () => {
  // The endpoints now send the draft, so the schema must declare it.
  it('accepts a partial onboarding draft on the response', () => {
    const parsed = BusinessResponseSchema.parse(
      baseResponse({ onboardingDraft: { timezone: 'America/New_York' } }),
    );

    expect(parsed.data.onboardingDraft).toEqual({ timezone: 'America/New_York' });
  });

  it('accepts a null draft once onboarding completes', () => {
    const parsed = BusinessResponseSchema.parse(
      baseResponse({ onboardingComplete: true, onboardingDraft: null }),
    );

    expect(parsed.data.onboardingDraft).toBeNull();
  });

  it('accepts a response that omits the draft, as the write routes do', () => {
    const parsed = BusinessResponseSchema.parse(baseResponse());

    expect(parsed.data.onboardingDraft).toBeUndefined();
  });

  it('rejects a draft carrying an unknown timezone', () => {
    const result = BusinessResponseSchema.safeParse(
      baseResponse({ onboardingDraft: { timezone: 'Mars/Olympus' } }),
    );

    expect(result.success).toBe(false);
  });

  it('keeps every draft field optional because the wizard saves one at a time', () => {
    expect(OnboardingDraftSchema.parse({})).toEqual({});
    expect(
      OnboardingDraftSchema.parse({
        name: 'Draft Co',
        currency: 'EUR',
        timezone: 'Europe/Berlin',
        address: { street: '', city: '', country: 'Bangladesh' },
        logoUrl: 'https://example.com/logo.png',
      }),
    ).toMatchObject({ name: 'Draft Co', currency: 'EUR', timezone: 'Europe/Berlin' });
  });
});
