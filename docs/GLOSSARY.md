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

**Copy**:
One physical exemplar of a book. Every copy belongs to exactly one library; a
book itself belongs to none.
_Avoid_: item, exemplar, "the library's book" (when one copy is meant)
_In code_: `copy`

### Lending

**Loan**:
One copy lent to one student, from the day it is lent to the day it is
returned. Its due date is fixed when it is created.
_Avoid_: checkout, emprunt (in English text)
_In code_: `borrowing`

**Hold**:
A student's place in the queue for a book at one library — the library of the
copy it was placed from. It is served by whichever copy of that book in that
library comes back first.
_Avoid_: reservation, booking
_In code_: `hold`

**Borrowing duration**:
The number of days a library lends a copy for; it sets a loan's due date.
_Avoid_: loan period, lending time
_In code_: `borrowing duration` (formerly the constant `BORROWING_DURATION_WEEKS`)

**Pickup window**:
The number of days a copy set aside for a hold is kept for its student before
the hold expires.
_Avoid_: collection window, hold duration
_In code_: `pickup window` (formerly the constant `HOLD_PICKUP_WINDOW_WEEKS`)

**Loan rules**:
A library's borrowing duration and pickup window, taken together. Each library
has its own; there is no school-wide value.
_Avoid_: lending policy, parameters, global settings

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

### Settings

**Settings section**:
A titled block of the Settings page that groups what one kind of thing can be
configured (today only _Libraries_, shown to administrators). It has a heading
and, right under it, a one-line subtitle saying what can be configured there.
_Avoid_: sub-menu, tab, panel
_In code_: `<section>` rendered by the settings view (`library-section-bks` for _Libraries_)
