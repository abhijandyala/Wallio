/** Page title on the left, page actions on the right. One optional supporting line. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="display text-[28px] leading-[34px] font-medium text-text-1">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[15px] leading-[22px] text-text-2">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {actions}
        </div>
      )}
    </header>
  );
}
