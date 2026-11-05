import { describe, it, expect } from "vitest";
import {
  pendingTransactions,
  subscribeTransactions,
  trackTransaction,
} from "../../src/transactions";

describe("transaction progress lifecycle", () => {
  it("keeps concurrent operations independent until each settles", async () => {
    const seen: string[][] = [];
    const unsubscribe = subscribeTransactions((items) =>
      seen.push(items.map((item) => item.label)),
    );
    let finishFirst!: (value: number) => void,
      finishSecond!: (value: number) => void;
    const first = trackTransaction(
      "Save employee",
      () =>
        new Promise<number>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const second = trackTransaction(
      "Record movement",
      () =>
        new Promise<number>((resolve) => {
          finishSecond = resolve;
        }),
    );
    expect(pendingTransactions()).toHaveLength(2);
    finishFirst(1);
    expect(await first).toBe(1);
    expect(pendingTransactions().map((item) => item.label)).toEqual([
      "Record movement",
    ]);
    finishSecond(2);
    expect(await second).toBe(2);
    expect(pendingTransactions()).toHaveLength(0);
    unsubscribe();
    expect(seen.at(-1)).toEqual([]);
  });
  it("clears feedback on failure and preserves the original error without retrying", async () => {
    const error = new Error("Revision conflict");
    let attempts = 0;
    await expect(
      trackTransaction("Save changes", async () => {
        attempts++;
        throw error;
      }),
    ).rejects.toBe(error);
    expect(attempts).toBe(1);
    expect(pendingTransactions()).toHaveLength(0);
  });
});
