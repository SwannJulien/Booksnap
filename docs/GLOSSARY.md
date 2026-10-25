# BookSnap

Vocabulary of the school library app: the words the specifications, plans and
code reviews use, each with one meaning.

## Language

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
