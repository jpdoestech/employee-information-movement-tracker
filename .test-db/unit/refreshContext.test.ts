import { afterEach, expect, it, vi } from "vitest";
import { refreshContext } from "../../src/refreshContext";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("pauses hidden-tab polling, refreshes on return, and deduplicates concurrent events", async () => {
  vi.useFakeTimers();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  let finish!: () => void;
  const read = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = refreshContext(read);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30000);
  window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledTimes(1);
  finish();
  await Promise.resolve();
  document.hidden = true;
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledTimes(2);
  finish();
  await Promise.resolve();
  window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30000);
  expect(read).toHaveBeenCalledTimes(3);
  stop();
  finish();
  await vi.advanceTimersByTimeAsync(60000);
  window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledTimes(3);
});
