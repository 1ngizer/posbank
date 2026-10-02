export type AccountingProviderType = 'alegra' | 'siigo' | 'worldoffice';

export type AccountingSyncEntity = 'invoice' | 'receivable' | 'payable' | 'cash_movement';

export type AccountingSyncStatus = 'pending' | 'synced' | 'failed';

export interface AlegraCredentials {
  email: string;
  token: string;
}

export interface SiigoCredentials {
  username: string;
  accessKey: string;
}

export interface WorldOfficeCredentials {
  token: string;
}

export type AccountingCredentials =
  | { provider: 'alegra'; credentials: AlegraCredentials }
  | { provider: 'siigo'; credentials: SiigoCredentials }
  | { provider: 'worldoffice'; credentials: WorldOfficeCredentials };

export interface SyncInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
  productId?: string | null;
}

export interface SyncInvoiceInput {
  id: string;
  number?: string | null;
  customerName?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  items: SyncInvoiceItem[];
  date?: string;
}

export interface SyncReceivableInput {
  id: string;
  clientName: string;
  clientId?: string | null;
  amount: number;
  dueDate: string;
  issuedDate: string;
  status: string;
}

export interface SyncPayableInput {
  id: string;
  supplierName: string;
  supplierId?: string | null;
  amount: number;
  dueDate: string;
  notes?: string | null;
}

export interface SyncMovementInput {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
}

export interface SyncResult {
  success: boolean;
  externalId?: string;
  error?: string;
  data?: any;
}

export interface ConnectionStatusResponse {
  connected: boolean;
  provider: AccountingProviderType | null;
  status: 'connected' | 'disconnected' | 'error' | 'not_configured';
  lastSyncAt: string | null;
  emailMasked?: string;
}

export interface AccountingProvider {
  readonly providerName: AccountingProviderType;
  testConnection(): Promise<boolean>;
  syncInvoice(invoice: SyncInvoiceInput): Promise<SyncResult>;
  syncReceivable(receivable: SyncReceivableInput): Promise<SyncResult>;
  syncPayable(payable: SyncPayableInput): Promise<SyncResult>;
  syncMovement(movement: SyncMovementInput): Promise<SyncResult>;
}
