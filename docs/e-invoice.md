# E-invoices

Since 2025 German businesses must be able to receive e-invoices; from 2027 the larger ones, and from
2028 all of them, have to send them. A ZUGFeRD invoice is both kinds at once: a PDF for people, with the invoice for machines
attached as XML. Schreibzeug reads them ([PDFs](pdf.md#e-invoices-zugferd)) and makes them from a
text document.

## Making one from a Word invoice

"Datei → Als E-Rechnung (ZUGFeRD) …" in the text editor opens a dialog with the invoice's data,
read from the document: number, dates, seller and recipient, the lines, the VAT rate, bank details.
The person checks and completes them; "E-Rechnung erstellen" downloads `<Name> (E-Rechnung).pdf`.

What happens, in `apps/web/src/editor/use-e-invoice.tsx`:

1. The document as it is now (`editor.save()`, the .docx) is read as text: `packages/ooxml`
   `docxContent` gives its paragraphs and tables, headers and footers included.
2. `packages/einvoice` `draftFromDocument` reads the invoice from that text, the way German
   invoices lay it out and Schreibzeug's invoice template has it (DIN 5008): the sender's line
   above the address field is the seller, the address field the recipient, "Rechnungsnummer",
   "Rechnungsdatum", "Leistungszeitraum" and "bis zum …" the details, the first table with a
   description and a price column the lines (without its rows of sums), "Umsatzsteuer 19 %" the
   rate (and "§ 19 UStG" a small business without VAT), "Steuernummer", "USt-IdNr.", "IBAN" and
   "BIC" in the footer the seller's. A template's placeholders ("[Nr.]") count as empty. Nothing is
   guessed: what is not found stays empty for the dialog.
3. The dialog (`e-invoice-dialog.tsx`) shows that as a form and computes the sums as the XML will
   have them. If the document states a total ("Rechnungsbetrag") that differs from what the lines
   add up to, it says so: the e-invoice contains the lines as they are in the dialog, and a
   recipient's software checks the XML, not the page. `draftProblems` names what an EN 16931
   invoice needs and is missing before anything is made. The seller's details can be remembered in
   the browser (localStorage) for the next invoice.
4. `facturXml` writes the invoice as Factur-X / ZUGFeRD 2 in the EN 16931 profile ("COMFORT"):
   UN/CEFACT CII D16B, the amounts computed in cents as integers, the VAT once per rate from its base
   (BR-CO-17). Regular VAT is category S (Z at 0 %); a small business is E with the exemption reason
   § 19 UStG requires, and its Steuernummer becomes the seller's ID where there is no VAT ID
   (BR-CO-26). Payment is a SEPA transfer (code 58) to the IBAN.
5. The document is exported as PDF/A ([PDF/A](pdf.md#pdfa)), and `zugferdPdf` makes it a ZUGFeRD
   invoice with pdf-lib: `factur-x.xml` attached with `/AFRelationship /Alternative` and listed in
   the catalog's `/AF`, the XMP metadata rewritten to PDF/A-3 with the Factur-X properties
   (`fx:DocumentType` INVOICE, `fx:ConformanceLevel` EN 16931) and the PDF/A extension schema that
   declares them, unfiltered, and the Info dictionary to match it. Producer and creator are
   "Schreibzeug".

Not yet: credit notes and corrections (a negative total is refused), allowances and charges (a
line with a negative price, which BR-27 forbids, is refused),
prepayments, currencies other than the euro, XRechnung (the CIUS for public buyers, which also
needs the seller's contact and a Leitweg-ID) and UBL. Those are what Haben, the accounting app,
writes; Schreibzeug turns a document into an invoice.

## Checked against the rules

When this was written, the XML was checked against the CII schema and the EN 16931 business rules of
the CEN validation artefacts (ConnectingEurope/eInvoicing-EN16931: `cii/schema`,
`cii/xslt/EN16931-CII-validation.xslt`, run with SaxonJS): the sample invoice of
`packages/einvoice/test` with regular VAT at two rates, as a small business, with a single day of
service, without a bank account, with a 0 % line and a note, and the invoice the E2E test makes
passed without a failed assertion. In CI, the job `einvoice` runs the validator of Mustang
(ZUGFeRD/mustangproject, the open-source ZUGFeRD library) on the PDF `e2e/e-invoice.spec.ts` makes:
XML schema and rules, and the PDF/A-3 with veraPDF.

## Tests

`packages/einvoice/test`: the sums and their rounding, the XML read back with the reader, the checks,
the reading of documents (the filled-in template, an invoice of a small business with its bank in the
footer, a document that is no invoice), German numbers and dates, and the ZUGFeRD PDF (attachment,
`/AF`, XMP, Info). `packages/ooxml/test/docx-text.test.ts`: paragraphs, tables, nested tables,
deleted text, headers and footers. `e2e/e-invoice.spec.ts` opens `test-files/rechnung.docx` (the
invoice template filled in), checks what the dialog read, completes it, downloads the invoice and
reads it back; a second test opens a document that is no invoice and checks what the dialog says
is missing.
