import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

type ClientSummary = {
  id_user: string | number;
  username: string;
  pass: string;
  pending: number;
};

@Component({
  selector: 'asm-secciones',
  imports: [CommonModule],
  templateUrl: './secciones.component.html',
  styleUrl: './secciones.component.scss',
})
export class SeccionesComponent implements OnInit {
  private readonly apiUrl = environment.apiUrl;
  router = inject(Router);
  clientes = signal<ClientSummary[]>([]);
  error = signal<string | null>(null);
  hasClientes = computed(() => this.clientes().length > 0);

  ngOnInit(): void {
    this.error.set(null);
    try {
      this.loadPendingInvoices();
    } catch (e: any) {
      console.error(e);
      this.error.set('No se pudieron cargar los clientes.');
    }
  }
  openClient(c: ClientSummary) {
    console.log(c);
    this.router.navigate(['/', c.id_user, 'facturas']);
  }

  async loadPendingInvoices() {
    try {
      const res = await fetch(`${this.apiUrl}/api/count`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.clientes.set(data);
      return data;
    } catch (err) {
      console.error('Error', err);
    }
  }
}
