import angularEslint from 'angular-eslint';
import { ESLint, Linter } from 'eslint';
import typescriptEslintPlugin from 'typescript-eslint';

export const angularInlineTemplateEslintConfig: Linter.Config[] = [
  {
    name: 'angular-inline-template-eslint/settings',
    languageOptions: {
      parser: typescriptEslintPlugin.parser as Linter.Parser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: {
      '@angular-eslint/template': angularEslint.templatePlugin as ESLint.Plugin,
    },
    files: ['**/*.ts'],
    processor: angularEslint.processInlineTemplates,
  },
];
