import { LitElement, html } from 'lit';
import { scanQrcodeView } from './scan-qrcode-view-styles.js';
import { sharedStyles } from '../../shared-styles.js';
import { getBorrowingByCopyId } from '../../api/borrowing.js';
import '../../features/scanner/barcode-scanner-bks/barcode-scanner-bks.js';
import '../../features/borrowing/loan-modal-bks/loan-modal-bks.js';
import '../../features/borrowing/return-modal-bks/return-modal-bks.js';
import '../../features/copy/copy-status-modal-bks/copy-status-modal-bks.js';

// QR content format: COPY:{copyId}:LIB:{libraryId}:BOOK:{bookId}:CHK:{checksum}
function extractCopyId(code) {
  const parts = code?.split(':') ?? [];
  if (parts[0] === 'COPY' && parts[1]) {
    return parts[1];
  }
  return null;
}

export class ScanQrcodeView extends LitElement {
  static styles = [sharedStyles, scanQrcodeView];

  static properties = {
    _scannedCode: { type: String, state: true },
    _copyId: { type: String, state: true },
    _copyToLend: { type: Object, state: true },
    _borrowingToReturn: { type: Object, state: true },
    _lostCopy: { type: Object, state: true },
  };

  constructor() {
    super();
    this._scannedCode = null;
    this._copyId = null;
    this._copyToLend = null;
    this._borrowingToReturn = null;
    this._lostCopy = null;
  }

  _handleScanResult(e) {
    this._scannedCode = e.detail.code;
    this._copyId = extractCopyId(this._scannedCode);

    if (this._copyId) {
      this._checkBorrowing(this._copyId);
    } else {
      console.log(`Unrecognized QR code: ${this._scannedCode}`);
    }
  }

  async _checkBorrowing(copyId) {
    try {
      const result = await getBorrowingByCopyId(copyId);
      if (!result) {
        console.log(`Copy ${copyId} not found`);
        return;
      }
      if (result.borrowing) {
        // The copy is out: scanning it at the desk is the student bringing it back
        const { id, firstName, lastName } = result.borrowing;
        this._borrowingToReturn = {
          id,
          bookTitle: result.bookTitle,
          studentName: `${firstName} ${lastName}`,
        };
      } else if (result.copyStatus === 'available') {
        this._copyToLend = { copyId, bookTitle: result.bookTitle };
      } else if (result.copyStatus === 'on_hold' && result.hold) {
        // Set aside for one student: scanning it at the desk is them collecting it,
        // which turns the hold into a loan
        this._copyToLend = {
          copyId,
          bookTitle: result.bookTitle,
          hold: result.hold,
        };
      } else if (result.copyStatus === 'lost') {
        // Found again: ask whether to put it back on the shelf, never decide for the librarian
        this._lostCopy = {
          id: copyId,
          status: 'lost',
          bookTitle: result.bookTitle,
        };
      } else {
        console.log(
          `Copy ${copyId} is not borrowed (status: ${result.copyStatus})`,
        );
      }
    } catch (error) {
      console.error(`Failed to check borrowing for copy ${copyId}:`, error);
    }
  }

  _handleLoanModalClose() {
    this._copyToLend = null;
  }

  _handleReturnModalClose() {
    this._borrowingToReturn = null;
  }

  _handleCopyStatusModalClose() {
    this._lostCopy = null;
  }

  // A copy set aside for a student keeps the modal open so the librarian can read who it is for
  _handleCopyStatusChanged(e) {
    if (!e.detail.setAside) {
      this._lostCopy = null;
    }
  }

  render() {
    return html`
      <barcode-scanner-bks
        autoStart
        mode="qr"
        @sendBarcode=${this._handleScanResult}
      ></barcode-scanner-bks>
      <loan-modal-bks
        ?open=${!!this._copyToLend}
        .copyId=${this._copyToLend?.copyId}
        .bookTitle=${this._copyToLend?.bookTitle}
        .hold=${this._copyToLend?.hold ?? null}
        @modal-close=${this._handleLoanModalClose}
      ></loan-modal-bks>
      <return-modal-bks
        ?open=${!!this._borrowingToReturn}
        .borrowingId=${this._borrowingToReturn?.id}
        .bookTitle=${this._borrowingToReturn?.bookTitle ?? ''}
        .studentName=${this._borrowingToReturn?.studentName ?? ''}
        @modal-close=${this._handleReturnModalClose}
      ></return-modal-bks>
      <copy-status-modal-bks
        ?open=${!!this._lostCopy}
        .copy=${this._lostCopy}
        @modal-close=${this._handleCopyStatusModalClose}
        @copy-status-changed=${this._handleCopyStatusChanged}
      ></copy-status-modal-bks>
    `;
  }
}

customElements.define('scan-qrcode-view', ScanQrcodeView);
