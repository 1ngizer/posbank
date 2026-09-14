/**
 * Tipos y enums de dominio de PosBank. Fuente única de verdad para los estados
 * que produce el CashEngine y consume el AlertEngine.
 */

// ─── Enums de datos ────────────────────────────────────────────────
export type MovementType = 'income' | 'expense';
export type MovementCategory =
  | 'sales'
  | 'payroll'
  | 'suppliers'
  | 'taxes'
  | 'rent'
  | 'utilities'
  | 'other';
export type SourceChannel = 'app' | 'whatsapp' | 'alexa' | 'api' | 'bank_import';
export type UserRole = 'owner' | 'manager' | 'accountant' | 'cashier';
export type ReceivableStatus = 'pending' | 'overdue' | 'partial' | 'paid';
export type PayableStatus = 'pending' | 'overdue' | 'paid';
export type CommitmentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

// ─── Estados que calcula el CashEngine ─────────────────────────────
export type CashPositionState = 'surplus' | 'sufficient' | 'tight' | 'deficit';
export type SalesState = 'exceeds' | 'on_target' | 'at_risk' | 'critical';
export type CostsState = 'efficient' | 'on_budget' | 'review' | 'deviated';
export type CollectionState = 'healthy' | 'overdue' | 'no_policy';
export type PaymentState = 'on_time' | 'early_no_discount' | 'no_policy';
export type RunwayState = 'solid' | 'stable' | 'alert' | 'emergency';

// ─── Alertas ───────────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'opportunity';
export type AlertCategory =
  | 'cash_position'
  | 'sales'
  | 'costs'
  | 'collection'
  | 'payment'
  | 'runway'
  | 'budget';
export type AlertChannel = 'whatsapp' | 'alexa' | 'app' | 'email';
export type AlertStatus = 'sent' | 'read' | 'acted_on' | 'dismissed';

// ─── Resultado del CashEngine ──────────────────────────────────────
export interface CashPositionAnalysis {
  totalAvailable: number; // banco + caja física
  bankBalance: number;
  physicalCash: number;
  totalReceivables: number;
  totalPayables: number;
  netPosition: number; // available + receivables - payables
  state: CashPositionState;
}

export interface SalesAnalysis {
  actual: number;
  budget: number;
  percentage: number; // 0-100+
  state: SalesState;
}

export interface CostsAnalysis {
  actual: number;
  budget: number;
  percentage: number;
  overBudgetPct: number; // % por encima del presupuesto (0 si está debajo)
  state: CostsState;
}

export interface CollectionAnalysis {
  hasPolicy: boolean;
  totalOverdue: number;
  overdueCount: number;
  averageDaysOverdue: number;
  state: CollectionState;
}

export interface PaymentAnalysis {
  hasPolicy: boolean;
  upcomingPayments: number;
  earlyPaymentOpportunities: number;
  state: PaymentState;
}

export interface RunwayAnalysis {
  days: number;
  monthlyBurn: number; // gasto mensual promedio
  availableCash: number;
  state: RunwayState;
}

/** Señales de configuración pendiente (alimentan las alertas CONFIGURAR). */
export interface ConfigFlags {
  hasBudget: boolean;
  hasCollectionPolicy: boolean;
  hasPaymentPolicy: boolean;
  hasMinReserve: boolean;
}

/** Foto completa del estado financiero — lo que devuelve el CashEngine. */
export interface CashAnalysis {
  companyId: string;
  computedAt: string; // ISO
  cashPosition: CashPositionAnalysis;
  sales: SalesAnalysis;
  costs: CostsAnalysis;
  collection: CollectionAnalysis;
  payment: PaymentAnalysis;
  runway: RunwayAnalysis;
  flags: ConfigFlags;
}

/** Alerta lista para persistir/enviar. */
export interface GeneratedAlert {
  companyId: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string; // lenguaje gerencial, no contable
  suggestedAction: string;
  channelSent: AlertChannel;
  /** Clave de deduplicación para no repetir la misma alerta en 24h. */
  dedupeKey: string;
}
