/**
 * Maps and transforms form data from book forms to API-ready format
 */
export function mapBookFormData(formData) {
  const data = { ...formData };

  // Transform authors from comma-separated string to array
  if (data.authors) {
    data.authors = data.authors.split(',').map(a => a.trim());
  } else {
    data.authors = null;
  }

  // Transform genres from comma-separated string to array
  if (data.genres) {
    data.genres = data.genres.split(',').map(g => g.trim());
  } else {
    data.genres = null;
  }

  // Parse number of pages to integer
  if (data.numberOfPages) {
    data.numberOfPages = parseInt(data.numberOfPages, 10);
  } else {
    data.numberOfPages = null;
  }

  // Keep publishing year as string
  if (data.publishingYear) {
    data.publishingYear = String(data.publishingYear);
  } else {
    data.publishingYear = null;
  }

  // Convert isFiction from string to boolean
  if (data.isFiction === 'true') {
    data.isFiction = true;
  } else if (data.isFiction === 'false') {
    data.isFiction = false;
  } else {
    data.isFiction = null;
  }

  if (!data.yearRecommendation) {
    data.yearRecommendation = null;
  }

  // Handle empty publisher
  if (!data.publisher) {
    data.publisher = null;
  }

  // Transform ISBN to isbn10 or isbn13 based on length
  // Handle the case where we have a single isbn field OR both isbn10/isbn13 already set
  if (data.isbn) {
    if (data.isbn.length === 10) {
      // Only override isbn10 if not already set (e.g., from OpenLibrary)
      if (!data.isbn10) {
        data.isbn10 = data.isbn;
      }
      delete data.isbn;
    } else if (data.isbn.length === 13) {
      // Only override isbn13 if not already set (e.g., from OpenLibrary)
      if (!data.isbn13) {
        data.isbn13 = data.isbn;
      }
      delete data.isbn;
    } else {
      data.isbn = undefined;
    }
  }

  // Ensure both fields exist (null if not provided)
  if (!data.isbn10) {
    data.isbn10 = null;
  }
  if (!data.isbn13) {
    data.isbn13 = null;
  }

  return data;
}
