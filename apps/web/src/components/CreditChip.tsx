import pCoinIcon from '../assets/pCoin.svg';

/**
 * Small inline cost indicator — the pCoin glyph + an amount — used on action
 * buttons to show how many credits the action will spend. Matches the header
 * credit pill's coin so the cost reads as "this many credits".
 */
export const CreditChip = ({
  amount,
  className = 'bg-black/5 text-gray-600',
}: {
  amount: number;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${className}`}
    aria-label={`Costs ${amount} credits`}
  >
    <img src={pCoinIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
    {amount}
  </span>
);
