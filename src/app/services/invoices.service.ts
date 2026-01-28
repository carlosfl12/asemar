import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class InvoicesService {
  private readonly url = environment.api;
  private http: HttpClient = inject(HttpClient);
  getInvoiceBySession(id: Number, id_user: Number | string) {
    return this.http.get(
      this.url + `getFacturas?id_session=${id}&id_user=${id_user}`,
    );
  }
}
