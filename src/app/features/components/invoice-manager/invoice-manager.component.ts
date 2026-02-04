import {
  Component,
  computed,
  effect,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { PdfViewerModule } from 'ng2-pdf-viewer';

import { InvoiceRow } from '../../../models/invoice.models';
import { DynamicFields } from '../../../models/dynamic-fields.types';
import { DynamicFieldResolverService } from '../../../shared/resolvers/dynamic-field-resolver.service';
import { CounterService } from '../../../core/stores/counter.service';
import { UsersService } from '../../../services/users.service';
import { WebSocketService } from '../web-socket-service/web-socket-service.component';

import { InvoiceApiService } from './invoice-api.service';
import { InvoiceFormService } from './invoice-form.service';
import {
  UiInvoiceItem,
  toUiItem,
  getElapsedTime,
  compareTimeWithNow,
  getControlLabel,
  normalizeInvoiceId,
  normalizeFileName,
} from './invoice.utils';

interface RealTimeData {
  value: number;
  timestamp: number | string;
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

  // Services
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly resolver = inject(DynamicFieldResolverService);
  private readonly usersService = inject(UsersService);
  private readonly counters = inject(CounterService);
  private readonly wsService = inject(WebSocketService);
  private readonly invoiceApi = inject(InvoiceApiService);
  private readonly invoiceFormService = inject(InvoiceFormService);

  // Private state
  private readonly paramMapSig = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly lastPatchedId = signal<string | null>(null);
  private readonly userNameCache = new Map<number, string>();
  private invoiceTime = '';
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private subscription!: Subscription;

  // Public state
  protected readonly title = signal('esphera-test');
  protected dataInvoice = signal<any>(null);

  currentTime = signal<Date>(new Date());
  lastNumDoc = signal<number | null>(null);
  iframe: SafeHtml = '';

  // UI state
  showAll = signal(false);
  selectedUserFilters = signal<Set<string>>(new Set());
  pdfZoom = signal(1);
  leftPanelWidth = signal(50);
  rightPanelWidth = signal(50);
  private isResizing = false;

  // Invoice state
  invoices = signal<UiInvoiceItem[]>([]);
  tipo = signal<string | null>('');
  pending = signal<number>(0);
  errorCode = signal('');
  fields: DynamicFields<keyof InvoiceRow>[] = [];

  selectedId = signal<string | null>(null);
  selectedUserId = signal<string | null>(null);
  selectedInvoice = signal<UiInvoiceItem | null>(null);

  // Form
  form = this.invoiceFormService.createForm();

  // Computed
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

  get correctInvoices() {
    return this.counters.correctInvoices;
  }

  get totalInvoices() {
    return this.counters.totalInvoices;
  }

  // WebSocket data
  public ultimoValor: number | null = null;
  public datosRecibidos: RealTimeData[] = [];

  constructor() {
    this.setupRouteEffect();
  }

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId');
    this.selectedUserId.set(userId);

    this.startTimer();
    this.loadAll();
    this.setupWebSocketSubscription();
    this.loadTotalInvoices();
    this.getPendingInvoices();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.subscription?.unsubscribe();
  }

  // ==================== PUBLIC METHODS ====================

  getElapsedTime(createdAt: string): string {
    return getElapsedTime(createdAt, this.currentTime());
  }

  getControlLabel(controlName: keyof InvoiceRow): string {
    return getControlLabel(controlName);
  }

  open(inv: UiInvoiceItem): void {
    this.router.navigate(['/', 'facturas', inv.row.id_doc_drive]).then(() => {
      if (inv.row.error_code) this.loadErrorCodes(inv.row.error_code);
    });
    document.body.style.overflow = 'hidden';
  }

  closeModal(): void {
    document.body.style.overflow = '';
    this.router.navigate(['/', 'facturas']);
  }

  toggleShowAll(): void {
    this.showAll.update((v) => !v);
  }

  zoomIn(): void {
    this.pdfZoom.update((z) => Math.min(z + 0.25, 3));
  }

  zoomOut(): void {
    this.pdfZoom.update((z) => Math.max(z - 0.25, 0.5));
  }

  resetZoom(): void {
    this.pdfZoom.set(1);
  }

  startResize(event: MouseEvent | TouchEvent): void {
    this.isResizing = true;
    event.preventDefault();

    const moveHandler = (e: MouseEvent | TouchEvent) => {
      if (!this.isResizing) return;

      const container = document.querySelector(
        '.modal-revision-body',
      ) as HTMLElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const clientX =
        e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const percentage =
        ((clientX - containerRect.left) / containerRect.width) * 100;

      const clampedPercentage = Math.max(25, Math.min(75, percentage));
      this.leftPanelWidth.set(clampedPercentage);
      this.rightPanelWidth.set(100 - clampedPercentage);
    };

    const upHandler = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', upHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    document.addEventListener('touchmove', moveHandler);
    document.addEventListener('touchend', upHandler);
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

  isControlArray(control: keyof InvoiceRow | (keyof InvoiceRow)[]): boolean {
    return Array.isArray(control);
  }

  asControlArray(
    control: keyof InvoiceRow | (keyof InvoiceRow)[],
  ): (keyof InvoiceRow)[] {
    return Array.isArray(control) ? control : [control];
  }

  hasFieldError(controlName: string): boolean {
    return this.fields.some((f) => {
      if (Array.isArray(f.control)) {
        return f.control.includes(controlName as keyof InvoiceRow);
      }
      return f.control === controlName;
    });
  }

  pdfUrl(): string {
    const raw = this.selectedInvoice()?.row?.url || '';
    if (!raw) return '';

    const m = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    const base = m ? `https://drive.google.com/file/d/${m[1]}/preview` : raw;

    return `${base}${base.includes('?') ? '&' : '?'}access_token=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`;
  }

  // ==================== SAVE & DISCARD ====================

  async saveDataAndSend(): Promise<void> {
    const inv = this.selectedInvoice();
    if (!inv) return;

    const updated = this.form.getRawValue() as InvoiceRow;
    const userId = this.route.snapshot.paramMap.get('userId') ?? '';
    const options = this.invoiceFormService.buildSaveOptions(
      updated,
      inv.row,
      userId,
    );

    const errorCodes = this.invoiceFormService.validateInvoice(options);

    if (errorCodes.length > 0) {
      console.warn('Hay códigos con error');
      this.loadErrorCodes(errorCodes.join(';'));
      console.warn('Errores: ', errorCodes);
      return;
    }

    this.invoiceApi
      .getCorregidoStatus(inv.row.timestamp || '', inv.row.id_user || 0)
      .subscribe({
        next: async (resp: any) => {
          console.log('GET INVOICE CORREGIDO STATUS: ', resp);
          if (resp.data[0].corregido === 0) {
            await this.invoiceApi.updateInvoice(options);
            this.closeModal();

            const total = Number(this.totalInvoices() ?? 0);
            const data = await this.invoiceApi.sendInvoiceData(options, total);
            await this.invoiceApi.getContador(
              String(options.userId),
              options.timestamp,
            );
            this.counters.setCorrect(data?.currentCount);
          } else {
            console.log('FACTURA YA CORREGIDA');
            (
              await this.invoiceApi.updateCorregidoStatus(inv.row.id_doc_drive)
            ).subscribe({
              next: async (data: any) => {
                console.log('FACTURA MODIFICADA: ', data.id_doc_drive);
              },
            });
            this.closeModal();
          }
        },
      });
  }

  async discardInvoice(): Promise<void> {
    const inv = this.selectedInvoice();
    if (!inv?.row) return;

    this.invoiceApi
      .getCorregidoStatus(inv.row.timestamp || '', inv.row.id_user || 0)
      .subscribe({
        next: async (resp: any) => {
          if (resp.data[0].corregido === 0) {
            await this.invoiceApi.discardInvoice(
              inv.row.id_doc_drive,
              inv.row.timestamp ?? '',
            );

            const updated = this.form.getRawValue() as InvoiceRow;
            const userId = this.route.snapshot.paramMap.get('userId') ?? '';
            const options = {
              ...this.invoiceFormService.buildSaveOptions(
                updated,
                inv.row,
                userId,
              ),
              corregido: '-1',
              status: 'warning',
            };

            const total = Number(this.totalInvoices() ?? 0);
            const data = await this.invoiceApi.sendDiscardedInvoiceData(
              options,
              total,
            );
            this.invoiceApi.discardUserInvoice(inv.row.id_user || 0, options);

            this.counters.setCorrect(data?.currentCount);

            this.closeModal();
          } else {
            console.log('FACTURA YA CORREGIDA');
            (
              await this.invoiceApi.updateCorregidoStatus(inv.row.id_doc_drive)
            ).subscribe({
              next: async (data: any) => {
                console.log('FACTURA MODIFICADA: ', data.id_doc_drive);
              },
            });
            this.closeModal();
          }
        },
      });
  }

  // ==================== PRIVATE METHODS ====================

  private setupRouteEffect(): void {
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
        this.invoiceFormService.patchRowOnlyFilled(this.form, current.row);
        this.lastPatchedId.set(String(current.id));
      }
    });
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  private setupWebSocketSubscription(): void {
    this.subscription = this.wsService.messages$.subscribe({
      next: (evt: any) => this.handleWebSocketMessage(evt),
      error: (err) => console.error('WS error:', err),
    });
  }

  private handleWebSocketMessage(evt: any): void {
    let payload = evt?.data ?? evt?.value ?? evt ?? null;

    this.invoiceTime = new Date().toISOString();
    const comparison = compareTimeWithNow(this.invoiceTime);
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
    const timestamp = evt?.timestamp ?? evt?.data?.timestamp ?? '';

    this.lastNumDoc.set(numDoc);
    this.errorCode.set(codeError);

    if (Array.isArray(payload)) {
      payload = payload.map((row: any) => ({
        ...row,
        url: pdfUrl,
        num_doc: numDoc,
        code_error: codeError,
        id_doc_drive: idDocDrive,
        tipo,
        timestamp,
      }));
    } else if (payload && typeof payload === 'object') {
      payload = {
        ...(payload as any),
        url: pdfUrl,
        num_doc: numDoc,
        code_error: codeError,
        id_doc_drive: idDocDrive,
        tipo,
        nombre_factura: nombreFactura,
        timestamp,
      };
    }

    if (!payload) return;

    if (Array.isArray(payload)) {
      const mapped = payload.map((row: any, i: number) => {
        if (!row.url && pdfUrl) row.url = pdfUrl;
        return toUiItem(row as InvoiceRow, i + 1, this.invoiceTime);
      });
      this.invoices.set(mapped);
    } else {
      const row = payload as InvoiceRow;
      if (!row.url && pdfUrl) row.url = pdfUrl;

      const item = toUiItem(row, this.invoices().length + 1, this.invoiceTime);
      this.upsertInvoice(item);
      this.totalInvoices.set(numDoc);
    }
  }

  private async loadAll(): Promise<void> {
    const userId = this.selectedUserId() ?? '0';
    try {
      const rows = await this.invoiceApi.fetchAllInvoices(userId);
      const items = rows.map((row: any, idx: number) =>
        toUiItem(row, row.id ?? idx + 1),
      );
      this.invoices.set(items);

      items.forEach((item) => this.resolveUserName(item));

      if (this.selectedId()) {
        this.createIframe();
      }
    } catch (e) {
      console.error(e);
    }
  }

  private async loadTotalInvoices(): Promise<void> {
    const userId = this.selectedUserId() ?? 0;
    const total = await this.invoiceApi.loadTotalInvoices(userId);
    this.totalInvoices.set(total);
  }

  private async getPendingInvoices(): Promise<void> {
    const userId = this.selectedUserId() ?? 0;
    const data = await this.invoiceApi.getPendingInvoices();
    for (const invoice of data) {
      if (invoice.id_user != userId) {
        this.pending.set(invoice.pending);
      }
    }
  }

  private loadErrorCodes(errorCode = ''): void {
    const codes = errorCode.split(';').filter((code) => code.trim() !== '');
    this.fields = this.resolver.resolve(codes);
  }

  private createIframe(): void {
    const iframeHtml = `<iframe src="${this.pdfUrl()}" allow="clipboard-write" width="640" height="480"></iframe>`;
    this.iframe = this.sanitizer.bypassSecurityTrustHtml(iframeHtml);
  }

  private upsertInvoice(next: UiInvoiceItem): void {
    const normalizedId = normalizeInvoiceId(next);
    const normalizedFileName = normalizeFileName(next);

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

    this.resolveUserName(normalized);

    const opened = this.selectedInvoice();
    if (opened && String(opened.id) === String(normalized.id)) {
      this.selectedInvoice.set({
        ...opened,
        ...normalized,
        row: normalized.row,
      });
      this.invoiceFormService.patchRowOnlyFilled(this.form, normalized.row);
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

  private async getUserName(idUser: number): Promise<string> {
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
      return userName;
    } catch {
      return `Usuario ${idUser}`;
    }
  }
}
