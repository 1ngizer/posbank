import {
  AccountingProvider,
  AlegraCredentials,
  SyncInvoiceInput,
  SyncMovementInput,
  SyncPayableInput,
  SyncReceivableInput,
  SyncResult,
} from '../types';
import { AlegraClient } from './alegra.client';

export class AlegraProvider implements AccountingProvider {
  readonly providerName = 'alegra' as const;
  private readonly client: AlegraClient;

  constructor(credentials: AlegraCredentials) {
    this.client = new AlegraClient(credentials);
  }

  async testConnection(): Promise<boolean> {
    try {
      return await this.client.testAuth();
    } catch {
      return false;
    }
  }

  async syncInvoice(invoice: SyncInvoiceInput): Promise<SyncResult> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const invoiceDate = invoice.date ? invoice.date.slice(0, 10) : today;

      const payload = {
        date: invoiceDate,
        dueDate: invoiceDate,
        client: {
          name: invoice.customerName || 'Cliente General',
        },
        items: invoice.items.map((item) => ({
          name: item.description,
          price: item.unitPrice,
          quantity: item.quantity,
          tax: item.taxRate ? [{ id: 1, percentage: item.taxRate }] : [],
        })),
        anotation: `Factura POS emitida desde PosBank (${invoice.number || invoice.id})`,
      };

      const res = await this.client.createInvoice(payload);
      return {
        success: true,
        externalId: String(res?.id ?? ''),
        data: res,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async syncReceivable(receivable: SyncReceivableInput): Promise<SyncResult> {
    try {
      const payload = {
        date: receivable.issuedDate || new Date().toISOString().slice(0, 10),
        dueDate: receivable.dueDate,
        client: {
          name: receivable.clientName,
          identification: receivable.clientId || undefined,
        },
        items: [
          {
            name: 'Cuenta por Cobrar (PosBank)',
            price: receivable.amount,
            quantity: 1,
          },
        ],
        anotation: `Cartera registrada en PosBank (ID: ${receivable.id})`,
      };

      const res = await this.client.createInvoice(payload);
      return {
        success: true,
        externalId: String(res?.id ?? ''),
        data: res,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async syncPayable(payable: SyncPayableInput): Promise<SyncResult> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        date: today,
        dueDate: payable.dueDate,
        provider: {
          name: payable.supplierName,
          identification: payable.supplierId || undefined,
        },
        items: [
          {
            name: payable.notes || 'Cuenta por Pagar (PosBank)',
            price: payable.amount,
            quantity: 1,
          },
        ],
        anotation: `Cuenta por pagar registrada en PosBank (ID: ${payable.id})`,
      };

      const res = await this.client.createBill(payload);
      return {
        success: true,
        externalId: String(res?.id ?? ''),
        data: res,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async syncMovement(movement: SyncMovementInput): Promise<SyncResult> {
    try {
      const isIncome = movement.type === 'income';
      const payload = {
        date: movement.date || new Date().toISOString().slice(0, 10),
        type: isIncome ? 'in' : 'out',
        paymentMethod: 'cash',
        amount: movement.amount,
        anotation: `[${movement.category}] ${movement.description || 'Movimiento de caja PosBank'}`,
      };

      const res = await this.client.createPayment(payload);
      return {
        success: true,
        externalId: String(res?.id ?? ''),
        data: res,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
