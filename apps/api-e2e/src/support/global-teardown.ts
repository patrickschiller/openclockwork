/* eslint-disable */
declare const globalThis: { __TEARDOWN_MESSAGE__?: string };

module.exports = async function () {
  // We bootstrap NestJS in-process per spec; nothing to tear down globally.
  // The test database is preserved between runs so subsequent runs only have
  // to truncate, not migrate.
  if (globalThis.__TEARDOWN_MESSAGE__) console.log(globalThis.__TEARDOWN_MESSAGE__);
};
