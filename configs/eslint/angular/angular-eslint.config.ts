import angularEslint from 'angular-eslint';
import { Linter, ESLint } from 'eslint';
import typescriptEslintPlugin from 'typescript-eslint';

export const angularEslintConfig: Linter.Config[] = [
  {
    name: 'angular-eslint/settings',
    languageOptions: {
      parser: typescriptEslintPlugin.parser as Linter.Parser,
    },
    plugins: {
      '@angular-eslint': angularEslint.tsPlugin as ESLint.Plugin,
    },
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/contextual-lifecycle': 'error',
      '@angular-eslint/no-empty-lifecycle-method': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-inputs-metadata-property': 'error',
      '@angular-eslint/no-output-native': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/no-output-rename': 'error',
      '@angular-eslint/no-outputs-metadata-property': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',
      '@angular-eslint/use-lifecycle-interface': 'warn',
      '@angular-eslint/sort-lifecycle-methods': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-inject': 'error',
    },
  },
];
