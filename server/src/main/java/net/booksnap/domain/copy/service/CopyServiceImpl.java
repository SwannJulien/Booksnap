package net.booksnap.domain.copy.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.book.repository.BookRepository;
import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.borrowing.repository.BorrowingRepository;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.api.dto.CreateCopyRequest;
import net.booksnap.domain.copy.api.dto.CreateCopyResponse;
import net.booksnap.domain.copy.api.dto.UpdateCopyRequest;
import net.booksnap.domain.copy.api.dto.CopyResponse;
import net.booksnap.domain.copy.mapper.CopyApiMapper;
import net.booksnap.domain.copy.repository.CopyRepository;
import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.repository.HoldRepository;
import net.booksnap.exception.book.BookNotFoundException;
import net.booksnap.exception.copy.CopyHasActiveLoanOrHoldException;
import net.booksnap.exception.copy.CopyNotFoundException;
import net.booksnap.domain.library.Library;
import net.booksnap.utils.qr.QRCodeService;
import net.booksnap.utils.Utils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class CopyServiceImpl implements CopyService {

    private final CopyRepository copyRepository;
    private final BookRepository bookRepository;
    private final BorrowingRepository borrowingRepository;
    private final HoldRepository holdRepository;
    private final QRCodeService qrCodeService;
    private final CopyApiMapper copyApiMapper;
    private final Utils utils;

    public CopyServiceImpl(CopyRepository copyRepository,
                           BookRepository bookRepository,
                           BorrowingRepository borrowingRepository,
                           HoldRepository holdRepository,
                           QRCodeService qrCodeService,
                           CopyApiMapper copyApiMapper,
                           Utils utils) {
        this.copyRepository = copyRepository;
        this.bookRepository = bookRepository;
        this.borrowingRepository = borrowingRepository;
        this.holdRepository = holdRepository;
        this.qrCodeService = qrCodeService;
        this.copyApiMapper = copyApiMapper;
        this.utils = utils;
    }

    public CreateCopyResponse createCopy(CreateCopyRequest createCopyRequest) {
        Book book = bookRepository.findByIdAndDeletedAtIsNull(createCopyRequest.bookId())
            .orElseThrow(() -> new BookNotFoundException(createCopyRequest.bookId()));

        Copy copy = new Copy();
        copy.setBook(book);
        copy.setLibrary(new Library(createCopyRequest.libraryId(), null));
        copy.setStatus(createCopyRequest.status());
        copy.setSectionName(createCopyRequest.sectionName());

        // Generate identification code from section name and first author's surname
        // Extract author names from the book's authors
        String identificationCode = createIdentificationCode(book, createCopyRequest.sectionName());
        copy.setIdentificationCode(identificationCode);

        Copy savedCopy = copyRepository.save(copy);

        // Generate QR code image
        byte[] qrCode = qrCodeService.generateCopyQRCode(savedCopy);

        return new CreateCopyResponse(
            qrCode,
            savedCopy.getIdentificationCode(),
            savedCopy.getId(),
            book.getId()
        );
    }

    private String createIdentificationCode(Book book, String sectionName) {
        List<String> authorNames = book.getAuthors().stream()
            .map(author -> author.getName())
            .toList();
        String identificationCode = qrCodeService.generateIdentificationCode(
                sectionName,
            authorNames
        );
        return identificationCode;
    }

    public byte[] generateQRCodeImage(Long copyId) {
        Copy copy = findCopyEntityById(copyId);
        return qrCodeService.generateCopyQRCode(copy);
    }

    public Object findCopyById(Long copyId, String fields) {
        Copy copy = copyRepository.findByIdAndDeletedAtIsNull(copyId)
            .orElseThrow(() -> new CopyNotFoundException(copyId));
        CopyResponse copyResponse = copyApiMapper.copyToResponse(copy);


        if (fields == null || fields.trim().isEmpty()) {
            return copyResponse;
        }
        
        try {
            return utils.filterFields(copyResponse, fields);
        } catch (Exception e) {
            throw new RuntimeException("Error filtering fields: " + e.getMessage(), e);
        }
    }

    public Copy findCopyEntityById(Long copyId) {
        return copyRepository.findByIdAndDeletedAtIsNull(copyId)
            .orElseThrow(() -> new CopyNotFoundException(copyId));
    }

    // Transactional: stamping a date violates no foreign key, so a loan created between
    // the check and the write would leave a copy both deleted and borrowed.
    // status is left to the triggers.
    @Transactional
    public void deleteCopyById(Long copyId) {
        Copy copy = copyRepository.findByIdAndDeletedAtIsNull(copyId)
            .orElseThrow(() -> new CopyNotFoundException(copyId));

        List<Borrowing> activeLoans = borrowingRepository.findByCopyIdAndStatusInOrderByEndDateAsc(
                copyId, net.booksnap.domain.borrowing.Status.ACTIVE);
        List<Hold> activeHolds = holdRepository.findByCopyIdAndStatusInOrderByCreatedDateAsc(
                copyId, net.booksnap.domain.hold.Status.ACTIVE);

        if (!activeLoans.isEmpty() || !activeHolds.isEmpty()) {
            throw new CopyHasActiveLoanOrHoldException(copy, activeLoans, activeHolds);
        }

        copy.setDeletedAt(LocalDateTime.now());
        copyRepository.save(copy);
    }

    public void updateCopy(Long copyId, UpdateCopyRequest request) {
        Copy existingCopy = copyRepository.findByIdAndDeletedAtIsNull(copyId)
            .orElseThrow(() -> new CopyNotFoundException(copyId));

        if (request.libraryId() != null) {
            existingCopy.setLibrary(new Library(request.libraryId(), null));
        }

        // Update section name and regenerate identification code if section name is provided
        if (request.sectionName() != null && !request.sectionName().isBlank()) {
            existingCopy.setSectionName(request.sectionName());
            String identificationCode = createIdentificationCode(existingCopy.getBook(), request.sectionName());
            existingCopy.setIdentificationCode(identificationCode);
        }

        if (request.status() != null) {
            existingCopy.setStatus(request.status());
        }

        copyRepository.save(existingCopy);
    }
}