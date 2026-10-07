interface SectionHeaderProps {
  action?: string;
  onAction?: () => void;
  title: string;
}

export default function SectionHeader({ action, onAction, title }: SectionHeaderProps) {
  return <div className="flex items-center justify-between gap-4"><h2 className="text-[22px] font-bold tracking-[-0.04em] text-tipsy-ink">{title}</h2>{action && onAction ? <button className="shrink-0 text-sm font-semibold text-tipsy-muted transition hover:text-tipsy-ink hover:underline hover:underline-offset-4" onClick={onAction} type="button">{action}</button> : null}</div>;
}
