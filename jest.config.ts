import { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  collectCoverage: true,
  collectCoverageFrom: ['./src/**/*.[jt]s?(x)'],
  coverageDirectory: 'target/coverage',
  coveragePathIgnorePatterns: ['node_modules/', 'test/', 'dist/'],
  coverageReporters: [
    'json',
    'text-summary',
    [
      'cobertura',
      {
        file: 'cobertura-coverage-unit.xml',
      },
    ],
    [
      'html',
      {
        subdir: 'html-unit',
      },
    ],
  ],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  reporters: ['default', 'jest-summarizing-reporter', ['jest-junit', { outputName: 'target/junit-unit.xml' }]],
};

// noinspection JSUnusedGlobalSymbols
export default config;
