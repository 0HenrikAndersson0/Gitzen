import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface LogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export function useUIState() {
  const [activeTab, setActiveTab] = useState<'clone' | 'open'>('clone');
  const [showAddRemoteDialog, setShowAddRemoteDialog] = useState(false);
  const [showForcePushDialog, setShowForcePushDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetTargetCommit, setResetTargetCommit] = useState<string | null>(null);
  const [showMergeConflictDialog, setShowMergeConflictDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showGraphs, setShowGraphs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasCredentials, setHasCredentials] = useState(true);
  const [historyLimit, setHistoryLimit] = useState(50);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message }]);
  }, []);

  const checkAuthError = useCallback((errorMsg: string, silent = false, errorType?: string): boolean => {
    if (errorType === 'NetworkAuthError') {
      setHasCredentials(false);
      if (!silent) {
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-bold">Authentication Failed</span>
            <span className="text-sm opacity-90">Please use <code>gh auth login</code> or check your credential helper configuration.</span>
          </div>,
          { duration: 5000 }
        );
      }
      return true;
    }

    if (!errorMsg) return false;

    const isAuthError =
      errorMsg.includes('Authentication failed') ||
      errorMsg.includes('fatal: could not read Username') ||
      errorMsg.includes('fatal: could not read Password') ||
      errorMsg.includes('Permission denied') ||
      errorMsg.includes('401') ||
      errorMsg.includes('403') ||
      errorMsg.includes('Unauthorized');

    if (isAuthError) {
      setHasCredentials(false);
      if (!silent) {
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-bold">Authentication Failed</span>
            <span className="text-xs">
              Gitzen relies on your system's git credentials (e.g., SSH keys, GCM).
              Please use <code>gh auth login</code> or check your credential helper configuration.
            </span>
          </div>,
          { duration: 10000 }
        );
      }
      return true;
    }
    return false;
  }, []);

  const withLoading = useCallback(async (message: string, fn: () => Promise<void>) => {
    setIsLoading(true);
    setLoadingMessage(message);
    try {
      await fn();
    } finally {
      setIsLoading(false);
      setLoadingMessage(undefined);
    }
  }, []);

  const applyTheme = useCallback((theme: string) => {
    document.documentElement.classList.remove('dark');
    if (theme.includes('dark')) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return {
    activeTab, setActiveTab,
    showAddRemoteDialog, setShowAddRemoteDialog,
    showForcePushDialog, setShowForcePushDialog,
    showResetDialog, setShowResetDialog,
    resetTargetCommit, setResetTargetCommit,
    showMergeConflictDialog, setShowMergeConflictDialog,
    showSettingsDialog, setShowSettingsDialog,
    showCreateBranchDialog, setShowCreateBranchDialog,
    showShortcutsModal, setShowShortcutsModal,
    showSplash, setShowSplash,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    showLeftPanel, setShowLeftPanel,
    showBottomPanel, setShowBottomPanel,
    showGraphs, setShowGraphs,
    logs, setLogs,
    hasCredentials, setHasCredentials,
    historyLimit, setHistoryLimit,
    addLog,
    checkAuthError,
    withLoading,
    applyTheme,
    toast
  };
}
