import { SupabaseClient } from '@supabase/supabase-js';
import { AccountingProvider, AccountingProviderType, AlegraCredentials } from './types';
import { AlegraProvider } from './alegra/alegra.provider';
import { decryptCredentials } from './crypto';
import { logger } from '../../config/logger';

export async function getAccountingProvider(
  db: SupabaseClient,
  companyId: string,
  preferredProvider?: AccountingProviderType,
): Promise<AccountingProvider | null> {
  let query = db
    .from('accounting_connections')
    .select('id, provider, encrypted_credentials, status')
    .eq('company_id', companyId)
    .eq('status', 'connected');

  if (preferredProvider) {
    query = query.eq('provider', preferredProvider);
  }

  const { data: conn, error } = await query.limit(1).maybeSingle();

  if (error || !conn) {
    return null;
  }

  try {
    const creds = decryptCredentials(conn.encrypted_credentials);

    switch (conn.provider as AccountingProviderType) {
      case 'alegra':
        return new AlegraProvider(creds as AlegraCredentials);
      case 'siigo':
        // Adaptador de Siigo (Fase siguiente)
        logger.warn({ companyId }, 'Proveedor Siigo configurado pero aún no soportado');
        return null;
      case 'worldoffice':
        // Adaptador de World Office (Fase siguiente)
        logger.warn({ companyId }, 'Proveedor World Office configurado pero aún no soportado');
        return null;
      default:
        return null;
    }
  } catch (err: any) {
    logger.error({ companyId, provider: conn.provider, err: err.message }, 'Error al descifrar credenciales contables');
    return null;
  }
}
