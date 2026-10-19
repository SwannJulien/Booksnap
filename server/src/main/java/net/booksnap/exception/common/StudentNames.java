package net.booksnap.exception.common;

import net.booksnap.domain.user.User;

import java.util.List;

public final class StudentNames {

    private static final int MAX_NAMED = 3;

    private StudentNames() {
    }

    public static String joined(List<User> students) {
        List<String> names = students.stream()
                .map(student -> student.getFirstName() + " " + student.getLastName())
                .distinct()
                .toList();

        if (names.isEmpty()) {
            return "";
        }

        if (names.size() > MAX_NAMED) {
            int others = names.size() - MAX_NAMED;
            return String.join(", ", names.subList(0, MAX_NAMED))
                    + " and " + others + (others > 1 ? " others" : " other");
        }

        if (names.size() == 1) {
            return names.get(0);
        }

        return String.join(", ", names.subList(0, names.size() - 1))
                + " and " + names.get(names.size() - 1);
    }
}
