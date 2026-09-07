package net.booksnap.domain.auth.service;

import lombok.Getter;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Getter
public class AuthenticatedUser implements UserDetails, CredentialsContainer {
    private final Long id;
    private final String email;
    private final String firstName;
    private final String lastName;
    private final Role role;
    private String passwordHash;   // not final: erased after authentication

    public AuthenticatedUser(User user, String passwordHash) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.firstName = user.getFirstName();
        this.lastName = user.getLastName();
        this.role = user.getRole();
        this.passwordHash = passwordHash;
    }


    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name().toUpperCase()));
    }

    @Override public void eraseCredentials() {
        this.passwordHash = null;
    }

    /**
     * Value equality on the account id, and it is load-bearing rather than tidy.
     *
     * <p>{@code SessionRegistry} keys its sessions by principal object, in a plain map.
     * Every session holds its own instance of this class — one per login, plus one per
     * deserialization — so identity equality would make "the sessions of this user" a
     * lookup that only ever finds the caller's own. US-008 relies on that lookup to end
     * the sessions of a user who has just changed their password; with the inherited
     * equality it reports success and ends nothing.
     *
     * <p>The id and not the email: an address can be corrected, and a principal that stops
     * matching the one registered at login strands its own sessions in the registry.
     */
    @Override
    public boolean equals(Object other) {
        return other instanceof AuthenticatedUser authenticatedUser && id.equals(authenticatedUser.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
