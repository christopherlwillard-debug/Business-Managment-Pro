import { expect } from "vitest";

export type StrictQueryQueueKind = "select" | "execute" | "mutation-return";

export interface StrictQueryQueueOptions {
  kind: StrictQueryQueueKind;
  /**
   * Included in assertion and exhaustion messages. Use a route-specific label
   * when a fixture distinguishes, for example, INSERT from UPDATE RETURNING.
   */
  label?: string;
}

export interface StrictQueryQueue<T extends unknown[]> extends Array<T> {
  take(scenario: string, options?: { strict?: boolean; fallback?: T }): T;
  reset(): void;
  assertConsumed(scenario: string, options?: { strict?: boolean }): void;
  readonly consumedSlots: number;
  readonly missingSlots: readonly number[];
}

const defaultLabels: Record<StrictQueryQueueKind, string> = {
  select: "select",
  execute: "execute",
  "mutation-return": "mutation-return",
};

/**
 * Creates an array-like ordered response queue for route-test database mocks.
 * Fixture setup can continue to use `queue.push(...)`; mocked query methods call
 * `queue.take(scenario)`, and test cleanup calls `queue.assertConsumed(scenario)`.
 */
export function createStrictQueryQueue<T extends unknown[]>(
  options: StrictQueryQueueOptions,
): StrictQueryQueue<T> {
  const queue = [] as unknown as StrictQueryQueue<T>;
  const label = options.label ?? defaultLabels[options.kind];
  let consumedSlots = 0;
  const missingSlots: number[] = [];

  Object.defineProperties(queue, {
    consumedSlots: {
      enumerable: true,
      get: () => consumedSlots,
    },
    missingSlots: {
      enumerable: true,
      get: () => missingSlots,
    },
  });

  queue.take = (scenario, takeOptions = {}) => {
    const slot = consumedSlots++;
    const queued = queue.shift();

    if (queued !== undefined) {
      return queued;
    }

    missingSlots.push(slot);
    if (takeOptions.strict === false) {
      return takeOptions.fallback ?? ([] as unknown as T);
    }

    throw new Error(`[${scenario}] missing queued ${label} slot [${slot}]`);
  };

  queue.reset = () => {
    queue.length = 0;
    consumedSlots = 0;
    missingSlots.length = 0;
  };

  queue.assertConsumed = (scenario, assertOptions = {}) => {
    if (assertOptions.strict === false) {
      return;
    }

    expect(
      missingSlots,
      `[${scenario}] missing queued ${label} slot(s)`,
    ).toHaveLength(0);
    expect(
      queue,
      `[${scenario}] unconsumed queued ${label} slot(s) after ${consumedSlots} consumed`,
    ).toHaveLength(0);
  };

  return queue;
}