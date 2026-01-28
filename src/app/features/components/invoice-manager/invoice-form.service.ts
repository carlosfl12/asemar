import { inject, Injectable } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { InvoiceRow } from '../../../models/invoice.models';
import { toInputDate, normalizeNumber, isValidDate } from './invoice.utils';

export type InvoiceFormGroup = FormGroup<{
  numero_factura: ReturnType<FormBuilder['control']>;
  nombre_factura: ReturnType<FormBuilder['control']>;
  nombre_cliente: ReturnType<FormBuilder['control']>;
  nombre_proveedor: ReturnType<FormBuilder['control']>;
  fecha: ReturnType<FormBuilder['control']>;
  nif_emision: ReturnType<FormBuilder['control']>;
  nif_receptor: ReturnType<FormBuilder['control']>;
  cif_lateral: ReturnType<FormBuilder['control']>;
  base1: ReturnType<FormBuilder['control']>;
  iva1: ReturnType<FormBuilder['control']>;
  cuota1: ReturnType<FormBuilder['control']>;
  recargo1: ReturnType<FormBuilder['control']>;
  base2: ReturnType<FormBuilder['control']>;
  iva2: ReturnType<FormBuilder['control']>;
  cuota2: ReturnType<FormBuilder['control']>;
  recargo2: ReturnType<FormBuilder['control']>;
  base3: ReturnType<FormBuilder['control']>;
  iva3: ReturnType<FormBuilder['control']>;
  cuota3: ReturnType<FormBuilder['control']>;
  recargo3: ReturnType<FormBuilder['control']>;
  base_retencion: ReturnType<FormBuilder['control']>;
  porcentaje_retencion: ReturnType<FormBuilder['control']>;
  cuota_retencion: ReturnType<FormBuilder['control']>;
  tipo: ReturnType<FormBuilder['control']>;
  importe_total: ReturnType<FormBuilder['control']>;
  metodo_pago: ReturnType<FormBuilder['control']>;
  prefijo: ReturnType<FormBuilder['control']>;
  num_apunte: ReturnType<FormBuilder['control']>;
  longitud: ReturnType<FormBuilder['control']>;
  valid: ReturnType<FormBuilder['control']>;
  url: ReturnType<FormBuilder['control']>;
  corregido: ReturnType<FormBuilder['control']>;
}>;

const NUMERIC_FIELDS = [
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

@Injectable({
  providedIn: 'root',
})
export class InvoiceFormService {
  private readonly fb = inject(FormBuilder);

  createForm(): InvoiceFormGroup {
    return this.fb.nonNullable.group({
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
      num_apunte: this.fb.control<number | null>(0),
      longitud: this.fb.control<string | null>(null),

      valid: this.fb.control<boolean>(false),
      url: this.fb.control<string | null>(null),
      corregido: this.fb.control<number | null>(1),
    }) as InvoiceFormGroup;
  }

  patchRowOnlyFilled(form: InvoiceFormGroup, row: InvoiceRow): void {
    const partial: any = {};

    Object.keys(form.controls).forEach((k) => {
      const key = k as keyof InvoiceRow;
      const val = row[key];

      if (k === 'fecha') {
        partial[k] = toInputDate(val as string | null);
        return;
      }

      if (NUMERIC_FIELDS.includes(k)) {
        partial[k] = normalizeNumber(val);
        return;
      }

      partial[k] = val !== undefined ? val : null;
    });

    form.patchValue(partial, { emitEvent: false });
  }

  validateInvoice(options: any): string[] {
    const errorCodes: string[] = [];

    if (!this.compareResult(
      [options.base1 ?? 0, options.base2 ?? 0, options.base3 ?? 0],
      [options.cuota1 ?? 0, options.cuota2 ?? 0, options.cuota3 ?? 0],
      [options.recargo1 ?? 0, options.recargo2 ?? 0, options.recargo3 ?? 0],
      options.importe_total ?? 0,
    )) {
      errorCodes.push('305');
    }

    if (!isValidDate(options.fecha)) {
      errorCodes.push('307');
    }

    if (!options.nif_emision || options.nif_emision === '' || options.nif_emision === null) {
      errorCodes.push('308');
    }

    if (!options.nif_receptor || options.nif_receptor === '' || options.nif_receptor === null) {
      errorCodes.push('309');
    }

    if (options.nif_emision === options.nif_receptor) {
      errorCodes.push('310');
    }

    return errorCodes;
  }

  private compareResult(
    bases: number[],
    ivas: number[],
    recargos: number[],
    total: number | null,
  ): boolean {
    const baseTotal = bases.reduce((acc, val) => acc + Number(val), 0);
    const ivaTotal = ivas.reduce((acc, val) => acc + Number(val), 0);
    const recargoTotal = recargos.reduce((acc, val) => acc + Number(val), 0);
    const t = total ?? 0;

    return t === baseTotal + ivaTotal - recargoTotal;
  }

  buildSaveOptions(formValue: InvoiceRow, invoiceRow: InvoiceRow, userId: string): any {
    return {
      prefijo: formValue.prefijo ?? null,
      numero_factura: formValue.numero_factura ?? null,
      nombre_cliente: formValue.nombre_cliente ?? null,
      nombre_proveedor: formValue.nombre_proveedor ?? null,
      fecha: formValue.fecha ?? null,
      nif_emision: formValue.nif_emision,
      nif_receptor: formValue.nif_receptor,
      cif_lateral: formValue.cif_lateral,
      base1: formValue.base1,
      iva1: formValue.iva1,
      cuota1: formValue.cuota1,
      recargo1: formValue.recargo1,
      base2: formValue.base2,
      iva2: formValue.iva2,
      cuota2: formValue.cuota2,
      recargo2: formValue.recargo2,
      base3: formValue.base3,
      iva3: formValue.iva3,
      cuota3: formValue.cuota3,
      recargo3: formValue.recargo3,
      base_retencion: formValue.base_retencion,
      porcentaje_retencion: formValue.porcentaje_retencion,
      cuota_retencion: formValue.cuota_retencion,
      importe_total: formValue.importe_total,
      metodo_pago: formValue.metodo_pago,
      valid: formValue.valid,
      url: formValue.url,
      corregido: formValue.corregido ?? 1,
      cuenta_contable: formValue.cuenta_contable,
      tipo: formValue.tipo,
      longitud: formValue.longitud,
      nombre_factura: formValue.nombre_factura,
      num_apunte: formValue.num_apunte,
      id_doc_drive: invoiceRow.id_doc_drive,
      timestamp: invoiceRow.timestamp,
      userId: invoiceRow.id_user ?? userId,
      codEmpresa: invoiceRow.codigo_empresa,
    };
  }
}
