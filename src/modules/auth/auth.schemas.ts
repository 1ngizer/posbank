import { z } from 'zod';

export const registerSchema = z.object({
  // Empresa
  companyName: z.string().min(2, 'Nombre de empresa requerido'),
  nit: z.string().optional(),
  industry: z.string().optional(),
  size: z.coerce.number().int().min(1).max(50).optional(),
  minimumCashReserve: z.coerce.number().min(0).optional(),
  // Usuario dueño
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  phoneWhatsapp: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
