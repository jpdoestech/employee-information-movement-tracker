type Pending = { id: symbol; label: string; startedAt: number };
let pending: Pending[] = [];
const listeners = new Set<(items: Pending[]) => void>();
export const pendingTransactions = () => pending;
export function subscribeTransactions(listener: (items: Pending[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish() {
  listeners.forEach((listener) => listener(pending));
}
export async function trackTransaction<T>(
  label: string,
  execute: () => Promise<T>,
): Promise<T> {
  const id = Symbol();
  pending = [...pending, { id, label, startedAt: Date.now() }];
  publish();
  try {
    return await execute();
  } finally {
    pending = pending.filter((item) => item.id !== id);
    publish();
  }
}
