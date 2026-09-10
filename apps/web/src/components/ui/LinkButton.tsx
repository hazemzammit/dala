'use client';

import { Button } from '@dala/ui-web';
import Link from 'next/link';
import type { ComponentProps } from 'react';

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
