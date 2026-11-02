import { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import';

export const importEslintConfig: Linter.Config[] = [
  {
    name: 'import-eslint/settings',
    files: ['**/*.ts', '**/*.js'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
];
