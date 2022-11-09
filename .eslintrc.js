module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'global-require': 'off',
    radix: 'off',
    'no-use-before-define': 'off',
    'no-param-reassign': 'off',
    'no-restricted-syntax': 'off',
    'no-plusplus': 'off',
    'no-unused-vars': 'off',
  },
};
