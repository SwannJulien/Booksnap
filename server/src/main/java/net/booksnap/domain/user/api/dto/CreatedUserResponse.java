package net.booksnap.domain.user.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CreatedUserResponse(@JsonUnwrapped UserResponse account, String temporaryPassword) {

    // The default record toString() would put the temporary password in any log line that prints this.
    @Override
    public String toString() {
        return "CreatedUserResponse[account=" + account + "]";
    }
}
