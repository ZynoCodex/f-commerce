import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { BusinessSettingsProvider } from '@/components/business/business-settings-provider';

/**
 * Render a page under the app's shared business settings provider. Tests that
 * need a specific currency keep mocking `GET /api/business/me`, which the
 * provider reads the same way the running app does.
 */
export function render(ui: ReactElement) {
  return testingLibraryRender(<BusinessSettingsProvider>{ui}</BusinessSettingsProvider>);
}
