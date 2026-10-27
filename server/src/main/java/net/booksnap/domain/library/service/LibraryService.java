package net.booksnap.domain.library.service;

import net.booksnap.domain.library.api.dto.LibraryNameRequest;
import net.booksnap.domain.library.api.dto.LibraryResponse;
import net.booksnap.domain.library.api.dto.LoanRulesRequest;
import net.booksnap.domain.library.api.dto.LoanRulesResponse;

import java.util.List;

public interface LibraryService {
    List<LibraryResponse> findAll();

    LibraryResponse create(LibraryNameRequest request);

    LibraryResponse rename(Long id, LibraryNameRequest request);

    List<LoanRulesResponse> findAllLoanRules();

    LoanRulesResponse updateLoanRules(Long id, LoanRulesRequest request);
}
