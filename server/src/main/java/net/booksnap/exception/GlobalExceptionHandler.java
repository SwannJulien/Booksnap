package net.booksnap.exception;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import net.booksnap.exception.auth.InvalidCurrentPasswordException;
import net.booksnap.exception.auth.NoLocalIdentityException;
import net.booksnap.exception.auth.PasswordRejectedException;
import net.booksnap.exception.book.BookAlreadyExistsException;
import net.booksnap.exception.book.BookNotFoundException;
import net.booksnap.exception.borrowing.BorrowingAlreadyReturnedException;
import net.booksnap.exception.borrowing.BorrowingNotFoundException;
import net.booksnap.exception.common.BadRequestException;
import net.booksnap.exception.copy.CopyNotAvailableException;
import net.booksnap.exception.copy.CopyNotFoundException;
import net.booksnap.exception.cover.CoverNotFoundException;
import net.booksnap.exception.dewey.DeweyCodeNotFoundException;
import net.booksnap.exception.dewey.FictionBookHasDeweyCodeException;
import net.booksnap.exception.hold.BookHasAvailableCopyException;
import net.booksnap.exception.hold.HoldAlreadyExistsException;
import net.booksnap.exception.user.UserNotFoundException;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import java.time.LocalDateTime;
import java.util.stream.Collectors;

@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgumentException(IllegalArgumentException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI());
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }

    /**
     * Declared before the catch-all: without it, a failed login would leave the
     * controller as a plain exception and come back as a 500 reading "Bad credentials".
     * The message is fixed and never {@code ex.getMessage()} — unknown email, wrong
     * password, disabled account and missing local identity must be indistinguishable
     * from the outside. The cause is logged instead, since support has nothing else.
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiError> handleAuthenticationException(AuthenticationException ex, HttpServletRequest request) {
        log.info("Authentication failed on {}: {}", request.getRequestURI(), ex.getMessage());
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.UNAUTHORIZED.value(),
                "Invalid email or password",
                request.getRequestURI());
        return new ResponseEntity<>(error, HttpStatus.UNAUTHORIZED);
    }

    /**
     * A body the parser could not read. Answered 400 — a malformed request is the
     * caller's mistake, not a server fault — and, above all, without quoting it.
     *
     * <p>This handler exists for what it refuses to say. Jackson names the token it choked
     * on, so a login sent as <code>{"password": hunter2}</code> — one missing pair of
     * quotes — raises "Unrecognized token 'hunter2'". Before this, that went to the
     * catch-all below, which copied the message into the response: the password came back
     * to the caller in a 500 body, and would have gone to any proxy or log that keeps
     * them. The same request against {@code /api/v1/auth/password} returned the account's
     * current password.
     *
     * <p>Nothing is logged beyond the path, for that same reason — the message and the
     * stack trace both carry the token.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException ex, HttpServletRequest request) {
        log.info("Malformed request body on {}", request.getRequestURI());
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                "Malformed request body",
                request.getRequestURI());
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }

    /**
     * Logged in full, answered in general terms.
     *
     * <p>An exception message is written for whoever reads the logs, and routinely quotes
     * the input that caused the failure. Handing it back to the caller publishes whatever
     * the failing code happened to be holding — which is how a JSON syntax error became a
     * way of reading back a password. The stack trace goes to the log, where it is useful
     * and not world-readable.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneralException(Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception on {}", request.getRequestURI(), ex);
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal server error",
                request.getRequestURI());
        return new ResponseEntity<>(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidationExceptions(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(DefaultMessageSourceResolvable::getDefaultMessage)
                .collect(Collectors.joining("; "));

        ApiError apiError = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                message,
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiError, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(FictionBookHasDeweyCodeException.class)
    public ResponseEntity<ApiError> handleFictionBookHasDeweyCode(FictionBookHasDeweyCodeException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI());
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(DeweyCodeNotFoundException.class)
    public ResponseEntity<ApiError> handleDeweyCodeNotFound(DeweyCodeNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(BookNotFoundException.class)
    public ResponseEntity<ApiError> handleBookNotFound(BookNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(BookAlreadyExistsException.class)
    public ResponseEntity<BookConflictError> handleBookAlreadyExists(BookAlreadyExistsException ex, HttpServletRequest request) {
        BookConflictError error = new BookConflictError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI(),
                ex.getBookId()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(CopyNotFoundException.class)
    public ResponseEntity<ApiError> handleCopyNotFound(CopyNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(CoverNotFoundException.class)
    public ResponseEntity<ApiError> handleCoverNotFound(CoverNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(CopyNotAvailableException.class)
    public ResponseEntity<ApiError> handleCopyNotAvailable(CopyNotAvailableException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(HoldAlreadyExistsException.class)
    public ResponseEntity<ApiError> handleHoldAlreadyExists(HoldAlreadyExistsException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(BookHasAvailableCopyException.class)
    public ResponseEntity<ApiError> handleBookHasAvailableCopy(BookHasAvailableCopyException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(BorrowingNotFoundException.class)
    public ResponseEntity<ApiError> handleBorrowingNotFound(BorrowingNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(BorrowingAlreadyReturnedException.class)
    public ResponseEntity<ApiError> handleBorrowingAlreadyReturned(BorrowingAlreadyReturnedException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ApiError> handleUserNotFound(UserNotFoundException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }

    /**
     * A 400 and not a 401: the session is valid, only the confirmation failed. Answering
     * 401 would tell the front end to send the user back to the login page after a typo.
     */
    @ExceptionHandler(InvalidCurrentPasswordException.class)
    public ResponseEntity<ApiError> handleInvalidCurrentPassword(InvalidCurrentPasswordException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }

    /**
     * Carries the unmet rule as its message, which the form shows as is. That is the whole
     * point of the exception: a fixed message would leave the user changing one thing at a
     * time until something is accepted.
     */
    @ExceptionHandler(PasswordRejectedException.class)
    public ResponseEntity<ApiError> handlePasswordRejected(PasswordRejectedException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(NoLocalIdentityException.class)
    public ResponseEntity<ApiError> handleNoLocalIdentity(NoLocalIdentityException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiError> handleBadRequest(BadRequestException ex, HttpServletRequest request) {
        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
    }


}
