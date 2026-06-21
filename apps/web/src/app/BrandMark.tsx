import { cn } from '@/lib/utils';

type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
};

export function BrandMark({
  className,
  iconClassName,
  textClassName,
}: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src="/icon.svg"
        alt=""
        aria-hidden="true"
        className={cn('h-9 w-9 shrink-0', iconClassName)}
      />
      <span
        className={cn(
          'text-lg font-semibold tracking-tight text-foreground',
          textClassName,
        )}
      >
        OpenClockwork
      </span>
    </div>
  );
}
