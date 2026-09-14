/**
 * Valida el modelo de interacción de Alexa antes de subirlo a la consola.
 * Atrapa los errores que allá solo se ven como "Build failed":
 * prompts referenciados que no existen, slots desalineados con su intent,
 * o intents de diálogo que no están definidos.
 *
 *   node alexa/validate-model.mjs
 */
import { readFileSync } from 'node:fs';

const ruta = new URL('./interaction-model.json', import.meta.url);
const m = JSON.parse(readFileSync(ruta, 'utf8')).interactionModel;
const lm = m.languageModel;
const problemas = [];

console.log(`invocación:  "${lm.invocationName}"`);
console.log(`intents:     ${lm.intents.length}`);
console.log(`slot types:  ${lm.types.length} → ${lm.types.map((t) => t.name).join(', ')}`);

const declarados = new Set((m.prompts ?? []).map((p) => p.id));
const usados = [];
for (const di of m.dialog?.intents ?? []) {
  if (di.prompts?.confirmation) usados.push(di.prompts.confirmation);
  for (const s of di.slots ?? []) {
    if (s.prompts?.elicitation) usados.push(s.prompts.elicitation);
  }
}

const faltantes = usados.filter((u) => !declarados.has(u));
if (faltantes.length) problemas.push(`prompts referenciados que no existen: ${faltantes.join(', ')}`);

const sinUsar = [...declarados].filter((d) => !usados.includes(d));
if (sinUsar.length) console.log(`prompts sin usar: ${sinUsar.join(', ')}`);

const nombres = new Set(lm.intents.map((i) => i.name));
for (const di of m.dialog?.intents ?? []) {
  if (!nombres.has(di.name)) {
    problemas.push(`el diálogo define "${di.name}" pero el intent no existe`);
    continue;
  }
  const base = lm.intents.find((i) => i.name === di.name);
  const slotsBase = new Set((base.slots ?? []).map((s) => s.name));
  for (const s of di.slots ?? []) {
    if (!slotsBase.has(s.name)) {
      problemas.push(`"${di.name}" declara en diálogo el slot "${s.name}", que no está en el intent`);
    }
    const tipoBase = (base.slots ?? []).find((b) => b.name === s.name)?.type;
    if (tipoBase && s.type && tipoBase !== s.type) {
      problemas.push(`"${di.name}.${s.name}" tipo distinto: ${tipoBase} vs ${s.type}`);
    }
  }
}

// Todo slot usado en un sample debe estar declarado en el intent.
for (const i of lm.intents) {
  const declarados = new Set((i.slots ?? []).map((s) => s.name));
  for (const sample of i.samples ?? []) {
    for (const [, nombre] of sample.matchAll(/\{(\w+)\}/g)) {
      if (!declarados.has(nombre)) {
        problemas.push(`"${i.name}" usa {${nombre}} en un sample pero no lo declara`);
      }
    }
  }
}

// Los tipos personalizados deben existir.
const tipos = new Set(lm.types.map((t) => t.name));
for (const i of lm.intents) {
  for (const s of i.slots ?? []) {
    if (!s.type.startsWith('AMAZON.') && !tipos.has(s.type)) {
      problemas.push(`"${i.name}.${s.name}" usa el tipo "${s.type}", que no está definido`);
    }
  }
}

console.log(`prompts:     ${declarados.size} declarados, ${usados.length} referenciados`);

if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`);
  problemas.forEach((p) => console.error(`  · ${p}`));
  process.exit(1);
}
console.log('\nModelo consistente. Listo para pegar en la consola.');
