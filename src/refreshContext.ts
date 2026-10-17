// Visible workspaces recheck authorization every 30 seconds; reads never overlap.
export function refreshContext(read: () => Promise<void>) {
  let disposed = false;
  let pending = false;
  let lastStarted = -Infinity;
  const refresh = async () => {
    if (
      disposed ||
      document.hidden ||
      pending ||
      Date.now() - lastStarted < 1000
    )
      return;
    pending = true;
    lastStarted = Date.now();
    try {
      await read();
    } finally {
      pending = false;
    }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), 30000);
  const onVisible = () => void refresh();
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    disposed = true;
    clearInterval(timer);
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
