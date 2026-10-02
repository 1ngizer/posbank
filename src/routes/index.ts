import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { companiesRouter } from '../modules/companies/companies.routes';
import { movementsRouter } from '../modules/movements/movements.routes';
import { receivablesRouter } from '../modules/receivables/receivables.routes';
import { payablesRouter } from '../modules/payables/payables.routes';
import { budgetsRouter } from '../modules/budgets/budgets.routes';
import { policiesRouter } from '../modules/policies/policies.routes';
import { commitmentsRouter } from '../modules/commitments/commitments.routes';
import { analysisRouter } from '../modules/analysis/analysis.routes';
import { alertsRouter } from '../modules/alerts/alerts.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { whatsappRouter } from '../integrations/whatsapp/whatsapp.routes';
import { alexaRouter } from '../integrations/alexa/alexa.routes';
import { inventoryRouter } from '../modules/inventory/inventory.routes';
import { posRouter } from '../modules/pos/pos.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { scanRouter } from '../modules/scan/scan.routes';
import { accountingRouter } from '../integrations/accounting/accounting.routes';

/**
 * Router raíz de la API v1. Cada módulo registra su sub-router aquí.
 */
export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'PosBank API',
    version: 'v1',
    tagline: 'Un banco en el punto de pago.',
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/movements', movementsRouter);
apiRouter.use('/receivables', receivablesRouter);
apiRouter.use('/payables', payablesRouter);
apiRouter.use('/budgets', budgetsRouter);
apiRouter.use('/policies', policiesRouter);
apiRouter.use('/commitments', commitmentsRouter);
apiRouter.use('/products', inventoryRouter);
apiRouter.use('/invoices', posRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/scan', scanRouter);
apiRouter.use('/alerts', alertsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/accounting', accountingRouter);
apiRouter.use('/webhooks/whatsapp', whatsappRouter);
apiRouter.use('/alexa', alexaRouter);
// cash-position, cash-position/history, runway
apiRouter.use('/', analysisRouter);
