'use client';

import { useSyncExternalStore } from 'react';
import { API_KEY_CHANGE_EVENT, getApiKey } from '../utils/auth';

export function useApiKey(): string | null | undefined {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};

      const handler = () => onStoreChange();

      window.addEventListener('storage', handler);
      window.addEventListener(API_KEY_CHANGE_EVENT, handler);

      return () => {
        window.removeEventListener('storage', handler);
        window.removeEventListener(API_KEY_CHANGE_EVENT, handler);
      };
    },
    () => getApiKey(),
    () => undefined
  );
}

