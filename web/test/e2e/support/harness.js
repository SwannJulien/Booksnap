import { fileURLToPath } from 'url';

export const E2E_DATABASE = 'booksnap_e2e';
export const BACKEND_PORT = 8180;
export const FRONTEND_PORT = 5180;
export const POSTGRES_CONTAINER = 'booksnap-postgres';
export const SCRIPTS_DIR = fileURLToPath(
  new URL('../../../../server/scripts/', import.meta.url),
);
