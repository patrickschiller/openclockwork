// Runtime-only operator helper: keep external source out of this TS rootDir.
const safety = require('../../../../ops/db-target-safety.cjs') as {
  assertE2eTarget(env?: NodeJS.ProcessEnv): {
    databaseUrl: string;
    databaseName: string;
    adminUrl: string;
  };
  assertConnectedDatabase(
    target: { databaseName: string },
    databaseName: string,
    schemaName: string,
  ): void;
};

export const assertE2eTarget = safety.assertE2eTarget;
export const assertConnectedDatabase = safety.assertConnectedDatabase;
