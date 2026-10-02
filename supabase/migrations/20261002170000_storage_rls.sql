-- ════════════════════════════════════════════════════════════════════
-- PosBank · Corrección de Seguridad RLS en Storage (Multi-tenant)
-- Restringe la inserción, modificación y borrado de fotos de productos
-- exclusivamente a la empresa (tenant) dueña del archivo.
-- ════════════════════════════════════════════════════════════════════

-- 1. Inserción: Solo puede subir archivos dentro de la carpeta con su company_id
drop policy if exists "pb product photos insert" on storage.objects;
create policy "pb product photos insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- 2. Actualización: Solo puede modificar archivos de su propia empresa
drop policy if exists "pb product photos update" on storage.objects;
create policy "pb product photos update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  )
  with check (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- 3. Eliminación: Solo puede borrar archivos de su propia empresa
drop policy if exists "pb product photos delete" on storage.objects;
create policy "pb product photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
