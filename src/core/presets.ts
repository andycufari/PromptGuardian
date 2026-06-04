import { Rule } from './types.js';

export const PRESET_RULES: Rule[] = [
  {
    id: 'preset-email',
    source: 'preset',
    enabled: true,
    label: 'Email',
    tokenType: 'EMAIL',
    match: {
      kind: 'regex',
      pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
      flags: 'gi',
    },
  },
  {
    id: 'preset-cuit',
    source: 'preset',
    enabled: true,
    label: 'CUIT/CUIL',
    tokenType: 'CUIT',
    match: {
      kind: 'regex',
      pattern: '\\b(20|23|24|27|30|33|34)\\-?\\d{8}\\-?\\d\\b',
      flags: 'g',
    },
  },
  {
    id: 'preset-phone-ar',
    source: 'preset',
    enabled: true,
    label: 'Phone (AR)',
    tokenType: 'PHONE',
    match: {
      kind: 'regex',
      pattern: '(?:\\+?54\\s?)?(?:9\\s?)?(?:11|[2-9]\\d{1,3})\\s?\\d{4}[\\s\\-]?\\d{4}\\b',
      flags: 'g',
    },
  },
  {
    id: 'preset-credit-card',
    source: 'preset',
    enabled: true,
    label: 'Credit Card',
    tokenType: 'CARD',
    match: {
      kind: 'regex',
      // 13-19 digits, optionally separated by spaces or dashes
      pattern: '\\b(?:\\d[\\s\\-]?){13,19}\\b',
      flags: 'g',
    },
  },
  {
    id: 'preset-ip',
    source: 'preset',
    enabled: false,
    label: 'IPv4',
    tokenType: 'IP',
    match: {
      kind: 'regex',
      pattern: '\\b(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
      flags: 'g',
    },
  },
  {
    id: 'preset-dni-raw',
    source: 'preset',
    enabled: false,
    label: 'DNI (raw 7-8 digits)',
    tokenType: 'DNI',
    match: {
      kind: 'regex',
      pattern: '\\b\\d{7,8}\\b',
      flags: 'g',
    },
  },
];
