import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'facturas', pathMatch: 'full' },
  {
    path: 'transfer',
    loadComponent: () =>
      import('./features/transfer/sender/sender.page').then(
        (m) => m.SenderPage,
      ),
  },
  {
    path: 'display',
    loadComponent: () =>
      import('./features/transfer/receiver/receiver.page').then(
        (m) => m.ReceiverPage,
      ),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.page/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'facturas',
    loadComponent: () =>
      import('./features/components/invoice-manager/invoice-manager.component').then(
        (m) => m.InvoiceManagerComponent,
      ),
  },
  {
    path: 'facturas/:id',
    loadComponent: () =>
      import('./features/components/invoice-manager/invoice-manager.component').then(
        (m) => m.InvoiceManagerComponent,
      ),
  },
  {
    path: 'notify/:id',
    loadComponent: () =>
      import('./features/components/sse/sse.component').then(
        (m) => m.SseComponent,
      ),
  },
  {
    path: 'notify',
    loadComponent: () =>
      import('./features/components/sse/sse.component').then(
        (m) => m.SseComponent,
      ),
  },
  {
    path: 'secciones',
    loadComponent: () =>
      import('./features/secciones/secciones.component').then(
        (m) => m.SeccionesComponent,
      ),
  },

  // { path: '**', redirectTo: 'transfer' },
];
