import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Live market',
    loadComponent: () => import('../dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'settings',
    title: 'Producer settings',
    loadComponent: () => import('../settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
