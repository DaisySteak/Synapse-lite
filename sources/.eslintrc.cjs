/* ESLint 8 (compatible Node 18) — Vue 3 + TypeScript */
module.exports = {
    root: true,
    env: { browser: true, es2021: true, node: true },
    parser: 'vue-eslint-parser',
    parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2021,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:vue/vue3-recommended',
    ],
    rules: {
        // Formatting is delegated to Prettier.
        'vue/html-indent': 'off',
        'vue/max-attributes-per-line': 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline': 'off',
        'vue/html-self-closing': 'off',
        'vue/html-closing-bracket-newline': 'off',
        'vue/first-attribute-linebreak': 'off',
        'vue/multi-word-component-names': 'off',
        'vue/require-default-prop': 'off',
        'vue/no-v-html': 'off', // Markdown output is sanitized by DOMPurify (utils/markdown.ts).
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
};
