import { Linter } from 'eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import { commonPrettierRules } from './common-prettier-rules';

export const prettierHtmlEslintConfig: Linter.Config[] = [
  {
    name: 'eslint-plugin-prettier-html/recommended',
    plugins: {
      prettier: eslintPluginPrettier,
    },
    files: ['**/*.html'],
    rules: {
      // ignore: tag content is moved to its own line instead of ">{{ x }}</a\n>" that preserves whitespace
      'prettier/prettier': [
        'error',
        { ...commonPrettierRules, parser: 'angular', htmlWhitespaceSensitivity: 'ignore' },
      ],
    },
  },
];
