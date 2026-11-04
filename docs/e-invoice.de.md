# E-Rechnungen { #e-invoices }

Seit 2025 müssen deutsche Unternehmen E-Rechnungen empfangen können; ab 2027 müssen die größeren
und ab 2028 alle sie auch verschicken. Eine ZUGFeRD-Rechnung ist beides zugleich: ein PDF für
Menschen, mit der Rechnung für Maschinen als angehängtem XML. Schreibzeug liest sie
([PDFs](pdf.md#e-invoices-zugferd)) und erstellt sie aus einem Textdokument.

## Aus einer Word-Rechnung erstellen { #making-one-from-a-word-invoice }

„Datei → Als E-Rechnung (ZUGFeRD) …“ im Texteditor öffnet einen Dialog mit den Daten der Rechnung,
aus dem Dokument gelesen: Nummer, Daten, Verkäufer und Empfänger, die Positionen, der
Umsatzsteuersatz, die Bankverbindung. Die Person prüft und ergänzt sie; „E-Rechnung erstellen“ lädt
`<Name> (E-Rechnung).pdf` herunter.

Was geschieht, in `apps/web/src/editor/use-e-invoice.tsx`:

1. Das Dokument, wie es jetzt ist (`editor.save()`, die .docx), wird als Text gelesen:
   `packages/ooxml` `docxContent` liefert seine Absätze und Tabellen, mit Kopf- und Fußzeilen.
2. `packages/einvoice` `draftFromDocument` liest die Rechnung aus diesem Text, so wie deutsche
   Rechnungen sie anordnen und die Rechnungsvorlage von Schreibzeug sie hat (DIN 5008): Die
   Absenderzeile über dem Anschriftfeld ist der Verkäufer, das Anschriftfeld der Empfänger,
   „Rechnungsnummer“, „Rechnungsdatum“, „Leistungszeitraum“ und „bis zum …“ die Angaben, die erste
   Tabelle mit einer Beschreibungs- und einer Preisspalte die Positionen (ohne ihre Summenzeilen),
   „Umsatzsteuer 19 %“ der Satz (und „§ 19 UStG“ ein Kleinunternehmen ohne Umsatzsteuer),
   „Steuernummer“, „USt-IdNr.“, „IBAN“ und „BIC“ in der Fußzeile die des Verkäufers. Die Platzhalter
   einer Vorlage („[Nr.]“) zählen als leer. Nichts wird geraten: Was nicht gefunden wird, bleibt für
   den Dialog leer.
3. Der Dialog (`e-invoice-dialog.tsx`) zeigt das als Formular und berechnet die Summen so, wie das
   XML sie haben wird. Nennt das Dokument einen Gesamtbetrag („Rechnungsbetrag“), der von der Summe
   der Positionen abweicht, sagt er das: Die E-Rechnung enthält die Positionen so, wie sie im Dialog
   stehen, und die Software eines Empfängers prüft das XML, nicht die Seite. `draftProblems` nennt,
   was eine Rechnung nach EN 16931 braucht und was fehlt, bevor irgendetwas erstellt wird. Die
   Angaben des Verkäufers lassen sich für die nächste Rechnung im Browser merken (localStorage).
4. `facturXml` schreibt die Rechnung als Factur-X / ZUGFeRD 2 im Profil EN 16931 („COMFORT“):
   UN/CEFACT CII D16B, die Beträge in Cent als ganze Zahlen berechnet, die Umsatzsteuer einmal pro
   Satz aus ihrer Bemessungsgrundlage (BR-CO-17). Reguläre Umsatzsteuer ist Kategorie S (Z bei 0 %);
   ein Kleinunternehmen ist E mit dem Befreiungsgrund, den § 19 UStG verlangt, und seine
   Steuernummer wird zur Kennung des Verkäufers, wo es keine USt-IdNr. gibt (BR-CO-26). Die Zahlung
   ist eine SEPA-Überweisung (Code 58) auf die IBAN.
5. Das Dokument wird als PDF/A exportiert ([PDF/A](pdf.md#pdfa)), und `zugferdPdf` macht daraus mit
   pdf-lib eine ZUGFeRD-Rechnung: `factur-x.xml` angehängt mit `/AFRelationship /Alternative` und im
   `/AF` des Katalogs aufgeführt, die XMP-Metadaten auf PDF/A-3 umgeschrieben, mit den
   Factur-X-Eigenschaften (`fx:DocumentType` INVOICE, `fx:ConformanceLevel` EN 16931) und dem
   PDF/A-Erweiterungsschema, das sie deklariert, ungefiltert, und das Info-Dictionary passend dazu.
   Producer und Creator sind „Schreibzeug“.

Noch nicht: Gutschriften und Korrekturen (ein negativer Gesamtbetrag wird abgelehnt), Nachlässe und
Zuschläge (eine Position mit negativem Preis, die BR-27 verbietet, wird abgelehnt), Anzahlungen,
andere Währungen als der Euro, XRechnung (die CIUS für öffentliche Auftraggeber, die außerdem den
Kontakt des Verkäufers und eine Leitweg-ID braucht) und UBL. Das ist es, was Haben, die
Buchhaltungs-App, schreibt; Schreibzeug macht aus einem Dokument eine Rechnung.

## Gegen die Regeln geprüft { #checked-against-the-rules }

Als dies geschrieben wurde, wurde das XML gegen das CII-Schema und die Geschäftsregeln von EN 16931
aus den CEN-Validierungsartefakten geprüft (ConnectingEurope/eInvoicing-EN16931: `cii/schema`,
`cii/xslt/EN16931-CII-validation.xslt`, ausgeführt mit SaxonJS): Die Beispielrechnung aus
`packages/einvoice/test` mit regulärer Umsatzsteuer zu zwei Sätzen, als Kleinunternehmen, mit einem
einzigen Leistungstag, ohne Bankkonto, mit einer Position zu 0 % und einer Notiz, und die Rechnung,
die der E2E-Test erstellt, bestanden ohne eine fehlgeschlagene Assertion. In der CI führt der Job
`einvoice` den Validator von Mustang (ZUGFeRD/mustangproject, die Open-Source-Bibliothek für
ZUGFeRD) auf dem PDF aus, das `e2e/e-invoice.spec.ts` erstellt: XML-Schema und Regeln und das
PDF/A-3 mit veraPDF.

## Tests { #tests }

`packages/einvoice/test`: die Summen und ihre Rundung, das XML, mit dem Reader zurückgelesen, die
Prüfungen, das Lesen von Dokumenten (die ausgefüllte Vorlage, eine Rechnung eines
Kleinunternehmens mit seiner Bank in der Fußzeile, ein Dokument, das keine Rechnung ist), deutsche
Zahlen und Daten und das ZUGFeRD-PDF (Anhang, `/AF`, XMP, Info).
`packages/ooxml/test/docx-text.test.ts`: Absätze, Tabellen, verschachtelte Tabellen, gelöschter
Text, Kopf- und Fußzeilen. `e2e/e-invoice.spec.ts` öffnet `test-files/rechnung.docx` (die
ausgefüllte Rechnungsvorlage), prüft, was der Dialog gelesen hat, ergänzt es, lädt die Rechnung
herunter und liest sie zurück; ein zweiter Test öffnet ein Dokument, das keine Rechnung ist, und
prüft, was laut Dialog fehlt.
