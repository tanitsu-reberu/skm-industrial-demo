/* eslint-disable @typescript-eslint/no-require-imports */
require('pg').Client.prototype.connect = async function () {
  process.stderr.write('UNEXPECTED_DATABASE_CONNECTION\n');
  throw new Error('Connection forbidden by CLI validation test');
};
