import { WorkerCommand, WorkerEvent } from '../../shared/messages';
import { WorkerLike } from '../producer.service';

export class FakeWorker implements WorkerLike {
  sent: WorkerCommand[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  postMessage(command: WorkerCommand): void {
    this.sent.push(command);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(event: WorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}
