import { describe, expect, it } from 'vitest';
import { SerialTaskQueue } from './serial-task-queue';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('SerialTaskQueue', () => {
  it('runs tasks in order without overlap', async () => {
    const queue = new SerialTaskQueue();
    const log: number[] = [];
    let active = 0;
    let maxActive = 0;

    const task = (value: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      log.push(value);
      await wait(2);
      active -= 1;
    };

    await Promise.all([
      queue.enqueue(task(1)),
      queue.enqueue(task(2)),
      queue.enqueue(task(3))
    ]);

    expect(log).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it('keeps draining after an error', async () => {
    const queue = new SerialTaskQueue();
    const log: number[] = [];

    await queue
      .enqueue(() => {
        log.push(1);
        throw new Error('boom');
      })
      .catch(() => undefined);
    await queue.enqueue(() => {
      log.push(2);
    });

    expect(log).toEqual([1, 2]);
  });

  it('ignores tasks after dispose', async () => {
    const queue = new SerialTaskQueue();
    let ran = false;
    queue.dispose();
    await queue.enqueue(() => {
      ran = true;
    });
    expect(ran).toBe(false);
  });
});
