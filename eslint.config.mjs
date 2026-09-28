// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // src/generated/** es el cliente de Prisma: código generado, no se lintea.
    ignores: ['eslint.config.mjs', 'src/generated/**', 'dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Reglas relajadas SOLO en los archivos de test.
    //
    // No es pereza: son dos falsos positivos concretos de las reglas type-checked.
    //   · supertest tipa `res.body` como `any` (no puede saber qué devuelve tu endpoint),
    //     así que toda aserción sobre el body dispara no-unsafe-member-access. Tipar cada
    //     respuesta a mano llenaría los tests de casts y taparía lo que se quiere enseñar.
    //   · `expect(objeto.metodo)` con un jest.fn() dispara unbound-method, porque ESLint
    //     ve un método desacoplado de su `this`. Es exactamente lo que hacen todos los
    //     asserts sobre mocks. typescript-eslint lo documenta como caso conocido en Jest.
    //
    // El código de src/ sigue con las reglas completas.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
