import { formatMoneyM, toFiniteNumber } from './numberFormatting.js';

function normalizeSalaryUnit(value) {
  const raw = toFiniteNumber(value, null);
  if (raw == null) return null;
  if (Math.abs(raw) >= 1000) return raw / 1e6;
  return raw;
}

export function derivePlayerContractFinancials(player = {}) {
  const contract = player?.contract ?? {};
  const yearsTotal = Math.max(1, toFiniteNumber(
    contract?.yearsTotal
      ?? contract?.yearsRemaining
      ?? contract?.years
      ?? player?.yearsRemaining
      ?? player?.yearsTotal
      ?? player?.years,
    1,
  ));
  const annualSalary = normalizeSalaryUnit(
    contract?.baseAnnual
      ?? contract?.salary
      ?? contract?.annualSalary
      ?? contract?.capHit
      ?? player?.baseAnnual
      ?? player?.salary,
  );
  const signingBonus = Math.max(0, normalizeSalaryUnit(contract?.signingBonus ?? player?.signingBonus) ?? 0);
  const guaranteedPct = Math.max(0, toFiniteNumber(contract?.guaranteedPct ?? player?.guaranteedPct, 0));
  const capHit = annualSalary != null ? annualSalary + (signingBonus / yearsTotal) : null;
  const guaranteedMoney = annualSalary != null ? (annualSalary * yearsTotal + signingBonus) * guaranteedPct : null;
  const totalValue = annualSalary != null ? (annualSalary * yearsTotal) + signingBonus : null;
  return {
    yearsTotal,
    yearsRemaining: yearsTotal,
    annualSalary,
    signingBonus,
    capHit,
    guaranteedMoney,
    totalValue,
    status: player?.status === 'free_agent' || player?.teamId == null ? 'free_agent' : 'signed',
    deadMoney: null,
  };
}

export function formatContractMoney(value, fallback = '—') {
  return formatMoneyM(value, fallback);
}
