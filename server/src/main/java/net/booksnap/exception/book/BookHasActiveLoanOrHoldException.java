package net.booksnap.exception.book;

import net.booksnap.domain.book.Book;
import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.hold.Hold;
import net.booksnap.exception.common.StudentNames;

import java.util.List;
import java.util.stream.Collectors;

public class BookHasActiveLoanOrHoldException extends RuntimeException {

    public BookHasActiveLoanOrHoldException(Book book, List<Borrowing> loans, List<Hold> holds) {
        super(buildMessage(book, loans, holds));
    }

    private static String buildMessage(Book book, List<Borrowing> loans, List<Hold> holds) {
        StringBuilder message = new StringBuilder("\"")
                .append(book.getTitle())
                .append("\" cannot be deleted.");

        if (!loans.isEmpty() || !holds.isEmpty()) {
            message.append("\n");
        }

        if (loans.size() == 1) {
            message.append("One of its copies is currently borrowed by ").append(borrowers(loans));
        } else if (loans.size() > 1) {
            message.append(loans.size())
                    .append(" of its copies are currently borrowed by ")
                    .append(borrowers(loans));
        }

        if (!loans.isEmpty() && !holds.isEmpty()) {
            message.append(", and ");
        }

        if (holds.size() == 1) {
            message.append(holders(holds)).append(" is waiting for it");
        } else if (holds.size() > 1) {
            message.append(holds.size())
                    .append(" students are waiting for it (")
                    .append(holders(holds))
                    .append(")");
        }

        return message.append(". ").append("\n").append(action(loans, holds)).toString();
    }

    private static String borrowers(List<Borrowing> loans) {
        return StudentNames.joined(loans.stream().map(Borrowing::getUser).collect(Collectors.toList()));
    }

    private static String holders(List<Hold> holds) {
        return StudentNames.joined(holds.stream().map(Hold::getUser).collect(Collectors.toList()));
    }

    private static String action(List<Borrowing> loans, List<Hold> holds) {
        String returns = loans.size() > 1 ? "Take the returns" : "Take the return";
        String cancels = holds.size() > 1 ? "cancel the holds" : "cancel the hold";

        if (!loans.isEmpty() && !holds.isEmpty()) {
            return returns + " and " + cancels + " before deleting it.";
        }
        if (!loans.isEmpty()) {
            return returns + " before deleting it.";
        }
        return Character.toUpperCase(cancels.charAt(0)) + cancels.substring(1) + " before deleting it.";
    }
}
