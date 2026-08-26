export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={compact ? "brand brand--compact" : "brand"} href="/" aria-label="Payoff home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Payoff</span>
    </a>
  );
}
