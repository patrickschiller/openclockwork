import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    // api-e2e is by definition an integration tester for `apps/api`. The
    // module-boundary check would force a publishable npm scope; relative
    // imports into the API source tree are intentional here.
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
