export interface BankLayout {
  version: string;
  name: string;
  description: string;
  locale: string;
  encoding: string;
  header: {
    patterns: {
      [key: string]: {
        regex: string;
        groups: {
          [key: string]: number;
        };
      };
    };
  };
  section_movements: {
    starts_after: string;
    transaction_anchor_regex: string;
    skip_if_name_startswith: string[];
    multiline_capture: {
      until_next_anchor: boolean;
      collapse_whitespace: boolean;
    };
    doc_reference: {
      regex: string;
      take: string;
    };
    date: {
      format_in: string;
      year_hint: string;
    };
    amount: {
      locale: string;
      sign_by_dc: {
        [key: string]: number;
      };
    };
  };
  mapping: {
    trntype: {
      rules: Array<{
        contains?: string[];
        startswith?: string[];
        ofx: string;
      }>;
    };
  };
}

export interface ParsedTransaction {
  date: string;
  description: string;
  value: number;
  balance: number;
  type: "credit" | "debit";
  document?: string;
}
