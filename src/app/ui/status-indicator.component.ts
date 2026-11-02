import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProducerStatus } from '../services/producer.service';

const LABELS: Record<ProducerStatus, string> = {
  initializing: 'Initializing',
  running: 'Running',
  paused: 'Paused',
  error: 'Error',
};

@Component({
  selector: 'app-status-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" [class]="status()" aria-hidden="true"></span>{{ label() }}`,
  styleUrl: './status-indicator.component.scss',
})
export class StatusIndicatorComponent {
  readonly status = input.required<ProducerStatus>();
  protected readonly label = computed(() => LABELS[this.status()]);
}
