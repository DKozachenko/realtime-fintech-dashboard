import { RequiredOptions } from 'prettier';

export const commonPrettierRules: Partial<RequiredOptions> = {
  singleQuote: true,
  printWidth: 120,
  endOfLine: 'lf',
};
