import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './config/app.routes';

describe('AppComponent', () => {
  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideExperimentalZonelessChangeDetection(), provideRouter(routes)],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('links the rail to the dashboard and settings pages', async () => {
    const el = await render();
    expect(el.querySelector('a[aria-label="Dashboard"]')?.getAttribute('href')).toBe('/dashboard');
    expect(el.querySelector('a[aria-label="Settings"]')?.getAttribute('href')).toBe('/settings');
  });

  it('hosts a router outlet next to the rail', async () => {
    const el = await render();
    expect(el.querySelector('nav.rail')).not.toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });
});
