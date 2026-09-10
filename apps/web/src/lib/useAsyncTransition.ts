'use client';

import { useState, useTransition } from 'react';

export function useAsyncTransition(): [boolean, (callback: () => Promise<void>) => void] {
  const [isTransitionPending, startTransition] = useTransition();
  const [isAsyncPending, setIsAsyncPending] = useState(false);

  function runTransition(callback: () => Promise<void>) {
    setIsAsyncPending(true);
    startTransition(() => {
      void callback().finally(() => setIsAsyncPending(false));
    });
  }

  return [isTransitionPending || isAsyncPending, runTransition];
}
