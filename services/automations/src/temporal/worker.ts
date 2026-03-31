import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities.js';

const TASK_QUEUE = 'elevatedpos-automations';

let workerInstance: Worker | null = null;

/**
 * Start the Temporal worker.
 *
 * Gracefully degrades: if Temporal is unavailable the function logs a warning
 * and resolves without throwing, so the Fastify server can continue running.
 */
export async function startWorker(): Promise<void> {
  const temporalAddress =
    process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';

  try {
    const connection = await NativeConnection.connect({ address: temporalAddress });

    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: TASK_QUEUE,
      // Workflow bundle — point to the compiled workflows file.
      // Using workflowsPath so the Temporal worker can sandbox the workflow
      // code in an isolate (required for determinism guarantees).
      workflowsPath: new URL('./workflows.js', import.meta.url).pathname,
      activities,
    });

    workerInstance = worker;

    console.log(
      `[temporal/worker] Worker started — task queue: ${TASK_QUEUE}, address: ${temporalAddress}`,
    );

    // Run the worker (non-blocking with respect to the caller — we do NOT
    // await this; it runs until the process exits or worker.shutdown() is called).
    worker.run().catch((err: unknown) => {
      console.error('[temporal/worker] Worker run loop error:', err);
    });
  } catch (err) {
    // Graceful degradation: Temporal is optional at runtime
    console.warn(
      `[temporal/worker] Could not connect to Temporal at ${temporalAddress} — worker disabled. ` +
        `Automations will be queued without Temporal. Error: ${String(err)}`,
    );
  }
}

/**
 * Gracefully stop the worker (used during process shutdown).
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.shutdown();
    workerInstance = null;
    console.log('[temporal/worker] Worker shut down.');
  }
}
