/**
 * apps/mobile/src/types/svg.d.ts
 *
 * Matches metro.config.js's react-native-svg-transformer setup: an
 * `import Foo from './foo.svg'` resolves to a React component (backed by
 * react-native-svg) rather than an asset URI/number. Without this
 * declaration, TypeScript falls back to `any` for every .svg import (or
 * errors under strict settings) since it has no built-in RN svg-transformer
 * type.
 */
declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const content: FC<SvgProps>;
  export default content;
}
