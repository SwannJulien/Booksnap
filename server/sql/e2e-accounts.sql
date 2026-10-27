CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE users SET role = 'admin'     WHERE email = 'alice.martin@example.com';
UPDATE users SET role = 'librarian' WHERE email = 'bob.johnson@example.com';
INSERT INTO auth_identity (user_id, provider, password_hash)
SELECT id, 'local', crypt(:'password', gen_salt('bf', 10))
FROM users
WHERE email IN ('alice.martin@example.com', 'bob.johnson@example.com', 'clara.dupont@example.com');
