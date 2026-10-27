import { execFileSync } from 'child_process';
import { E2E_DATABASE, POSTGRES_CONTAINER } from './harness.js';

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8' });
}

export function queryE2eDb(sql) {
  const user = docker(
    'exec',
    POSTGRES_CONTAINER,
    'printenv',
    'POSTGRES_USER',
  ).trim();
  return docker(
    'exec',
    POSTGRES_CONTAINER,
    'psql',
    '-U',
    user,
    '-d',
    E2E_DATABASE,
    '-At',
    '-c',
    sql,
  ).trim();
}
