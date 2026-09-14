import { supabase } from './supabase';

/**
 * Sube una foto de producto al bucket público `product-photos` y devuelve su
 * URL pública. Los archivos se guardan bajo companyId/ para orden.
 */
export async function uploadProductPhoto(companyId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('product-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('product-photos').getPublicUrl(path);
  return data.publicUrl;
}
