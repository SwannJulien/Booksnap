# Booksnap

## Highlights

Booksnap is a library management web application designed for small and medium-sized
libraries.

1. **Built-in scanner**: scan a copy's QR code to lend or return it, or scan a book's
   barcode to add it to the catalog.
2. **Open Library integration**: scan an ISBN barcode and the book's details (title,
   authors, publisher, number of pages, cover…) are filled in automatically.
3. **Catalog**: search and filter books, classify them with the Dewey Decimal System and
   genres, and upload custom covers.
4. **Copy management**: track each physical copy and its status (available, borrowed,
   on hold, damaged, lost) and print its QR code label.
5. **Loans and returns**: lend a copy to a user in a few taps, record returns, and
   automatically flag overdue loans every night.
6. **Holds**: users can reserve a book when every copy is out. Holds are queued in order,
   and the next available copy is set aside for one week.
7. **User management**: role-based access (admin, librarian, user), with secure
   email/password sign-in and an audit trail of who changed what.
8. **Mobile-friendly**: every screen adapts to phones and tablets.

## Tech stack

- **Backend**: Java 17, Spring Boot 3, Spring Security, Flyway
- **Database**: PostgreSQL 16
- **Frontend**: Lit web components, Vite

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose
- Java 17 and a Java IDE (IntelliJ IDEA, VS Code…)
- Node.js and npm

### 1. Configure the environment

```bash
cp .env.example .env
cp .env.example server/.env
```

- The root `.env` is used by Docker Compose.
- `server/.env` is used by the backend when you run it from your IDE. Set
  `DB_HOST=localhost` in it.

Replace every `changeme_…` password with your own value. Never commit either file.

### 2. Start the database

```bash
docker compose up -d db
```

pgAdmin is also available if you need a database UI: `docker compose up -d pgadmin`, then
open <http://localhost:5050>.

### 3. Create the first administrator

Creating accounts requires an administrator, so a fresh installation creates the first
one at startup. Fill these in `server/.env`:

```
BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL=firstname.lastname@example.com
BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD=<at least 12 characters>
BOOKSNAP_BOOTSTRAP_ADMIN_FIRST_NAME=Firstname
BOOKSNAP_BOOTSTRAP_ADMIN_LAST_NAME=Lastname
```

Once you have signed in and changed the password, empty these values again. See
[server/README.md](server/README.md) for details.

### 4. Start the backend

Run `net.booksnap.BooksnapApplication` from your IDE, with `server/` as the working
directory. The API listens on <http://localhost:8080>.

On the first start, Flyway creates the database schema and loads the Dewey reference
data.

### 5. (Optional) Load development data

Once the backend has started at least once, you can load sample books, copies and covers:

```bash
server/scripts/load-dev-fixtures.sh
```

To start again from a clean dataset later, use `server/scripts/reset-dev-db.sh`.

### 6. Start the frontend

```bash
cd web
npm install
npm run dev
```

Open <http://localhost:3000>. API calls are proxied to the backend, so leave
`VITE_API_BASE_URL` empty.

### Running everything with Docker

You can also run the whole stack in containers:

```bash
docker compose up --build
```

The frontend is then available on <http://localhost:3000> and the API on
<http://localhost:8080>. The bootstrap admin variables must be set in the root `.env` in
this case. Development data can be loaded the same way, once the backend container has
started.

## API testing

A [Bruno](https://www.usebruno.com/) collection covering every endpoint lives in
`server/API/`.

## License

See [LICENSE](LICENSE).
