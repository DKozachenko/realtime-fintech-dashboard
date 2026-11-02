/** @type {import('stylelint').Config} */
const stylelintConfig = {
  customSyntax: 'postcss-scss',
  plugins: ['stylelint-scss', 'stylelint-prettier'],
  rules: {
    'prettier/prettier': [
      true,
      {
        singleQuote: true,
        printWidth: 120,
        endOfLine: 'lf',
      },
    ],
  },
};

module.exports = stylelintConfig;
