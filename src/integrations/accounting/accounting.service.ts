import { SupabaseClient } from '@supabase/supabase-js';
import {
  AccountingProviderType,
  AccountingSyncEntity,
  ConnectionStatusResponse,
  SyncInvoiceInput,
  SyncMovementInput,
  SyncPayableInput,
  SyncReceivableInput,
  SyncResult,
} from './types';
import { getAccountingProvider } from './accounting.factory';
import { encryptCredentials, maskSensitive } from './crypto';
import { AlegraProvider } from './alegra/alegra.provider';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/http';

export class AccountingService {
  /**
   * Conecta y valida un proveedor guardando sus credenciales cifradas.
   */
  static async connectProvider(
    db: SupabaseClient,
    companyId: string,
    provider: AccountingProviderType,
    credentials: Record<string, any>,
  ): Promise<ConnectionStatusResponse> {
    if (!credentials || typeof credentials !== 'object') {
      throw ApiError.badRequest('Credenciales inválidas');
    }

    // 1. Probar credenciales antes de guardar
    let isValid = false;
    if (provider === 'alegra') {
      if (!credentials.email || !credentials.token) {
        throw ApiError.badRequest('Alegra requiere email y token de API');
      }
      const testProvider = new AlegraProvider({
        email: String(credentials.email).trim(),
        token: String(credentials.token).trim(),
      });
      isValid = await testProvider.testConnection();
    } else {
      throw ApiError.badRequest(`Proveedor ${provider} aún no está implementado`);
    }

    if (!isValid) {
      throw ApiError.badRequest('No se pudo autenticar con Alegra. Verifica tu correo y token de API.');
    }

    // 2. Cifrar credenciales
    const encrypted = encryptCredentials(credentials);
    const emailMasked = credentials.email ? maskSensitive(credentials.email) : undefined;

    // 3. Upsert en base de datos
    const { error } = await db
      .from('accounting_connections')
      .upsert(
        {
          company_id: companyId,
          provider,
          encrypted_credentials: encrypted,
          status: 'connected',
          metadata: { emailMasked },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,provider' },
      );

    if (error) {
      logger.error({ err: error.message, companyId, provider }, 'Error guardando conexión contable');
      throw new ApiError(500, 'No se pudo guardar la conexión contable');
    }

    return {
      connected: true,
      provider,
      status: 'connected',
      lastSyncAt: null,
      emailMasked,
    };
  }

  /**
   * Desconecta un proveedor contable y BORRA sus credenciales cifradas.
   * El historial de sincronización (accounting_sync_log) se conserva para auditoría.
   */
  static async disconnectProvider(
    db: SupabaseClient,
    companyId: string,
    provider: AccountingProviderType,
  ): Promise<void> {
    const { error } = await db
      .from('accounting_connections')
      .delete()
      .eq('company_id', companyId)
      .eq('provider', provider);

    if (error) {
      logger.error({ err: error.message, companyId, provider }, 'Error desconectando proveedor contable');
      throw new ApiError(500, 'Error al desconectar proveedor');
    }
  }

  /**
   * Obtiene el estado seguro de la conexión contable (sin revelar credenciales).
   */
  static async getConnectionStatus(
    db: SupabaseClient,
    companyId: string,
  ): Promise<ConnectionStatusResponse> {
    const { data: conn, error } = await db
      .from('accounting_connections')
      .select('provider, status, last_sync_at, metadata')
      .eq('company_id', companyId)
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !conn) {
      return {
        connected: false,
        provider: null,
        status: 'not_configured',
        lastSyncAt: null,
      };
    }

    return {
      connected: conn.status === 'connected',
      provider: conn.provider as AccountingProviderType,
      status: conn.status,
      lastSyncAt: conn.last_sync_at,
      emailMasked: conn.metadata?.emailMasked,
    };
  }

  /**
   * Prueba la conexión activa.
   */
  static async testActiveConnection(
    db: SupabaseClient,
    companyId: string,
  ): Promise<{ ok: boolean; message?: string }> {
    const provider = await getAccountingProvider(db, companyId);
    if (!provider) {
      return { ok: false, message: 'No hay ningún software contable conectado' };
    }

    const ok = await provider.testConnection();
    return {
      ok,
      message: ok ? 'Conexión exitosa' : 'Falló la autenticación con el proveedor contable',
    };
  }

  /**
   * Sincroniza una entidad con verificación de idempotencia y registro en la cola/log.
   */
  static async syncEntity(
    db: SupabaseClient,
    companyId: string,
    entity: AccountingSyncEntity,
    localId: string,
    payload: any,
  ): Promise<SyncResult> {
    const providerInstance = await getAccountingProvider(db, companyId);
    if (!providerInstance) {
      // Si la empresa no tiene software contable conectado, no es un error que bloquee el flujo
      return { success: false, error: 'Sin software contable conectado' };
    }

    const provider = providerInstance.providerName;

    // 1. Verificación de idempotencia: ¿ya fue sincronizado exitosamente?
    const { data: existingLog } = await db
      .from('accounting_sync_log')
      .select('id, external_id, status, attempts')
      .eq('company_id', companyId)
      .eq('entity', entity)
      .eq('local_id', localId)
      .maybeSingle();

    if (existingLog && existingLog.status === 'synced') {
      return {
        success: true,
        externalId: existingLog.external_id,
      };
    }

    // 2. Registrar/actualizar estado en cola
    const attempts = (existingLog?.attempts ?? 0) + 1;
    let logId = existingLog?.id;

    if (!logId) {
      const { data: newLog } = await db
        .from('accounting_sync_log')
        .insert({
          company_id: companyId,
          provider,
          entity,
          local_id: localId,
          status: 'pending',
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      logId = newLog?.id;
    } else {
      await db
        .from('accounting_sync_log')
        .update({
          status: 'pending',
          attempts,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }

    // 3. Ejecutar sincronización según entidad
    let result: SyncResult;
    try {
      switch (entity) {
        case 'invoice':
          result = await providerInstance.syncInvoice(payload as SyncInvoiceInput);
          break;
        case 'receivable':
          result = await providerInstance.syncReceivable(payload as SyncReceivableInput);
          break;
        case 'payable':
          result = await providerInstance.syncPayable(payload as SyncPayableInput);
          break;
        case 'cash_movement':
          result = await providerInstance.syncMovement(payload as SyncMovementInput);
          break;
        default:
          result = { success: false, error: `Entidad ${entity} no reconocida` };
      }
    } catch (err: any) {
      result = { success: false, error: err.message };
    }

    // 4. Actualizar log y conexión
    const now = new Date().toISOString();
    if (result.success) {
      if (logId) {
        await db
          .from('accounting_sync_log')
          .update({
            status: 'synced',
            external_id: result.externalId,
            error: null,
            updated_at: now,
          })
          .eq('id', logId);
      }

      await db
        .from('accounting_connections')
        .update({ last_sync_at: now, updated_at: now })
        .eq('company_id', companyId)
        .eq('provider', provider);
    } else {
      if (logId) {
        await db
          .from('accounting_sync_log')
          .update({
            status: 'failed',
            error: result.error,
            updated_at: now,
          })
          .eq('id', logId);
      }
    }

    return result;
  }

  /**
   * Obtiene el historial reciente de sincronizaciones para la interfaz.
   */
  static async getRecentLogs(
    db: SupabaseClient,
    companyId: string,
    limit = 30,
  ) {
    const { data, error } = await db
      .from('accounting_sync_log')
      .select('id, provider, entity, local_id, external_id, status, error, attempts, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ err: error.message, companyId }, 'Error obteniendo historial de sync contable');
      return [];
    }
    return data ?? [];
  }
}
