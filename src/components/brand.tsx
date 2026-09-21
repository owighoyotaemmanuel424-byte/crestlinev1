import { cn } from '@/lib/utils';

/**
 * Crestline brand mark — a four-segment compass/octagon motif that nods to
 * classic banking marks while staying crisp at small sizes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      {[0, 90, 180, 270].map((angle) => (
        <path
          key={angle}
          d="M16 3.4 19.2 8.6H12.8L16 3.4Z"
          fill="currentColor"
          transform={`rotate(${angle} 16 16)`}
        />
      ))}
      <circle cx="16" cy="16" r="2.6" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function BrandLogo({
  tone = 'light',
  className,
  size = 'md',
}: {
  tone?: 'light' | 'dark';
  className?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex items-center justify-center rounded-lg',
          size === 'lg' ? 'h-10 w-10' : 'h-9 w-9',
          tone === 'light' ? 'bg-white/12 text-white' : 'bg-primary text-white'
        )}
      >
        <BrandMark className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
      </span>
      <span
        className={cn(
          'font-bold leading-none tracking-tight',
          size === 'lg' ? 'text-lg' : 'text-[1.0625rem]',
          tone === 'light' ? 'text-white' : 'text-navy-900'
        )}
      >
        Crestline
        <span className={tone === 'light' ? 'text-primary-200' : 'text-primary'}> Capital</span>
      </span>
    </span>
  );
}
