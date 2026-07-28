'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { Button } from './Button';

type LinkButtonProps = ComponentProps<typeof Button> & {
  href: string;
};

export function LinkButton({ href, ...props }: LinkButtonProps) {
  return (
    <Link href={href}>
      <Button {...props} />
    </Link>
  );
}
