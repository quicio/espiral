/**
 * Cola serial para mutaciones caras del grafo de audio.
 *
 * En vivo cada tarea corre en su propio macrotask: cambiar 16 máquinas en un
 * cambio de escena deja de bloquear el hilo principal en un solo long task.
 * En offline se usa el camino directo para no romper el determinismo.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  enqueue(task: () => void | Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const run = this.tail.then(async () => {
      if (this.disposed) return;
      await task();
      // Ceder el hilo entre mutaciones. `setTimeout(0)` es deliberado: un
      // microtask no alcanza para que el navegador pinte o procese audio.
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
    });
    this.tail = run.catch(error => {
      console.error('Mutación de audio fallida:', error);
    });
    return run;
  }

  idle(): Promise<void> {
    return this.tail;
  }

  dispose(): void {
    this.disposed = true;
  }
}
