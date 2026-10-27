package net.booksnap.domain.copy.mapper;

import net.booksnap.domain.book.api.dto.BookDTO;
import net.booksnap.domain.common.dto.AuditDTO;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.api.dto.CopyResponse;
import net.booksnap.domain.copy.api.dto.SectionDTO;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.copy.api.dto.CreateCopyRequest;
import net.booksnap.domain.library.api.dto.LibraryDTO;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public abstract class CopyApiMapper {

    @Mapping(target = "library", expression = "java(mapLibrary(copy.getLibrary()))")
    @Mapping(target = "book", expression = "java(mapBook(copy.getBook()))")
    @Mapping(target = "section", expression = "java(mapSection(copy))")
    @Mapping(target = "audit", expression = "java(mapAuditToDTO(copy))")
    public abstract CopyResponse copyToResponse(Copy copy);

    protected SectionDTO mapSection(Copy copy) {
        if (copy == null) {
            return null;
        }
        return new SectionDTO(copy.getIdentificationCode(), copy.getSectionName());
    }

    protected LibraryDTO mapLibrary(net.booksnap.domain.library.Library library) {
        if (library == null) {
            return null;
        }
        return new LibraryDTO(library.getId(), library.getName());
    }

    protected BookDTO mapBook(net.booksnap.domain.book.Book book) {
        if (book == null) {
            return null;
        }
        return new BookDTO(book.getId(), book.getTitle());
    }

    protected AuditDTO mapAuditToDTO(Copy copy) {
        return new AuditDTO(
                copy.getCreatedBy(),
                copy.getCreatedDate(),
                copy.getLastModifiedBy(),
                copy.getLastModifiedDate()
        );
    }

    @Mapping(target = "bookTitle", source = "book.title")
    @Mapping(target = "bookId", source = "book.id")
    @Mapping(target = "libraryName", source = "library.name")
    @Mapping(target = "libraryId", source = "library.id")
    @Mapping(target = "sectionName", source = "sectionName")
    public abstract CreateCopyRequest copyToDTO(Copy copy);

    // Convert CreateCopyRequest to Copy entity
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "book", ignore = true)
    @Mapping(target = "library", ignore = true)
    @Mapping(target = "lastModifiedDate", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "status", expression = "java(mapStatus(request.status()))")
    public abstract Copy createRequestToCopy(CreateCopyRequest request);

    protected Status mapStatus(Status requestStatus) {
        return requestStatus != null ? requestStatus : Status.available;
    }
}