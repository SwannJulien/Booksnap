package net.booksnap.exception.copy;

import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.hold.Hold;
import net.booksnap.exception.common.StudentNames;

import java.util.List;
import java.util.stream.Collectors;

public class CopyHasActiveLoanOrHoldException extends RuntimeException {

    public CopyHasActiveLoanOrHoldException(Copy copy, List<Borrowing> loans, List<Hold> holds) {
        super(buildMessage(copy, loans, holds));
    }

    private static String buildMessage(Copy copy, List<Borrowing> loans, List<Hold> holds) {
        StringBuilder message = new StringBuilder("This copy of \"")
                .append(copy.getBook().getTitle())
                .append("\" cannot be deleted: ");

        if (!loans.isEmpty()) {
            message.append("it is currently borrowed by ").append(borrowers(loans));
        }

        if (!loans.isEmpty() && !holds.isEmpty()) {
            message.append(", and ");
        }

        if (!holds.isEmpty()) {
            message.append("it is set aside for ").append(holders(holds));
        }

        return message.append(". ").append(action(loans, holds)).toString();
    }

    private static String borrowers(List<Borrowing> loans) {
        return StudentNames.joined(loans.stream().map(Borrowing::getUser).collect(Collectors.toList()));
    }

    private static String holders(List<Hold> holds) {
        return StudentNames.joined(holds.stream().map(Hold::getUser).collect(Collectors.toList()));
    }

    private static String action(List<Borrowing> loans, List<Hold> holds) {
        if (!loans.isEmpty() && !holds.isEmpty()) {
            return "Take the return and cancel the hold before deleting it.";
        }
        if (!loans.isEmpty()) {
            return "Take the return before deleting it.";
        }
        return "Cancel the hold before deleting it.";
    }
}
