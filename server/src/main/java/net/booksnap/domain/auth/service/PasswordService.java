package net.booksnap.domain.auth.service;

public interface PasswordService {

    /**
     * Replaces the password of the {@code local} identity of {@code userId}.
     *
     * @param userId          the account to act on — always the one the session names,
     *                        never a value read from a request body
     * @param currentPassword the password in use, confirmed before anything is written
     * @param newPassword     the replacement, checked against {@link PasswordPolicy}
     */
    void changePassword(Long userId, String currentPassword, String newPassword);
}
