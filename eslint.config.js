// ESLint 9 flat config — reemplaza .eslintrc.cjs (formato deprecado en v9).
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Reglas comunes a JS y JSX. react-hooks aplica también a custom hooks
// que viven en .js (ej. src/hooks/useDrugCalculator.js).
const commonRules = {
  'no-irregular-whitespace': 'off',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  // react-hooks v7: desactivamos las reglas experimentales ruidosas
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/exhaustive-deps': 'warn',
}

const commonPlugins = { 'react-hooks': reactHooks }

const commonLang = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: { ...globals.browser, ...globals.node },
}

export default [
  { ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**'] },
  js.configs.recommended,
  {
    // JS puro (custom hooks, utils, services) — sin parser JSX
    files: ['src/**/*.js'],
    languageOptions: commonLang,
    plugins: commonPlugins,
    rules: commonRules,
  },
  {
    // JSX — añade plugin react encima de los hooks
    files: ['src/**/*.jsx'],
    languageOptions: {
      ...commonLang,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { ...commonPlugins, react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...commonRules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Re-aplicar overrides del bloque commonRules después de cargar configs.recommended
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.jest } },
  },
]
