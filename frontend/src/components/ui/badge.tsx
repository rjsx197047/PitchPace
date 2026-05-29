import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-brand-600/30 bg-brand-600/15 text-brand-300',
        neutral: 'border-zinc-700/70 bg-zinc-800/70 text-zinc-300',
        success: 'border-emerald-600/30 bg-emerald-600/15 text-emerald-300',
        warning: 'border-amber-600/30 bg-amber-600/15 text-amber-300',
        danger: 'border-red-600/30 bg-red-600/15 text-red-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
