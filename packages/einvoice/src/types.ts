/** Money in hundredths of the currency, as integers: no floating point on amounts. */
export type Cents = number;
/** A tax rate in hundredths of a percent: 19 % is 1900. */
export type BasisPoints = number;
/** A quantity in thousandths. */
export type Millis = number;

/** An e-invoice, read from CII (ZUGFeRD, Factur-X, XRechnung) or UBL. */
export type Invoice = {
  syntax: "cii" | "ubl";
  /** UNTDID 1001: 380 invoice, 381 credit note, 384 corrected invoice, … */
  typeCode: string;
  isCreditNote: boolean;
  number: string;
  /** ISO date, YYYY-MM-DD. */
  issueDate: string;
  dueDate?: string | undefined;
  currency: string;
  seller: Party;
  buyer?: string | undefined;
  buyerReference?: string | undefined;
  serviceFrom?: string | undefined;
  serviceTo?: string | undefined;
  /** By rate; credit notes negative. */
  taxes: Tax[];
  net: Cents;
  tax: Cents;
  /** The total with tax (BT-112). */
  gross: Cents;
  /** The amount due (BT-115), after prepayments and rounding. */
  duePayable: Cents;
  lines: Line[];
  paymentReference?: string | undefined;
  iban?: string | undefined;
};

export type Party = {
  name: string;
  vatId?: string | undefined;
  taxNumber?: string | undefined;
  street?: string | undefined;
  postcode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  email?: string | undefined;
  iban?: string | undefined;
};

export type Tax = {
  rate: BasisPoints;
  /** UNCL 5305: S, Z, E, AE, K, G, O, L, M. */
  category: string;
  base: Cents;
  tax: Cents;
};

export type Line = {
  description: string;
  quantity: Millis;
  unitCode?: string | undefined;
  net: Cents;
  taxRate: BasisPoints;
};

/** Expected failures are values: XML that is no invoice, an amount that does not read. */
export type Read<T> = { ok: true; value: T } | { ok: false; error: string };
