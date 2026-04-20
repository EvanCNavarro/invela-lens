/**
 * Shared shell for the rounded / bordered / dark-bg container. Owns ONLY the
 * shell; headings / image cells / actions stay in the caller. `className` is
 * appended last so callers can override individual classes (e.g. VariantGrid
 * cells override `subtle`'s bg).
 */
import type { ElementType, JSX, ReactNode, HTMLAttributes } from 'react';

export type CardVariant = 'default' | 'subtle' | 'recommended' | 'modal';
export type CardPadding = 'sm' | 'md' | 'lg';
export type CardElement = 'div' | 'article' | 'li' | 'section' | 'button';

// `type` / `disabled` are pulled in explicitly so as="button" callers don't
// need a cast; rest of HTMLAttributes covers role/aria/onClick/etc.
export type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  as?: CardElement;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'bg-white border border-[#E2E8F0] rounded-xl shadow-sm',
  subtle: 'bg-white border border-[#E2E8F0] rounded-xl shadow-sm',
  recommended: 'bg-white border border-[#E2E8F0] rounded-xl shadow-sm ring-1 ring-[#4166F5]/20',
  modal: 'bg-white border border-[#E2E8F0] rounded-xl shadow-lg',
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  sm: 'p-3',
  md: 'p-6',
  lg: 'p-6',
};

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className,
  as = 'div',
  ...rest
}: CardProps): JSX.Element {
  const Tag = as as ElementType;
  const classes = [VARIANT_CLASSES[variant], PADDING_CLASSES[padding], className]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
