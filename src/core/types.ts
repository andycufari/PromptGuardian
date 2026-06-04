export type RuleMatch =
  | { kind: 'regex'; pattern: string; flags: string }
  | { kind: 'literal'; value: string; accentInsensitive: boolean };

export type Rule = {
  id: string;
  source: 'preset' | 'custom' | 'plain';
  enabled: boolean;
  label: string;
  tokenType: string;
  match: RuleMatch;
};

export type Span = {
  start: number;
  end: number;
  rule: Rule;
  matchedText: string;
};

export type TokenMap = {
  toToken: Map<string, string>;
  toReal: Map<string, string>;
};

export type Vault = {
  rules: Rule[];
  settings: {
    masterEnabled: boolean;
  };
};
