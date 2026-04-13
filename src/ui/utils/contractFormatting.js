import { formatMoneyM, toFiniteNumber } from './numberFormatting.js';

function normalizeSalaryUnit(value) {
  const raw = toFiniteNumber(value, null);
  if (raw == null) return null;
  if (Math.abs(raw) >= 1000) return raw / 1e6;
  return raw;
}

export function derivePlayerContractFinancials(player = {}) {
  const contract = player?.contract ?? {};
  const yearsTotal = Math.max(1, toFiniteNumber(contract?.yearsTotal ?? contract?.years ?? player?.yearsTotal ?? player?.years, 1));
  const annualSalary = normalizeSalaryUnit(contract?.baseAnnual ?? player?.baseAnnual ?? contract?.salary ?? player?.salary);
  const signingBonus = Math.max(0, normalizeSalaryUnit(contract?.signingBonus ?? player?.signingBonus) ?? 0);
  const guaranteedPct = Math.max(0, toFiniteNumber(contract?.guaranteedPct ?? player?.guaranteedPct, 0));
  const capHit = annualSalary != null ? annualSalary + (signingBonus / yearsTotal) : null;
  const guaranteedMoney = annualSalary != null ? (annualSalary * yearsTotal + signingBonus) * guaranteedPct : null;
  return {
    yearsTotal,
    annualSalary,
    signingBonus,
    capHit,
    guaranteedMoney,
    deadMoney: null,
  };
}

export function formatContractMoney(value, fallback = '—') {
  return formatMoneyM(value, fallback);
}
