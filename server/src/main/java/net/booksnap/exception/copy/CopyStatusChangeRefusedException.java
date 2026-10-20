package net.booksnap.exception.copy;

import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.hold.Hold;
import net.booksnap.exception.common.BlockingBorrowing;
import net.booksnap.exception.common.BlockingHold;
import net.booksnap.exception.common.StudentNames;

import java.util.List;
import java.util.stream.Collectors;

public class CopyStatusChangeRefusedException extends RuntimeException {

    private final List<BlockingBorrowing> activeBorrowings;
    private final List<BlockingHold> activeHolds;

    public CopyStatusChangeRefusedException(Copy copy, Status target, List<Borrowing> loans, List<Hold> holds) {
        super(buildMessage(copy, target, loans, holds));
        // Converted here, inside the transaction that refused: the handler runs after the rollback, on detached entities
        this.activeBorrowings = loans.stream().map(BlockingBorrowing::from).toList();
        this.activeHolds = holds.stream().map(BlockingHold::from).toList();
    }

    public List<BlockingBorrowing> getActiveBorrowings() {
        return activeBorrowings;
    }

    public List<BlockingHold> getActiveHolds() {
        return activeHolds;
    }

    private static String buildMessage(Copy copy, Status target, List<Borrowing> loans, List<Hold> holds) {
        Status current = copy.getStatus();
        String transition = "This copy of \"" + copy.getBook().getTitle() + "\" cannot go from "
                + label(current) + " to " + label(target);

        if (current == Status.borrowed) {
            String borrowers = StudentNames.joined(loans.stream().map(Borrowing::getUser).collect(Collectors.toList()));
            return transition + ": it is currently borrowed" + (borrowers.isEmpty() ? "" : " by " + borrowers)
                    + ". Record its return first" + (target == Status.lost ? ", then declare it lost." : ".");
        }

        if (current == Status.on_hold) {
            String holders = StudentNames.joined(holds.stream().map(Hold::getUser).collect(Collectors.toList()));
            return transition + ": it is set aside for a hold" + (holders.isEmpty() ? "" : " by " + holders)
                    + ". Wait until the hold is collected or has expired"
                    + (target == Status.lost ? ", then declare it lost." : ".");
        }

        return transition + ".";
    }

    private static String label(Status status) {
        return status.name().replace('_', ' ');
    }
}
