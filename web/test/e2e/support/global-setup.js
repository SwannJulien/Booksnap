import { execFileSync } from 'child_process';
import { E2E_PASSWORD } from './accounts.js';
import { E2E_DATABASE, SCRIPTS_DIR } from './harness.js';

// Runs once the backend is up: Flyway builds the schema at startup, and the
// fixtures can only be loaded into an existing schema.
export default function globalSetup() {
  execFileSync(
    'bash',
    [`${SCRIPTS_DIR}load-dev-fixtures.sh`, '--database', E2E_DATABASE, '--yes'],
    { stdio: 'inherit' },
  );
  execFileSync(
    'bash',
    [`${SCRIPTS_DIR}load-e2e-accounts.sh`, '--database', E2E_DATABASE],
    {
      stdio: 'inherit',
      env: { ...process.env, BOOKSNAP_E2E_PASSWORD: E2E_PASSWORD },
    },
  );
}
