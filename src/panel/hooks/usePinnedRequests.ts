import { useState } from 'react';
import { NetworkRequest } from './useNetworkRequests';

export function usePinnedRequests() {
  const [pinned, setPinned] = useState<[NetworkRequest | null, NetworkRequest | null]>([null, null]);

  const pin = (request: NetworkRequest) => {
    setPinned(([a, b]) => {
      if (a === null) return [request, b];
      if (b === null) return [a, request];
      // Shift: replace oldest (a), promote b to a
      return [b, request];
    });
  };

  const unpin = (slot: 0 | 1) => {
    setPinned(([a, b]) => slot === 0 ? [null, b] : [a, null]);
  };

  const clearPinned = () => setPinned([null, null]);

  const isPinned = (id: string) => pinned[0]?.id === id || pinned[1]?.id === id;

  return { pinned, pin, unpin, clearPinned, isPinned };
}
