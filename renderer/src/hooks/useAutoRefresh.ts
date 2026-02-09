import { useEffect, useRef } from 'react';

interface UseAutoRefreshOptions {
  enabled: boolean;
  intervalMs?: number;
  refreshFunctions: (() => Promise<void> | void)[];
}

/**
 * Custom hook that automatically refreshes data at a specified interval
 * @param enabled - Whether auto-refresh is enabled (typically when repo is open)
 * @param intervalMs - Refresh interval in milliseconds (default: 10000 = 10 seconds)
 * @param refreshFunctions - Array of async functions to call on each refresh
 */
export function useAutoRefresh({
  enabled,
  intervalMs = 10000,
  refreshFunctions,
}: UseAutoRefreshOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const functionsRef = useRef(refreshFunctions);
  const isRefreshingRef = useRef(false);

  // Update functions ref when they change
  useEffect(() => {
    functionsRef.current = refreshFunctions;
  }, [refreshFunctions]);

  useEffect(() => {
    if (!enabled) {
      // Clear interval if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial refresh
    const performRefresh = async () => {
      if (isRefreshingRef.current) return;
      
      isRefreshingRef.current = true;
      try {
        await Promise.all(
          functionsRef.current.map((fn) => {
            try {
              return fn();
            } catch (error) {
              console.error('Error in refresh function:', error);
              return Promise.resolve();
            }
          })
        );
      } catch (error) {
        console.error('Error during auto-refresh:', error);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // Perform initial refresh
    performRefresh();

    // Set up interval
    intervalRef.current = setInterval(performRefresh, intervalMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs]);
}

