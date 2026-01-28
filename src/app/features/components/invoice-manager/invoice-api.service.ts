import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Descrypt } from '../../../services/descrypt';
import { InvoiceRow } from '../../../models/invoice.models';

export interface InvoiceSaveOptions {
  prefijo: string | null;
  numero_factura: string | null;
  nombre_cliente: string | null;
  nombre_proveedor: string | null;
  fecha: string | null;
  nif_emision: string | null;
  nif_receptor: string | null;
  cif_lateral: string | null;
  base1: number | null;
  iva1: number | null;
  cuota1: number | null;
  recargo1: number | null;
  base2: number | null;
  iva2: number | null;
  cuota2: number | null;
  recargo2: number | null;
  base3: number | null;
  iva3: number | null;
  cuota3: number | null;
  recargo3: number | null;
  base_retencion: number | null;
  porcentaje_retencion: number | null;
  cuota_retencion: number | null;
  importe_total: number | null;
  metodo_pago: string | null;
  valid: boolean;
  url: string | null;
  corregido: number | string | null;
  cuenta_contable?: number | null;
  tipo: string | null;
  longitud: string | null;
  nombre_factura: string | null;
  num_apunte: number | null;
  id_doc_drive: string;
  timestamp: string;
  userId: string | number;
  codEmpresa?: string;
}

@Injectable({
  providedIn: 'root',
})
export class InvoiceApiService {
  private readonly apiUrl = environment.apiUrl;
  private readonly api = environment.api;
  private readonly realUrl = 'https://pr99.esphera.ai/api/public/index.php';
  private readonly key = 'UUe5aT9rjkcxMEXcyHbnVIk3AbKbdNhxTgYdTX84Al3x4Y3cMs';

  private readonly http = inject(HttpClient);
  private readonly descrypt = inject(Descrypt);

  async fetchAllInvoices(userId?: string): Promise<any[]> {
    return await this.getDecryptedInvoice('', '');
  }

  async getDecryptedInvoice(clientId: string, invoiceId: string): Promise<any> {
    const params = new HttpParams()
      .set('action', 'invoice')
      .set('client_id', clientId)
      .set('invoice_id', invoiceId);

    try {
      const data = await firstValueFrom(
        this.http.get<{ invoice: any }>(this.realUrl, { params }),
      );

      if (data.invoice) {
        const plainText = await this.descrypt.decryptPhpAes256Gcm(
          data.invoice,
          this.key,
        );
        if (plainText) {
          return JSON.parse(plainText);
        }
        console.error('Failed to decrypt the invoice data.');
        return null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching invoice:', error);
      return null;
    }
  }

  async loadTotalInvoices(userId?: string | number): Promise<number> {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', String(userId));

    const url = `${this.apiUrl}/api/pages${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = await res.json();
      return Number(total) || 0;
    } catch (err) {
      console.error('Error cargando total de facturas:', err);
      return 0;
    }
  }

  async getPendingInvoices(): Promise<any[]> {
    try {
      const res = await fetch(`${this.apiUrl}/api/count`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error obteniendo facturas pendientes:', err);
      return [];
    }
  }

  async updateInvoice(options: InvoiceSaveOptions): Promise<void> {
    await fetch(`${this.apiUrl}/api/invoices`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(options),
    });
  }

  async discardInvoice(idDocDrive: string, timestamp: string): Promise<void> {
    await fetch(`${this.apiUrl}/api/discard`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id_doc_drive: idDocDrive, timestamp }),
    });
  }

  async sendInvoiceData(
    options: InvoiceSaveOptions,
    total: number,
  ): Promise<any> {
    const dataToSend = {
      ...options,
      id_user: options.userId,
      file: options.nombre_factura,
      totalFiles: String(total),
      status: 'completed',
      corregido: 1,
    };

    const url = this.api;
    const resp = await fetch(
      url + `saveFactura?action=update&id_user=${dataToSend.id_user}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      },
    );

    if (!resp.ok) {
      throw new Error(`Error HTTP: ${resp.status}`);
    }

    return await resp.json();
  }

  async getContador(userId: string, timestamp: string): Promise<any> {
    const url = `${this.api}contador?id_user=${userId}&timestamp=${timestamp}`;
    const response = await fetch(url);
    return await response.json();
  }

  async sendDiscardedInvoiceData(
    options: InvoiceSaveOptions,
    total: number,
  ): Promise<any> {
    const dataToSend = {
      ...options,
      userId: options.userId,
      file: options.nombre_factura,
      totalFiles: String(total),
      corregido: '-1',
    };

    const url = 'https://demo99.esphera.ai/ws/n8n/getCuentaContable.php';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataToSend }),
    });

    if (!resp.ok) {
      throw new Error(`Error HTTP: ${resp.status}`);
    }

    return await resp.json();
  }

  getCorregidoStatus(timestamp: string, id_user: Number) {
    return this.http.get(
      this.api + `getFacturas?timestamp=${timestamp}&id_user=${id_user}`,
    );
  }
}
