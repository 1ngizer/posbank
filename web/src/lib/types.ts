/** Tipos que devuelve el posbank-api (espejo del backend). */

export type CashPositionState = 'surplus' | 'sufficient' | 'tight' | 'deficit';
export type SalesState = 'exceeds' | 'on_target' | 'at_risk' | 'critical';
export type CostsState = 'efficient' | 'on_budget' | 'review' | 'deviated';
export type CollectionState = 'healthy' | 'overdue' | 'no_policy';
export type PaymentState = 'on_time' | 'early_no_discount' | 'no_policy';
export type RunwayState = 'solid' | 'stable' | 'alert' | 'emergency';

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'opportunity';

export interface CashAnalysis {
  companyId: string;
  computedAt: string;
  cashPosition: {
    totalAvailable: number; bankBalance: number; physicalCash: number;
    totalReceivables: number; totalPayables: number; netPosition: number;
    state: CashPositionState;
  };
  sales: { actual: number; budget: number; percentage: number; state: SalesState };
  costs: { actual: number; budget: number; percentage: number; overBudgetPct: number; state: CostsState };
  collection: { hasPolicy: boolean; totalOverdue: number; overdueCount: number; averageDaysOverdue: number; state: CollectionState };
  payment: { hasPolicy: boolean; upcomingPayments: number; earlyPaymentOpportunities: number; state: PaymentState };
  runway: { days: number; monthlyBurn: number; availableCash: number; state: RunwayState };
  flags: { hasBudget: boolean; hasCollectionPolicy: boolean; hasPaymentPolicy: boolean; hasMinReserve: boolean };
}

export interface AlertRow {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  suggested_action: string | null;
  channel_sent: string | null;
  status: string;
  created_at: string;
}

export interface DashboardData {
  analysis: CashAnalysis;
  alerts: { recent: AlertRow[]; unreadCount: number };
}
