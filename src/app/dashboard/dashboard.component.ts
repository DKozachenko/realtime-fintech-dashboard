import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CentsPipe } from '../pipes/cents.pipe';
import { ImbalancePipe } from '../pipes/imbalance.pipe';
import { InstrumentPipe } from '../pipes/instrument.pipe';
import { ProducerService } from '../services/producer.service';
import { nominalRate } from '../shared/settings';
import { StatusIndicatorComponent } from '../ui/status-indicator.component';
import { PriceTrendDirective } from './price-trend.directive';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CentsPipe, ImbalancePipe, InstrumentPipe, PriceTrendDirective, StatusIndicatorComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly producer = inject(ProducerService);
  protected readonly rate = computed(() => nominalRate(this.producer.activeSettings()));

  protected readonly canToggle = computed(() => {
    const status = this.producer.status();
    return status === 'running' || status === 'paused';
  });

  protected toggle(): void {
    if (this.producer.status() === 'paused') {
      this.producer.resume();
    } else {
      this.producer.pause();
    }
  }
}
