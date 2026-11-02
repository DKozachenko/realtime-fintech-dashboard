import { Linter } from 'eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import { commonPrettierRules } from './common-prettier-rules';

export const prettierEslintConfig: Linter.Config[] = [
  {
    name: 'eslint-plugin-prettier/recommended',
    plugins: {
      prettier: eslintPluginPrettier,
    },
    files: ['**/*.ts', '**/*.js'],
    rules: {
      'prettier/prettier': ['error', { ...commonPrettierRules }],
    },
  },
];
