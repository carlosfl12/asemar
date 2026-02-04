import { Injectable } from '@angular/core';
import { DynamicFields } from '../../models/dynamic-fields.types';
import { InvoiceRow } from '../../models/invoice.models';

@Injectable({
  providedIn: 'root',
})
export class DynamicFieldResolverService {
  private readonly CATALOG: Record<string, DynamicFields<keyof InvoiceRow>> = {
    '301': {
      key: '301',
      label: 'IVA-1',
      control: 'iva1',
      type: 'number',
      placeholder: 'Entrada vacía',
    },
    '302': {
      key: '302',
      label: 'Asiento',
      control: 'num_apunte',
      type: 'number',
      step: '0.01',
      placeholder: 'Sin número de asiento',
    },
    '303': {
      key: '303',
      label: 'Longitud',
      control: 'longitud',
      type: 'text',
      placeholder: 'Algún campo excede la longitud',
    },
    '304': {
      key: '304',
      label: 'No se ha podido asignar número de cuenta',
      control: ['nif_emision', 'nif_receptor'],
      type: 'text',
      placeholder: 'NIF vacío',
    },
    '305': {
      key: '305',
      label: 'Importe Total (€)',
      control: [
        'importe_total',
        'base1',
        'cuota1',
        'base2',
        'cuota2',
        'base3',
        'cuota3',
        'recargo1',
        'recargo2',
        'recargo3',
      ],
      type: 'number',
      placeholder: 'El total no coincide con la suma de bases e IVA',
    },
    '306': {
      key: '306',
      label: 'Tipo factura',
      control: 'tipo',
      type: 'text',
      placeholder: 'Esta no es una factura de compra',
    },
    '307': {
      key: '307',
      label: 'Fecha',
      control: 'fecha',
      type: 'date',
      placeholder: 'La fecha no está en el formato correcto',
    },
    '308': {
      key: '308',
      label: 'NIF Emisor',
      control: 'nif_emision',
      type: 'text',
      placeholder: 'No existe NIF del emisor',
    },
    '309': {
      key: '309',
      label: 'NIF Receptor',
      control: 'nif_receptor',
      type: 'text',
      placeholder: 'No existe NIF del receptor',
    },
    '310': {
      key: '310',
      label: 'NIF Emisor y Receptor iguales',
      control: ['nif_receptor', 'nif_emision'],
      type: 'text',
      placeholder: 'El nif del emisor y del receptor es el mismo',
    },
    '311': {
      key: '311',
      label: 'No existe número de factura',
      control: 'numero_factura',
      type: 'text',
      placeholder: 'No existe número de factura',
    },
  };
  resolve(
    codes: Array<Number | string>,
    labelOverride?: Record<string, string>,
  ): DynamicFields<keyof InvoiceRow>[] {
    const out: DynamicFields<keyof InvoiceRow>[] = [];

    for (const raw of codes ?? []) {
      const code = String(raw);
      const base = this.CATALOG[code];
      if (!base) {
        const reason = `Código ${code} no está mapeado`;
        out.push({
          key: code,
          label: `Código ${code} desconocido`,
          control: `error_${code}` as unknown as keyof InvoiceRow,
          type: 'text',
          placeholder: reason,
        });
        continue;
      }
      const label = (labelOverride?.[code] ?? base.label).trim();
      out.push({ ...base, label });
    }
    return out;
  }
}
