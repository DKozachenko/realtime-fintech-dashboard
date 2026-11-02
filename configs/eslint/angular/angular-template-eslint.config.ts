import angularEslint from 'angular-eslint';
import { ESLint, Linter } from 'eslint';

export const angularTemplateEslintConfig: Linter.Config[] = [
  {
    name: 'angular-template-eslint/settings',
    languageOptions: {
      parser: angularEslint.templateParser as Linter.Parser,
    },
    plugins: {
      '@angular-eslint/template': angularEslint.templatePlugin as ESLint.Plugin,
    },
    files: ['**/*.html'],
    rules: {
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
      '@angular-eslint/template/attributes-order': 'error',
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/no-duplicate-attributes': 'error',
    },
  },
];
