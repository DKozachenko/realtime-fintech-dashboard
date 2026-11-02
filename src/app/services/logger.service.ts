import { Injectable } from '@angular/core';

export type LogSource = 'app' | 'worker' | 'wasm';

/** Console-backed logger; swap the implementation to forward to an error tracker. */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  info(source: LogSource, message: string, context?: Record<string, unknown>): void {
    console.info(...this.format(source, message, context));
  }

  warn(source: LogSource, message: string, context?: Record<string, unknown>): void {
    console.warn(...this.format(source, message, context));
  }

  error(source: LogSource, message: string, context?: Record<string, unknown>): void {
    console.error(...this.format(source, message, context));
  }

  private format(source: LogSource, message: string, context?: Record<string, unknown>): unknown[] {
    const text = `[${source}] ${message}`;
    return context ? [text, context] : [text];
  }
}
