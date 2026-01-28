import {
  Component,
  computed,
  effect,
  inject,
  signal,
  OnInit,
  OnDestroy,
  viewChild,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { InvoiceRow } from '../../../models/invoice.models';
import { WebSocketService } from '../web-socket-service/web-socket-service.component';
import { Subscription, timestamp } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { DynamicFields } from '../../../models/dynamic-fields.types';
import { DynamicFieldResolverService } from '../../../shared/resolvers/dynamic-field-resolver.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CounterService } from '../../../core/stores/counter.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { UsersService } from '../../../services/users.service';
import { firstValueFrom } from 'rxjs';
import { InvoicesService } from '../../../services/invoices.service';
import { Descrypt } from '../../../services/descrypt';
import { HttpParams } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
interface RealTimeData {
  value: number;
  timestamp: number | string;
}
interface UiInvoiceItem {
  id: number | string;
  fileName: string;
  createdAt: string;
  entryTime: string; // Hora de entrada al sistema
  row: InvoiceRow;
  userName?: string; // Nombre del usuario resuelto desde id_user
}

@Component({
  selector: 'app-invoice-manager',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgxExtendedPdfViewerModule,
    PdfViewerModule,
  ],
  templateUrl: './invoice-manager.component.html',
  styleUrls: ['./invoice-manager.component.scss'],
})
export class InvoiceManagerComponent implements OnInit, OnDestroy {
  @ViewChild('visualizador') visualizador!: ElementRef;
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private readonly apiUrl = environment.apiUrl;
  private api = environment.api;
  private resolver = inject(DynamicFieldResolverService);
  private paramMapSig = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private lastPatchedId = signal<string | null>(null);
  private errorCodes: string[] = [];
  private invoiceTime: string = '';
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private usersService = inject(UsersService);
  private userNameCache = new Map<number, string>();
  private invoicesService = inject(InvoicesService);
  private descrypt = inject(Descrypt);
  protected readonly title = signal('esphera-test');
  protected dataInvoice = signal<any>(null);
  private readonly http: HttpClient = inject(HttpClient);

  private readonly key = 'UUe5aT9rjkcxMEXcyHbnVIk3AbKbdNhxTgYdTX84Al3x4Y3cMs';

  private readonly realUrl = 'https://pr99.esphera.ai/api/public/index.php';

  currentTime = signal<Date>(new Date());

  lastNumDoc = signal<number | null>(null);
  pdfUrl1!: SafeResourceUrl;

  iframe: any;

  // HTML
  showAll = signal(false);

  // Filtro de usuarios
  selectedUserFilters = signal<Set<string>>(new Set());

  availableUsers = computed(() => {
    const users = new Set<string>();
    this.invoices().forEach((inv) => {
      if (inv.userName) users.add(inv.userName);
    });
    return Array.from(users).sort();
  });

  filteredInvoices = computed(() => {
    const selected = this.selectedUserFilters();
    const all = this.invoices();
    if (selected.size === 0) return all;
    return all.filter((inv) => inv.userName && selected.has(inv.userName));
  });

  // Facturas
  invoices = signal<UiInvoiceItem[]>([]);
  get correctInvoices() {
    return this.counters.correctInvoices;
  }
  get totalInvoices() {
    return this.counters.totalInvoices;
  }
  tipo = signal<string | null>('');
  pending = signal<number>(0);

  // Códigos de error
  fields: DynamicFields<keyof InvoiceRow>[] = [];
  errorCode = signal('');

  selectedId = signal<string | null>(null);
  selectedUserId = signal<string | null>(null);
  selectedInvoice = signal<UiInvoiceItem | null>(null);

  form = this.fb.nonNullable.group({
    numero_factura: this.fb.control<string | null>(null),
    nombre_factura: this.fb.control<string | null>(null),
    nombre_cliente: this.fb.control<string | null>(null),
    nombre_proveedor: this.fb.control<string | null>(null),
    fecha: this.fb.control<string | null>(null),
    nif_emision: this.fb.control<string | null>(null),
    nif_receptor: this.fb.control<string | null>(null),
    cif_lateral: this.fb.control<string | null>(null),

    base1: this.fb.control<number | null>(0),
    iva1: this.fb.control<number | null>(0),
    cuota1: this.fb.control<number | null>(0),
    recargo1: this.fb.control<number | null>(0),

    base2: this.fb.control<number | null>(null),
    iva2: this.fb.control<number | null>(null),
    cuota2: this.fb.control<number | null>(null),
    recargo2: this.fb.control<number | null>(null),

    base3: this.fb.control<number | null>(null),
    iva3: this.fb.control<number | null>(null),
    cuota3: this.fb.control<number | null>(null),
    recargo3: this.fb.control<number | null>(null),

    base_retencion: this.fb.control<number | null>(null),
    porcentaje_retencion: this.fb.control<number | null>(null),
    cuota_retencion: this.fb.control<number | null>(null),
    tipo: this.fb.control<string | null>(null),

    importe_total: this.fb.control<number | null>(0),
    metodo_pago: this.fb.control<string | null>(null),
    prefijo: this.fb.control<string | null>(null),
    // cuenta_contable: this.fb.control<number | null>(0),
    num_apunte: this.fb.control<number | null>(0),
    longitud: this.fb.control<string | null>(null),

    valid: this.fb.control<boolean>(false),
    url: this.fb.control<string | null>(null),
    corregido: this.fb.control<number | null>(1),
  });

  constructor(
    private sanitizer: DomSanitizer,
    private counters: CounterService,
  ) {
    effect(() => {
      const params = this.paramMapSig();
      const id = params.get('id');
      const userId = params.get('userId');
      const row = this.selectedInvoice();

      this.selectedId.set(id ?? null);
      this.selectedUserId.set(userId ?? null);

      if (!id) {
        this.selectedInvoice.set(null);
        return;
      }

      const list = this.invoices();
      const found =
        list.find((x) => String(x.row?.id_doc_drive) === id) ?? null;

      if (found && this.selectedInvoice() !== found) {
        this.selectedInvoice.set(found);
      }

      const current = this.selectedInvoice();

      if (current?.row.url) {
        this.createIframe();
      }

      const codeUnknown =
        (current?.row as any)?.error_code ??
        (current?.row as any)?.code_error ??
        null;

      if (codeUnknown !== null && codeUnknown !== undefined) {
        this.loadErrorCodes(String(codeUnknown));
      }

      if (row?.row?.error_code) {
        this.loadErrorCodes(row.row.error_code);
      }

      if (current && this.lastPatchedId() !== String(current.id)) {
        this.form.reset({}, { emitEvent: false });
        this.patchRowOnlyFilled(current.row);
        this.lastPatchedId.set(String(current.id));
      }
    });
  }

  wsService = inject(WebSocketService);
  public ultimoValor: number | null = null;
  public datosRecibidos: RealTimeData[] = [];
  subscription!: Subscription;

  ngOnInit() {
    const userId = this.route.snapshot.paramMap.get('userId');
    this.selectedUserId.set(userId);

    // Actualizar el tiempo cada segundo
    this.timerInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);

    this.loadAll();
    this.subscription = this.wsService.messages$.subscribe({
      next: (evt: any) => {
        let payload = evt?.data ?? evt?.value ?? evt ?? null;
        let data = evt;

        console.log('[DATOS GENERALES]', data);
        this.invoiceTime = new Date().toISOString();
        console.log('[HORA ENTRADA]', this.invoiceTime);
        const comparison = this.compareInvoiceTimeWithNow();
        console.log('[HORA ACTUAL]', new Date().toISOString());
        console.log(
          '[DIFERENCIA]',
          `${comparison.diffMs}ms (${comparison.diffSeconds}s)`,
        );

        const pdfUrl = evt?.url ?? payload?.url ?? null;
        const numDoc = evt?.num_doc ?? null;
        const codeError = evt?.code_error ?? '';
        const idDocDrive = evt?.id_doc_drive ?? '';
        const tipo = evt?.tipo ?? '';
        const nombreFactura = evt?.nombre_factura ?? '';
        const timestamp = evt?.timestamp ?? evt?.data.timestamp ?? '';
        this.lastNumDoc.set(numDoc);
        this.errorCode.set(codeError);

        if (Array.isArray(payload)) {
          payload = payload.map((row: any) => ({
            ...row,
            url: pdfUrl,
            num_doc: numDoc,
            code_error: codeError,
            id_doc_drive: idDocDrive,
            tipo: tipo,
            timestamp: timestamp,
          }));
        } else if (payload && typeof payload === 'object') {
          payload = {
            ...(payload as any),
            url: pdfUrl,
            num_doc: numDoc,
            code_error: codeError,
            id_doc_drive: idDocDrive,
            tipo: tipo,
            nombre_factura: nombreFactura,
            timestamp: timestamp,
          };
        }
        if (!payload) return;

        console.log('[PAYLOAD]', payload);

        if (Array.isArray(payload)) {
          const mapped = payload.map((row: any, i: number) => {
            if (!row.url && pdfUrl) row.url = pdfUrl;
            return this.toUiItem(row as InvoiceRow, i + 1, this.invoiceTime);
          });
          this.invoices.set(mapped);
        } else {
          const row = payload as InvoiceRow;
          if (!row.url && pdfUrl) row.url = pdfUrl;

          const item = this.toUiItem(
            row,
            this.invoices().length + 1,
            this.invoiceTime,
          );
          this.upsertInvoice(item);

          this.totalInvoices.set(numDoc);
        }
      },
      error: (err) => console.error('WS error:', err),
    });
    this.loadTotalInvoices();
    this.getPendingInvoices();
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  getElapsedTime(createdAt: string): string {
    if (!createdAt) return '';

    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return '';

    const now = this.currentTime();
    const diffMs = now.getTime() - created.getTime();

    if (diffMs < 0) return 'Ahora';

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `Hace ${diffDays}d ${diffHours % 24}h`;
    }
    if (diffHours > 0) {
      return `Hace ${diffHours}h ${diffMinutes % 60}m`;
    }
    if (diffMinutes > 0) {
      return `Hace ${diffMinutes}m ${diffSeconds % 60}s`;
    }
    return `Hace ${diffSeconds}s`;
  }

  async getUserName(idUser: number | null | undefined): Promise<string> {
    if (idUser === null || idUser === undefined) return '';

    if (this.userNameCache.has(idUser)) {
      return this.userNameCache.get(idUser)!;
    }

    try {
      const response = await firstValueFrom(
        this.usersService.getUsername(idUser),
      );
      const userName =
        (response as any)?.username ||
        (response as any)?.nombre ||
        (response as any)?.name ||
        `Usuario ${idUser}`;
      this.userNameCache.set(idUser, userName);
      console.log('NOMBRE USUARIO', userName);
      return userName;
    } catch (err) {
      console.error('Error obteniendo nombre de usuario:', err);
      return `Usuario ${idUser}`;
    }
  }

  private isFilled(v: unknown) {
    if (typeof v === 'number') return true;
    return v !== null && v !== undefined && String(v).trim() !== '';
  }

  private isValidDate(fecha: string | null | undefined): boolean {
    if (!fecha || String(fecha).trim() === '') return false;

    const txt = String(fecha);

    // Formato DD/MM/YYYY
    const dmy = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return (
        date.getFullYear() === Number(y) &&
        date.getMonth() === Number(m) - 1 &&
        date.getDate() === Number(d)
      );
    }

    // Formato YYYY-MM-DD (ISO)
    const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, y, m, d] = iso;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return (
        date.getFullYear() === Number(y) &&
        date.getMonth() === Number(m) - 1 &&
        date.getDate() === Number(d)
      );
    }

    // Intentar parsear cualquier otro formato
    const ms = Date.parse(txt);
    return !isNaN(ms);
  }

  private toInputDate(fecha: string | null): string | null {
    if (!this.isFilled(fecha)) return null;
    const txt = String(fecha);
    const dmy = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m}-${d}`;
    }
    const iso = txt.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];

    const ms = Date.parse(txt);
    if (!isNaN(ms)) {
      const d = new Date(ms);
      const pad = (n: number) => `${n}`.padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return null;
  }

  private normalizeNumber(val: any): number | null {
    if (val === null || val === undefined || val === '') {
      return null;
    }

    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }

    if (typeof val === 'string') {
      let normalized = val.trim();
      const lastDot = normalized.lastIndexOf('.');
      const lastComma = normalized.lastIndexOf(',');

      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = normalized.replace(/,/g, '');
      }

      const numVal = parseFloat(normalized);
      return isNaN(numVal) ? null : numVal;
    }

    return null;
  }

  private patchRowOnlyFilled(row: InvoiceRow) {
    const partial: any = {};

    // Campos que deben ser numéricos
    const numericFields = [
      'base1',
      'iva1',
      'cuota1',
      'recargo1',
      'base2',
      'iva2',
      'cuota2',
      'recargo2',
      'base3',
      'iva3',
      'cuota3',
      'recargo3',
      'base_retencion',
      'porcentaje_retencion',
      'cuota_retencion',
      'importe_total',
      'num_apunte',
    ];

    (Object.keys(this.form.controls) as (keyof InvoiceRow)[]).forEach((k) => {
      const val = row[k];

      if (k === 'fecha') {
        const f = this.toInputDate(val as string | null);
        partial[k] = f;
        return;
      }

      if (numericFields.includes(k as string)) {
        partial[k] = this.normalizeNumber(val);
        return;
      }

      // Rellenar los campos
      partial[k] = val !== undefined ? val : null;
    });

    this.form.patchValue(partial, { emitEvent: false });
  }

  private toUiItem(
    row: InvoiceRow,
    fallbackIndex: number | string,
    entryTime?: string,
  ): UiInvoiceItem {
    const id = row.id_doc_drive;

    const fileName = row.nombre_factura ?? row.id_doc_drive;
    return {
      id,
      fileName,
      createdAt: row.fecha ?? new Date().toLocaleString(),
      entryTime: entryTime ?? row.timestamp ?? new Date().toISOString(),
      row: { ...row },
    };
  }

  async fetchAllInvoices(
    apiUrl: string,
    opts: { userId?: string },
  ): Promise<any[]> {
    // const params = new URLSearchParams();
    // if (opts.userId) params.set('user_id', opts.userId);
    // const url = `${apiUrl}/api/invoices${
    //   params.toString() ? `?${params.toString()}` : ''
    // }`;

    const plainText = await this.getInvoice('', '');
    console.log('TEXTO PLANO', plainText);

    // const res = await fetch(url, { headers: { Accept: 'application/json' } });
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await plainText;
  }

  async loadAll() {
    const userId = this.selectedUserId() ?? '0';
    try {
      const rows = await this.fetchAllInvoices(this.apiUrl, { userId });
      const items = rows.map((row: any, idx: number) =>
        this.toUiItem(row, row.id ?? idx + 1),
      );
      this.invoices.set(items);

      // Resolver nombres de usuario para cada factura
      items.forEach((item) => this.resolveUserName(item));

      if (this.selectedId()) {
        this.createIframe();
      }
    } catch (e) {
      console.error(e);
    }
  }
  open(inv: UiInvoiceItem) {
    const userId = this.selectedUserId() ?? '0';
    this.router.navigate(['/', 'facturas', inv.row.id_doc_drive]).then(() => {
      if (inv.row.error_code) this.loadErrorCodes(inv.row.error_code);
      console.log('[INV ROW]', inv.row);
    });
    document.body.style.overflow = 'hidden';
  }

  closeModal(): void {
    const userId = this.selectedUserId() ?? '0';
    document.body.style.overflow = '';
    this.router.navigate(['/', 'facturas']);
  }

  async saveDataAndSend() {
    const inv = this.selectedInvoice();
    if (!inv) return;
    const updated = this.form.getRawValue() as InvoiceRow;
    const options = {
      prefijo: updated.prefijo ?? null,
      numero_factura: updated.numero_factura ?? null,
      nombre_cliente: updated.nombre_cliente ?? null,
      nombre_proveedor: updated.nombre_proveedor ?? null,
      fecha: updated.fecha ?? null,
      nif_emision: updated.nif_emision,
      nif_receptor: updated.nif_receptor,
      cif_lateral: updated.cif_lateral,
      base1: updated.base1,
      iva1: updated.iva1,
      cuota1: updated.cuota1,
      recargo1: updated.recargo1,
      base2: updated.base2,
      iva2: updated.iva2,
      cuota2: updated.cuota2,
      recargo2: updated.recargo2,
      base3: updated.base3,
      iva3: updated.iva3,
      cuota3: updated.cuota3,
      recargo3: updated.recargo3,
      base_retencion: updated.base_retencion,
      porcentaje_retencion: updated.porcentaje_retencion,
      cuota_retencion: updated.cuota_retencion,
      importe_total: updated.importe_total,
      metodo_pago: updated.metodo_pago,
      valid: updated.valid,
      url: updated.url,
      corregido: updated.corregido ?? 1,
      cuenta_contable: updated.cuenta_contable,
      tipo: updated.tipo,
      longitud: updated.longitud,
      nombre_factura: updated.nombre_factura,
      num_apunte: updated.num_apunte,
      id_doc_drive: inv.row.id_doc_drive,
      timestamp: inv.row.timestamp,
      userId:
        inv.row.id_user ?? this.route.snapshot.paramMap.get('userId') ?? '',
      codEmpresa: inv.row.codigo_empresa,
    };

    this.validateErrors(options);

    if (this.errorCodes.length === 0) {
      console.log('Se puede enviar');
    } else {
      console.warn('Hay códigos con error');
      const errors = this.errorCodes.join(';');
      console.log('ERRORES;', errors);
      this.loadErrorCodes(errors);
      return;
    }
    try {
      await fetch(`${this.apiUrl}/api/invoices`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(options),
      });
      this.closeModal();
    } catch (err) {
      console.error('Error al hacer el método PUT', err);
    }

    this.sendData(options);
  }

  protected decryptPhpAes256Gcm(
    encryptedData: string,
    key: string,
  ): Promise<string | null> {
    return this.descrypt.decryptPhpAes256Gcm(encryptedData, key);
  }

  protected async getInvoice(
    client_id: string,
    invoice_id: string,
  ): Promise<any> {
    const params = new HttpParams()
      .set('action', 'invoice')
      .set('client_id', client_id)
      .set('invoice_id', invoice_id);

    try {
      const data = await firstValueFrom(
        this.http.get<{ invoice: any }>(this.realUrl, { params }),
      );

      if (data.invoice) {
        // console.log('dentro');
        const plainText = await this.decryptPhpAes256Gcm(
          data.invoice,
          this.key,
        );
        if (plainText) {
          // console.log('Decrypted invoice:', plainText);
          const parsed = JSON.parse(plainText);
          this.dataInvoice.set(parsed);
          return parsed;
        } else {
          console.error('Failed to decrypt the invoice data.');
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching invoice:', error);
      return null;
    }
  }

  compareResult(
    bases: number[],
    ivas: number[],
    recargos: number[],
    total: number | null,
  ): boolean {
    let baseTotal = 0;
    let ivaTotal = 0;
    let recargoTotal = 0;
    bases.map((result) => {
      baseTotal += Number(result);
      console.log(baseTotal);
    });
    ivas.map((result) => {
      ivaTotal += Number(result);
      console.log(ivaTotal);
    });
    recargos.map((result) => {
      recargoTotal += result;
      console.log(result);
    });
    const t = total ?? 0;
    return t === baseTotal + ivaTotal - recargoTotal;
  }

  validateErrors(options: any) {
    if (
      !this.compareResult(
        [options.base1 ?? 0, options.base2 ?? 0, options.base3 ?? 0],
        [options.cuota1 ?? 0, options.cuota2 ?? 0, options.cuota3 ?? 0],
        [options.recargo1 ?? 0, options.recargo2 ?? 0, options.recargo3 ?? 0],
        options.importe_total ?? 0,
      )
    ) {
      this.errorCodes.push('305');
    }
    if (!this.isValidDate(options.fecha)) {
      this.errorCodes.push('307');
    }
    if (
      !options.nif_emision ||
      options.nif_emision == '' ||
      options.nif_emision == null
    ) {
      this.errorCodes.push('308');
    }
    if (
      !options.nif_receptor ||
      options.nif_receptor == '' ||
      options.nif_receptor == null
    ) {
      this.errorCodes.push('309');
    }
    if (options.nif_emision == options.nif_receptor) {
      this.errorCodes.push('310');
    }
  }

  toggleShowAll(): void {
    this.showAll.update((v) => !v);
  }

  toggleUserFilter(userName: string): void {
    this.selectedUserFilters.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(userName)) {
        newSet.delete(userName);
      } else {
        newSet.add(userName);
      }
      return newSet;
    });
  }

  isUserSelected(userName: string): boolean {
    return this.selectedUserFilters().has(userName);
  }

  clearUserFilters(): void {
    this.selectedUserFilters.set(new Set());
  }

  onUserSelectChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (value === '') {
      this.clearUserFilters();
    } else {
      this.selectedUserFilters.set(new Set([value]));
    }
  }

  async loadErrorCodes(errorCode = '') {
    const codes = errorCode.split(';').filter((code) => code.trim() !== '');

    this.fields = this.resolver.resolve(codes);
    this.errorCodes = [];
  }

  async loadTotalInvoices() {
    const params = new URLSearchParams();
    const userId = this.selectedUserId() ?? 0;

    if (userId) params.set('user_id', userId);
    const url = `${this.apiUrl}/api/pages${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = await res.json();
      this.totalInvoices.set(Number(total) || 0);
    } catch (err) {
      console.error('Error cárgando facturas correctas: ', err);
    }
  }

  async sendData(options: any) {
    console.log('[OPCIONES]', options);

    const userId = this.route.snapshot.paramMap.get('userId') ?? '';
    const inv = this.selectedInvoice();
    const total = Number(this.totalInvoices() ?? 0);
    const qs = new URLSearchParams({
      timestamp: inv?.row.timestamp || '',
      file: options.nombre_factura,
      tipo: options.tipo,
      totalFiles: String(total),
      userId: String(inv?.row.id_user ?? ''),
    });

    const dataToSend = {
      ...options,
      timestamp: inv?.row.timestamp || '',
      id_user: options.userId,
      file: options.nombre_factura,
      tipo: options.tipo,
      totalFiles: String(total),
      status: 'completed',
      corregido: 1,
    };

    // save factura
    const url = this.api;
    this.getInvoice(dataToSend.id_user, inv?.row.id_doc_drive || '');
    try {
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

      const data = await resp.json();

      const contadorUrl =
        url +
        `contador?id_user=${dataToSend.userId}&timestamp=${dataToSend.timestamp}`;
      const response = await fetch(contadorUrl);
      const resContador = await response.json();
      console.log(resContador);
      this.counters.setCorrect(data?.currentCount);
    } catch (err) {
      console.error('Error', err);
      throw err;
    }
  }

  private upsertInvoice(next: UiInvoiceItem): void {
    const r: any = next.row;
    const normalizedId =
      r?.id_doc_drive && String(r.id_doc_drive).trim() !== ''
        ? String(r.id_doc_drive)
        : String(next.id ?? r?.numero_factura ?? r?.prefijo ?? Date.now());

    const normalizedFileName =
      r?.nombre_archivo && String(r.nombre_archivo).trim() !== ''
        ? String(r.nombre_archivo)
        : next.fileName;

    const normalized: UiInvoiceItem = {
      ...next,
      id: normalizedId,
      fileName: normalizedFileName,
    };

    this.invoices.update((list) => {
      const ix = list.findIndex((x) => String(x.id) === String(normalized.id));
      if (ix >= 0) {
        const copy = [...list];
        copy[ix] = { ...copy[ix], ...normalized, row: normalized.row };
        return copy;
      }
      return [normalized, ...list];
    });

    // Resolver nombre de usuario si viene id_user
    this.resolveUserName(normalized);

    const opened = this.selectedInvoice();
    if (opened && String(opened.id) === String(normalized.id)) {
      this.selectedInvoice.set({
        ...opened,
        ...normalized,
        row: normalized.row,
      });
      this.patchRowOnlyFilled?.(normalized.row);
    }
  }

  private async resolveUserName(item: UiInvoiceItem): Promise<void> {
    const idUser = item.row?.id_user;
    if (idUser === null || idUser === undefined) return;

    const userName = await this.getUserName(idUser);

    this.invoices.update((list) => {
      const ix = list.findIndex((x) => String(x.id) === String(item.id));
      if (ix >= 0) {
        const copy = [...list];
        copy[ix] = { ...copy[ix], userName };
        return copy;
      }
      return list;
    });
  }

  pdfUrl() {
    const raw = this.selectedInvoice()?.row?.url || '';
    if (!raw) return '';

    const m = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    const base = m ? `https://drive.google.com/file/d/${m[1]}/preview` : raw;

    const url = `${base}${
      base.includes('?') ? '&' : '?'
    }access_token=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`;
    return url;
  }

  createIframe() {
    const iframe =
      '<iframe src="' +
      this.pdfUrl() +
      '" allow="clipboard-write" width="640" height="480"></iframe>';
    this.iframe = this.sanitizer.bypassSecurityTrustHtml(iframe);
  }

  async getPendingInvoices() {
    try {
      const userId = this.selectedUserId() ?? 0;
      const res = await fetch(`${this.apiUrl}/api/count`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const invoice of data) {
        if (invoice.id_user != userId) {
          this.pending.set(invoice.pending);
        }
      }
    } catch (err) {
      console.error('Error', err);
    }
  }

  // Helper methods para manejar campos con control como array
  isControlArray(control: keyof InvoiceRow | (keyof InvoiceRow)[]): boolean {
    return Array.isArray(control);
  }

  asControlArray(
    control: keyof InvoiceRow | (keyof InvoiceRow)[],
  ): (keyof InvoiceRow)[] {
    return Array.isArray(control) ? control : [control];
  }

  compareInvoiceTimeWithNow(): {
    diffMs: number;
    diffSeconds: number;
    diffMinutes: number;
    isOlder: boolean;
  } {
    if (!this.invoiceTime) {
      return { diffMs: 0, diffSeconds: 0, diffMinutes: 0, isOlder: false };
    }

    const invoiceDate = new Date(this.invoiceTime);
    const now = new Date();

    const diffMs = now.getTime() - invoiceDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);

    return {
      diffMs,
      diffSeconds,
      diffMinutes,
      isOlder: diffMs > 0,
    };
  }

  getControlLabel(controlName: keyof InvoiceRow): string {
    // Mapeo de nombres de controles a etiquetas legibles
    const labelMap: Record<string, string> = {
      numero_factura: 'Número de Factura',
      nombre_factura: 'Nombre de Factura',
      nombre_cliente: 'Nombre Cliente',
      nombre_proveedor: 'Nombre Proveedor',
      fecha: 'Fecha',
      nif_emision: 'NIF Emisor',
      nif_receptor: 'NIF Receptor',
      cif_lateral: 'CIF Lateral',
      base1: 'Base 1',
      iva1: 'IVA 1',
      cuota1: 'Cuota 1',
      recargo1: 'Recargo 1',
      base2: 'Base 2',
      iva2: 'IVA 2',
      cuota2: 'Cuota 2',
      recargo2: 'Recargo 2',
      base3: 'Base 3',
      iva3: 'IVA 3',
      cuota3: 'Cuota 3',
      recargo3: 'Recargo 3',
      base_retencion: 'Base Retención',
      porcentaje_retencion: '% Retención',
      cuota_retencion: 'Cuota Retención',
      importe_total: 'Importe Total',
      metodo_pago: 'Método de Pago',
      prefijo: 'Prefijo',
      cuenta_contable: 'Cuenta Contable',
      num_apunte: 'Número de Asiento',
      longitud: 'Longitud',
      tipo: 'Tipo',
    };

    return labelMap[controlName as string] || String(controlName);
  }

  async discardInvoice() {
    console.log('Descartando la factura:', this.selectedInvoice()?.fileName);
    const invoiceRow = this.selectedInvoice()?.row;
    const options = {
      id_doc_drive: invoiceRow?.id_doc_drive,
      timestamp: invoiceRow?.timestamp,
    };
    try {
      await fetch(`${this.apiUrl}/api/discard`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(options),
      });
      this.sendDiscardedInvoice();
      this.closeModal();
    } catch (err) {
      console.error('Error al hacer el método PUT', err);
    }
  }
  async sendDiscardedInvoice() {
    const inv = this.selectedInvoice();
    if (!inv) return;
    const updated = this.form.getRawValue() as InvoiceRow;
    const options = {
      prefijo: updated.prefijo ?? null,
      numero_factura: updated.numero_factura ?? null,
      nombre_cliente: updated.nombre_cliente ?? null,
      nombre_proveedor: updated.nombre_proveedor ?? null,
      fecha: updated.fecha ?? null,
      nif_emision: updated.nif_emision,
      nif_receptor: updated.nif_receptor,
      cif_lateral: updated.cif_lateral,
      base1: updated.base1,
      iva1: updated.iva1,
      cuota1: updated.cuota1,
      recargo1: updated.recargo1,
      base2: updated.base2,
      iva2: updated.iva2,
      cuota2: updated.cuota2,
      recargo2: updated.recargo2,
      base3: updated.base3,
      iva3: updated.iva3,
      cuota3: updated.cuota3,
      recargo3: updated.recargo3,
      base_retencion: updated.base_retencion,
      porcentaje_retencion: updated.porcentaje_retencion,
      cuota_retencion: updated.cuota_retencion,
      importe_total: updated.importe_total,
      metodo_pago: updated.metodo_pago,
      valid: updated.valid,
      url: updated.url,
      corregido: '-1',
      cuenta_contable: updated.cuenta_contable,
      tipo: updated.tipo,
      longitud: updated.longitud,
      nombre_factura: updated.nombre_factura,
      num_apunte: updated.num_apunte,
      id_doc_drive: inv.row.id_doc_drive,
      timestamp: inv.row.timestamp,
      userId: this.route.snapshot.paramMap.get('userId') ?? '',
      codEmpresa: inv.row.codigo_empresa,
    };
    const userId = this.route.snapshot.paramMap.get('userId') ?? '';
    const total = Number(this.totalInvoices() ?? 0);

    const dataToSend = {
      ...options,
      timestamp: inv?.row.timestamp || '',
      userId: userId,
      file: options.nombre_factura,
      tipo: options.tipo,
      totalFiles: String(total),
    };

    const url = `https://demo99.esphera.ai/ws/n8n/getCuentaContable.php`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataToSend,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Error HTTP: ${resp.status}`);
      }

      const data = await resp.json();
      this.counters.setCorrect(data?.currentCount);
    } catch (err) {
      console.error('Error', err);
      throw err;
    }
  }
}
