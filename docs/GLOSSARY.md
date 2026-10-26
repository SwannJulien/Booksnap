# BookSnap

Vocabulary of the school library app: the words the specifications, plans and
code reviews use, each with one meaning.

## Language

### Libraries

**Library**:
One site of the school that uses BookSnap. A library owns copies, holds,
students and librarians; it does not own books — a book is one record shared by
every library, and "a library's books" are the books with at least one copy
there. Created by an administrator only.
_Avoid_: site, branch, school
_In code_: `library`

### Lifecycle journal

**History**:
The ordered list of lifecycle journal events about one book or one copy,
oldest first. A book's history includes the events of all its copies, deleted
ones too; a copy's history holds only the events that name that copy.
_Avoid_: timeline, chronologie (in French documents, say _historique_)
_In code_: `history`

**Archive**:
The two lists of what has been deleted: deleted books, and copies deleted on
their own (not carried away by the deletion of their book).
_Avoid_: trash, recycle bin
_In code_: `archive`
