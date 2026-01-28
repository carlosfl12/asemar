import { InvoiceRow } from '../../../models/invoice.models';

export interface UiInvoiceItem {
  id: number | string;
  fileName: string;
  createdAt: string;
  entryTime: string;
  row: InvoiceRow;
  userName?: string;
}

export interface TimeComparison {
  diffMs: number;
  diffSeconds: number;
  diffMinutes: number;
  isOlder: boolean;
}

// ==================== DATE UTILS ====================

export function isValidDate(fecha: string | null | undefined): boolean {
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

  const ms = Date.parse(txt);
  return !isNaN(ms);
}

export function toInputDate(fecha: string | null): string | null {
  if (!isFilled(fecha)) return null;
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

export function getElapsedTime(createdAt: string, now: Date): string {
  if (!createdAt) return '';

  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return '';

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

export function compareTimeWithNow(invoiceTime: string): TimeComparison {
  if (!invoiceTime) {
    return { diffMs: 0, diffSeconds: 0, diffMinutes: 0, isOlder: false };
  }

  const invoiceDate = new Date(invoiceTime);
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

// ==================== NUMBER UTILS ====================

export function isFilled(v: unknown): boolean {
  if (typeof v === 'number') return true;
  return v !== null && v !== undefined && String(v).trim() !== '';
}

export function normalizeNumber(val: unknown): number | null {
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

// ==================== INVOICE MAPPERS ====================

export function toUiItem(
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

export function normalizeInvoiceId(item: UiInvoiceItem): string {
  const r: any = item.row;
  return r?.id_doc_drive && String(r.id_doc_drive).trim() !== ''
    ? String(r.id_doc_drive)
    : String(item.id ?? r?.numero_factura ?? r?.prefijo ?? Date.now());
}

export function normalizeFileName(item: UiInvoiceItem): string {
  const r: any = item.row;
  return r?.nombre_archivo && String(r.nombre_archivo).trim() !== ''
    ? String(r.nombre_archivo)
    : item.fileName;
}

// ==================== LABEL MAPPER ====================

const CONTROL_LABELS: Record<string, string> = {
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

export function getControlLabel(controlName: string): string {
  return CONTROL_LABELS[controlName] || controlName;
}
